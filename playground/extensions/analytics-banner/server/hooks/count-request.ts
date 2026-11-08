import { defineActionHandler } from '#modular'
import { countRequest } from '../store'

/** Subscribed to the Nitro `request` hook bridged by nuxt-modular. */
export default defineActionHandler<'nitro:request'>((event) => {
  if (event.path.startsWith('/api/')) countRequest()
})
