import { defineTask } from 'nitropack/runtime'
import { useModularMigrations } from '../../migrations'
import { assertSucceeded } from '../_shared'

export default defineTask({
  meta: { name: 'modular:migrate:rollback', description: 'Revert migrations of one extension (payload: extension, steps = 1)' },
  async run({ payload }) {
    const extension = typeof payload.extension === 'string' ? payload.extension : ''
    if (!extension) throw new Error('payload.extension is required, e.g. --payload \'{"extension":"quiz"}\'')
    const steps = Number(payload.steps ?? 1)
    const report = await useModularMigrations().down(extension, Number.isInteger(steps) && steps > 0 ? steps : 1)
    assertSucceeded(report, 'migration')
    return { result: report }
  },
})
