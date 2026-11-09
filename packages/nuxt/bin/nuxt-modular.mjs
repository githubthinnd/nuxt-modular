#!/usr/bin/env node
// `npx nuxt-modular <command>`: the same CLI as @nuxt-modular/cli, available right after installing the module.
import { main } from '@nuxt-modular/cli'

process.exitCode = await main(process.argv.slice(2))
