import { useStorage } from 'nitropack/runtime'
import { createSqlStores, type MigrationLedger, type ReleaseLock } from '@nuxt-modular/core/runtime'
import { useModularConfig } from './config'
import { useModularDatabase } from './database'

/**
 * Where nuxt-modular keeps its own state: the migration ledger, the migration
 * lock and persistent toggles. With `modular.database` it lives in SQL tables
 * (atomic lock, shared by every instance); otherwise in Nitro storage.
 */
export interface ModularStateStore {
  readonly kind: 'sql' | 'storage'
  readonly ledger: MigrationLedger
  acquireLock(name: string, ttlMs: number): Promise<ReleaseLock | undefined>
  readonly toggles: {
    /** Raw stored value; the caller sanitizes it. */
    read(): Promise<unknown>
    write(extensionId: string, active: boolean | null): Promise<void>
  }
}

const names = (value: unknown): string[] => (Array.isArray(value) ? value.filter((name): name is string => typeof name === 'string') : [])

function storageStore(mount: string): ModularStateStore {
  const storage = () => useStorage(mount)
  return {
    kind: 'storage',
    ledger: {
      async applied(extensionId) {
        return names(await storage().getItem(`migrations:${extensionId}`))
      },
      async record(extensionId, name) {
        const applied = names(await storage().getItem(`migrations:${extensionId}`))
        if (!applied.includes(name)) applied.push(name)
        await storage().setItem(`migrations:${extensionId}`, applied)
      },
      async remove(extensionId, name) {
        const applied = names(await storage().getItem(`migrations:${extensionId}`)).filter((entry) => entry !== name)
        await storage().setItem(`migrations:${extensionId}`, applied)
      },
    },
    // Best effort: storage has no compare-and-set. Use a database for a real lock.
    async acquireLock(name, ttlMs) {
      const key = `${name}:lock`
      const held = await storage().getItem(key)
      if (typeof held === 'number' && Date.now() - held < ttlMs) return undefined
      await storage().setItem(key, Date.now())
      return () => storage().removeItem(key)
    },
    toggles: {
      read: () => storage().getItem('toggles'),
      async write(extensionId, active) {
        const raw = await storage().getItem('toggles')
        const current: Record<string, unknown> = typeof raw === 'object' && raw !== null ? { ...(raw as Record<string, unknown>) } : {}
        if (active === null) delete current[extensionId]
        else current[extensionId] = active
        await storage().setItem('toggles', current)
      },
    },
  }
}

let sql: Promise<ModularStateStore> | undefined

export async function useModularStateStore(): Promise<ModularStateStore> {
  const database = await useModularDatabase()
  if (!database) return storageStore(useModularConfig().storage)
  sql ??= (async () => {
    const stores = createSqlStores({ db: database.db, prefix: database.prefix })
    await stores.ensureSchema()
    return { kind: 'sql' as const, ledger: stores.ledger, acquireLock: stores.acquireLock, toggles: stores.toggles }
  })().catch((error: unknown) => {
    sql = undefined
    throw error
  })
  return sql
}
