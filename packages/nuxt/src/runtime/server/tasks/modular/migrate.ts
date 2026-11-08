import { defineTask } from 'nitropack/runtime'
import { useModularMigrations } from '../../migrations'
import { assertSucceeded, flag, listOption } from '../_shared'

export default defineTask({
  meta: { name: 'modular:migrate', description: 'Run pending extension migrations (payload: extensions, includeInactive)' },
  async run({ payload }) {
    const extensions = listOption(payload, 'extensions')
    const report = await useModularMigrations().up({
      ...(extensions ? { extensions } : {}),
      includeInactive: flag(payload, 'includeInactive'),
    })
    assertSucceeded(report, 'migration')
    return { result: report }
  },
})
