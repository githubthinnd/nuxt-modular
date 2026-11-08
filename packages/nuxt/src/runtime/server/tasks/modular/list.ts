import { defineTask } from 'nitropack/runtime'
import { useModularToggles } from '../../toggles'

export default defineTask({
  meta: { name: 'modular:list', description: 'List extensions with their activation state' },
  async run() {
    return { result: await useModularToggles().list() }
  },
})
