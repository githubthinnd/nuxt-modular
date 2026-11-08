import { defineEventHandler, setResponseHeader } from 'h3'
import { extensions } from '#nuxt-modular/devtools-data'
import { useModularServerHooks } from './utils'

const escape = (value: unknown): string =>
  String(value).replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`)

const table = (headers: string[], rows: unknown[][]): string =>
  rows.length
    ? `<table><thead><tr>${headers.map((header) => `<th>${escape(header)}</th>`).join('')}</tr></thead><tbody>${rows
        .map((row) => `<tr>${row.map((cell) => `<td>${escape(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '<p class="muted">None</p>'

/** Development-only HTML report shown in the Nuxt DevTools "Extensions" tab. */
export default defineEventHandler((event) => {
  setResponseHeader(event, 'content-type', 'text/html; charset=utf-8')
  const hooks = useModularServerHooks().listHooks()

  const sections = extensions.map(({ manifest, dir, components, pages, plugins, serverDir }) => {
    const slots = manifest.slots.map((slot, index) => [
      slot.target,
      slot.id ?? `slot-${index}`,
      slot.component,
      components[slot.component] ?? '',
      slot.order,
      JSON.stringify(slot.permission ?? null),
    ])
    const navigation = manifest.navigation.map((item) => [item.id, item.label, item.path ?? '', item.parent ?? '', item.order])
    const serverHooks = hooks
      .filter((hook) => hook.owner === manifest.id)
      .map((hook) => [hook.hook, hook.type, hook.order])
    return `<section>
  <h2>${escape(manifest.name)} <small>${escape(manifest.id)}@${escape(manifest.version)}</small>
    <span class="badge ${manifest.enabled ? 'on' : 'off'}">${manifest.enabled ? 'enabled' : 'disabled by default'}</span></h2>
  <p class="muted">${escape(dir)}${manifest.description ? ` — ${escape(manifest.description)}` : ''}</p>
  <p>Depends on: ${manifest.dependsOn.length ? manifest.dependsOn.map(escape).join(', ') : '—'}
   · Pages: ${pages.length ? pages.map(escape).join(', ') : '—'}
   · Plugins: ${plugins.length} · Server dir: ${serverDir ? escape(serverDir) : '—'}</p>
  <h3>Slots</h3>${table(['Outlet', 'Id', 'Component', 'File', 'Order', 'Permission'], slots)}
  <h3>Navigation</h3>${table(['Id', 'Label', 'Path', 'Parent', 'Order'], navigation)}
  <h3>Server hooks</h3>${table(['Hook', 'Type', 'Order'], serverHooks)}
  <h3>Permissions</h3>${table(['Capability', 'Default roles'], manifest.permissions.map((p) => [p.id, p.defaultRoles.join(', ')]))}
</section>`
  })

  return `<!doctype html><html><head><meta charset="utf-8"><title>Extensions</title><style>
  body{font:14px/1.5 system-ui,sans-serif;margin:16px;color:#1f2328;background:#fff}
  @media (prefers-color-scheme:dark){body{color:#e6edf3;background:#0d1117}th,td{border-color:#30363d!important}}
  h2 small{font-weight:400;opacity:.7;margin-left:6px}
  section{border-bottom:1px solid #8884;padding-bottom:12px;margin-bottom:12px}
  table{border-collapse:collapse;width:100%;margin:4px 0 8px}th,td{border:1px solid #d0d7de;padding:4px 8px;text-align:left;vertical-align:top}
  .muted{opacity:.7}.badge{font-size:11px;padding:2px 6px;border-radius:8px;margin-left:8px;vertical-align:middle}
  .on{background:#1a7f3726;color:#1a7f37}.off{background:#9a670026;color:#9a6700}
</style></head><body><h1>nuxt-modular — ${extensions.length} extension(s)</h1>
${sections.join('\n') || '<p class="muted">No extensions found.</p>'}
<h2>All server hooks</h2>${table(['Hook', 'Type', 'Order', 'Owner'], hooks.map((h) => [h.hook, h.type, h.order, h.owner ?? '']))}
</body></html>`
})
