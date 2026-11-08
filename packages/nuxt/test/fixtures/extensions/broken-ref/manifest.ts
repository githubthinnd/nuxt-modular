export default {
  id: 'broken-ref',
  name: 'Broken',
  version: '1.0.0',
  slots: [{ target: 'a.b', component: 'DoesNotExist' }],
  serverHooks: [{ hook: 'a:b', handler: './server/hooks/missing.ts' }],
}
