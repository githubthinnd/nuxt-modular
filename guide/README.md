# nuxt-modular user guide

Everything you need to build a Nuxt application that other teams (or your future self) can extend without touching its
templates: installation, concepts, every feature, deployment and troubleshooting.

| Chapter | You will learn |
|---------|----------------|
| [1. Getting started](./01-getting-started.md) | Install the module, create your first extension in five minutes |
| [2. Core concepts](./02-concepts.md) | Host, extension, manifest, outlet, registry, and why it is SSR-safe |
| [3. Writing extensions](./03-extensions.md) | Directory layout and the complete manifest reference |
| [4. User interface](./04-ui.md) | Outlets, slots, navigation, pages, plugins, error isolation |
| [5. Permissions](./05-permissions.md) | Capabilities, roles and gating UI |
| [6. Server features](./06-server.md) | API routes, the action/filter hook bus, lifecycle events |
| [7. Data: databases, migrations, seeders](./07-data.md) | SQLite, PostgreSQL, MySQL, migrations, seeders, tasks |
| [8. Configuration](./08-configuration.md) | Module options, per-extension settings, environment variables |
| [9. Enabling, disabling and compatibility](./09-toggles-and-compatibility.md) | Toggles, dependencies, version ranges |
| [10. Command line](./10-cli.md) | Scaffolding and validation with `@nuxt-modular/cli` |
| [11. Testing and deployment](./11-testing-and-deployment.md) | Unit tests, CI, production checklist |
| [12. Troubleshooting and FAQ](./12-troubleshooting.md) | Symptoms, causes, fixes |
| [13. API reference](./13-api-reference.md) | Composables, server utilities, core exports |
| [14. Extension architecture](./14-architecture.md) | The standard layout: controllers, services, repositories, composables, components |

New here? Read chapters 1 and 2, then jump to the feature you need. A runnable example lives in the
[`playground/`](https://github.com/githubthinnd/nuxt-modular/tree/master/playground) directory of the repository.

**Conventions.** Code samples use TypeScript and `pnpm`; replace with `npm`/`yarn` as you prefer. "Host" is your Nuxt
app; "extension" is a folder under `extensions/`.
