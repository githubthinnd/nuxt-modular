# 14. Extension architecture

Every extension created by `nuxt-modular make:extension` or by the guided setup follows one layout. An unfamiliar
extension then reads the same way as your own: you know where the rules, the queries and the screens live.

## The layers

```
extensions/blog/
  manifest.ts                          what the extension contributes (menu, slot, permission)
  shared/
    item.ts                            types and validation used by both sides
  server/                              back end
    api/blog/items/
      index.get.ts                     controllers: request in, response out
      index.post.ts
      [id].delete.ts
    services/item.service.ts           business rules
    repositories/item.repository.ts    data access (SQL or Nitro storage)
    migrations/001-create-items.ts     schema, run in order (SQL only)
    seeders/001-demo-items.ts          demo data (SQL only)
  composables/useBlogItems.ts          front end: the only code that calls the API
  components/
    BlogItemList.vue                   presentational
    BlogItemForm.vue                   presentational
    BlogWidget.vue                     card shown in an outlet of the host
  pages/blog/index.vue                 container: composable + components
```

| Layer | Responsibility | Must not |
|-------|----------------|----------|
| Controller (`server/api`) | Read the request, validate it with `shared/`, call one service, shape the response | Hold rules or write queries |
| Service (`server/services`) | Business rules and orchestration; throws `createError(...)` for rule violations | Read the request or know how data is stored |
| Repository (`server/repositories`) | The only code that touches the database or storage; returns plain objects | Contain rules or HTTP concerns |
| Shared (`shared/`) | Types and pure validation used on both sides | Import Nuxt, Vue or Nitro |
| Composable (`composables/`) | Typed state and actions for the app; the only place that knows the API routes | Render anything |
| Component (`components/`) | Props in, events out | Fetch data or touch stores |
| Page (`pages/`) | Container: gets state from a composable and hands it to components | Contain markup that belongs in a component |

The request flows down and the data flows back up:

```
page -> composable -> $fetch -> controller -> service -> repository -> database
```

## Why this layout

- **Replaceable data source.** Only the repository knows if items live in SQL or in Nitro storage. A project starts
  without a database, adds one later with `nuxt-modular db`, and only the repository is rewritten.
- **Validation once.** `shared/item.ts` validates on the server and in the form, so the message the user sees is the
  message the API would send.
- **Testable.** Services and `shared/` are plain functions; they need no HTTP server.
- **Predictable.** A reviewer opening any extension finds the same folders.

## Imports

- Server layers import each other with relative paths (`../services/item.service`). The explicit path shows the
  direction of the dependencies; Nitro auto-imports (`defineEventHandler`, `createError`, `useModularDatabase`,
  `useStorage`) still work in every layer.
- `composables/` and `utils/` of an extension are auto-imported in its pages and components, like those of the host.
- Both sides import `shared/` with relative paths. Use `import type` for types.

## Adding to an extension

```bash
npx nuxt-modular make:service blog posts          # server/services/posts.service.ts
npx nuxt-modular make:repository blog posts       # server/repositories/posts.repository.ts (SQL or storage, detected)
npx nuxt-modular make:composable blog posts       # composables/usePosts.ts
npx nuxt-modular make:api blog "posts/[id]" --method get
npx nuxt-modular make:component blog PostCard
npx nuxt-modular make:migration blog "create posts"
```

`make:extension` picks SQL when `modular.database` is configured in `nuxt.config.ts` and Nitro storage otherwise;
`--roles admin,editor` sets who may see it.

## When to bend the rules

The layout is a default, not a gate. A read-only extension can skip the repository and read `useStorage` in its
service; a widget with static content needs no composable. `nuxt-modular validate` only checks the manifest and its
references, so a smaller extension is always valid. What matters is that the **direction** stays the same:
controllers call services, services call repositories, and the front end reaches the server only through a
composable.
