<script setup lang="ts">
/**
 * Host UI kit icon set (24×24 outline, Lucide-style geometry). Extensions
 * reference these names from their manifests (`navigation[].icon`) and may
 * use `<AppIcon>` in their components.
 */
type Shape =
  | { tag: 'path'; d: string }
  | { tag: 'circle'; cx: number; cy: number; r: number }
  | { tag: 'rect'; x: number; y: number; width: number; height: number; rx: number }

const ICONS: Record<string, readonly Shape[]> = {
  sun: [
    { tag: 'circle', cx: 12, cy: 12, r: 4 },
    { tag: 'path', d: 'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41' },
  ],
  moon: [{ tag: 'path', d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }],
  scan: [
    { tag: 'path', d: 'M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2' },
    { tag: 'circle', cx: 12, cy: 12, r: 3 },
  ],
  logo: [
    { tag: 'path', d: 'M12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z' },
    { tag: 'path', d: 'm22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65' },
    { tag: 'path', d: 'm22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65' },
  ],
  dashboard: [
    { tag: 'rect', x: 3, y: 3, width: 7, height: 9, rx: 1.5 },
    { tag: 'rect', x: 14, y: 3, width: 7, height: 5, rx: 1.5 },
    { tag: 'rect', x: 14, y: 12, width: 7, height: 9, rx: 1.5 },
    { tag: 'rect', x: 3, y: 16, width: 7, height: 5, rx: 1.5 },
  ],
  book: [
    { tag: 'path', d: 'M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2z' },
    { tag: 'path', d: 'M22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z' },
  ],
  quiz: [
    { tag: 'rect', x: 8, y: 2, width: 8, height: 4, rx: 1 },
    { tag: 'path', d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' },
    { tag: 'path', d: 'm9 14 2 2 4-4' },
  ],
  chart: [
    { tag: 'path', d: 'M3 3v18h18' },
    { tag: 'path', d: 'M18 17V9' },
    { tag: 'path', d: 'M13 17V5' },
    { tag: 'path', d: 'M8 17v-3' },
  ],
  extensions: [
    { tag: 'rect', x: 14, y: 3, width: 7, height: 7, rx: 1.5 },
    { tag: 'path', d: 'M10 21V8a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5a1 1 0 0 0-1-1H3' },
  ],
  sliders: [
    { tag: 'path', d: 'M20 7h-9' },
    { tag: 'path', d: 'M14 17H5' },
    { tag: 'circle', cx: 17, cy: 17, r: 3 },
    { tag: 'circle', cx: 7, cy: 7, r: 3 },
  ],
  alert: [
    { tag: 'path', d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' },
    { tag: 'path', d: 'M12 9v4' },
    { tag: 'path', d: 'M12 17h.01' },
  ],
  info: [
    { tag: 'circle', cx: 12, cy: 12, r: 10 },
    { tag: 'path', d: 'M12 16v-4' },
    { tag: 'path', d: 'M12 8h.01' },
  ],
  check: [
    { tag: 'circle', cx: 12, cy: 12, r: 10 },
    { tag: 'path', d: 'm9 12 2 2 4-4' },
  ],
  close: [
    { tag: 'path', d: 'M18 6 6 18' },
    { tag: 'path', d: 'm6 6 12 12' },
  ],
  play: [{ tag: 'path', d: 'M6 3.5v17a.5.5 0 0 0 .76.43l13.6-8.5a.5.5 0 0 0 0-.86L6.76 3.07A.5.5 0 0 0 6 3.5Z' }],
  eye: [
    { tag: 'path', d: 'M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0' },
    { tag: 'circle', cx: 12, cy: 12, r: 3 },
  ],
  trend: [
    { tag: 'path', d: 'M22 7 13.5 15.5 8.5 10.5 2 17' },
    { tag: 'path', d: 'M16 7h6v6' },
  ],
  user: [
    { tag: 'circle', cx: 12, cy: 8, r: 4 },
    { tag: 'path', d: 'M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1' },
  ],
  lock: [
    { tag: 'rect', x: 4, y: 11, width: 16, height: 10, rx: 2 },
    { tag: 'path', d: 'M8 11V7a4 4 0 0 1 8 0v4' },
  ],
  arrow: [
    { tag: 'path', d: 'M5 12h14' },
    { tag: 'path', d: 'm12 5 7 7-7 7' },
  ],
  refresh: [
    { tag: 'path', d: 'M3 12a9 9 0 0 1 15.5-6.2L21 8' },
    { tag: 'path', d: 'M21 3v5h-5' },
    { tag: 'path', d: 'M21 12a9 9 0 0 1-15.5 6.2L3 16' },
    { tag: 'path', d: 'M3 21v-5h5' },
  ],
}

const props = withDefaults(defineProps<{ name: string; size?: number }>(), { size: 18 })
const shapes = computed(() => ICONS[props.name] ?? [])
</script>

<template>
  <svg
    v-if="shapes.length"
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.75"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-for="(shape, index) in shapes" :key="index">
      <path v-if="shape.tag === 'path'" :d="shape.d" />
      <circle v-else-if="shape.tag === 'circle'" :cx="shape.cx" :cy="shape.cy" :r="shape.r" />
      <rect v-else :x="shape.x" :y="shape.y" :width="shape.width" :height="shape.height" :rx="shape.rx" />
    </template>
  </svg>
</template>
