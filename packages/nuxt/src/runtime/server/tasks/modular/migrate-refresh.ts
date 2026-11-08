import { defineTask } from 'nitropack/runtime'
import { useModularMigrations } from '../../migrations'
import { assertSucceeded, flag, listOption } from '../_shared'

export default defineTask({
  meta: { name: 'modular:migrate:refresh', description: 'Revert then re-apply ALL migrations (payload: confirm=true, extensions)' },
  async run({ payload }) {
    if (!flag(payload, 'confirm')) throw new Error('Destructive: pass --payload \'{"confirm":true}\' to refresh every migration')
    const extensions = listOption(payload, 'extensions')
    const report = await useModularMigrations().refresh(extensions ? { extensions } : {})
    assertSucceeded(report, 'migration')
    return { result: report }
  },
})
