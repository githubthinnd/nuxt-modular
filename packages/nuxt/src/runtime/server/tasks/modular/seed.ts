import { defineTask } from 'nitropack/runtime'
import { useModularSeeders } from '../../seeders'
import { assertSucceeded, flag, listOption } from '../_shared'

export default defineTask({
  meta: { name: 'modular:seed', description: 'Run extension seeders (payload: extensions, names, includeInactive)' },
  async run({ payload }) {
    const extensions = listOption(payload, 'extensions')
    const names = listOption(payload, 'names')
    const report = await useModularSeeders().run({
      ...(extensions ? { extensions } : {}),
      ...(names ? { names } : {}),
      includeInactive: flag(payload, 'includeInactive'),
    })
    assertSucceeded(report, 'seeder')
    return { result: report }
  },
})
