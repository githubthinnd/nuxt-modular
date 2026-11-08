import { defineTask } from 'nitropack/runtime'
import { useModularMigrations } from '../../migrations'
import { assertSucceeded, flag, listOption } from '../_shared'

export default defineTask({
  meta: { name: 'modular:migrate:reset', description: 'Revert ALL migrations (payload: confirm=true, extensions)' },
  async run({ payload }) {
    if (!flag(payload, 'confirm')) throw new Error('Destructive: pass --payload \'{"confirm":true}\' to revert every migration')
    const extensions = listOption(payload, 'extensions')
    const report = await useModularMigrations().reset(extensions ? { extensions } : {})
    assertSucceeded(report, 'migration')
    return { result: report }
  },
})
