import { defineTask } from 'nitropack/runtime'
import { useModularMigrations } from '../../migrations'

export default defineTask({
  meta: { name: 'modular:migrate:status', description: 'Show applied, pending and unknown migrations per extension' },
  async run() {
    return { result: await useModularMigrations().status() }
  },
})
