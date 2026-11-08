<script setup lang="ts">
import type { NavigationNode } from '#modular'

defineProps<{ items: readonly NavigationNode[] }>()
</script>

<template>
  <ul class="nav-tree">
    <li v-for="item in items" :key="item.id">
      <NuxtLink v-if="item.path" :to="item.path" class="nav-link">
        <AppIcon v-if="item.icon" :name="item.icon" />
        {{ item.label }}
      </NuxtLink>
      <span v-else class="nav-group">{{ item.label }}</span>
      <NavTree v-if="item.children.length" :items="item.children" />
    </li>
  </ul>
</template>
