// What the host adds to every extension migration context (see server/plugins/migration-context.ts).
declare module '#modular' {
  interface ModularMigrationContext {
    storage: ReturnType<typeof useStorage>
  }
}

declare module '#modular' {
  interface ModularSeederContext {
    storage: ReturnType<typeof useStorage>
  }
}

export {}
