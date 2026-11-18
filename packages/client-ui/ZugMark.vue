<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, useId } from 'vue'

// The Zugoid face. The pupils are holes cut by a mask, so the face keeps `currentColor` on any background.
// `state` is what an Agent is doing: idle (looks around), thinking (looks up), working (reads left to right), done (eyes closed).
// `follow` turns the pupils toward the pointer; reduced motion keeps the face still.
const props = withDefaults(defineProps<{
  animated?: boolean
  follow?: boolean
  state?: 'idle' | 'thinking' | 'working' | 'done'
}>(), { animated: true, follow: false, state: 'idle' })

const mask = `zug-${useId()}`
const root = ref<SVGSVGElement>()
const look = ref<{ x: number, y: number } | null>(null)
let frame = 0
let rest: ReturnType<typeof setTimeout> | undefined

function onPointer(event: PointerEvent) {
  cancelAnimationFrame(frame)
  frame = requestAnimationFrame(() => {
    const box = root.value?.getBoundingClientRect()
    if (!box) return
    const dx = event.clientX - (box.left + box.width / 2)
    const dy = event.clientY - (box.top + box.height / 2)
    const distance = Math.hypot(dx, dy) || 1
    const reach = 2 * Math.min(1, distance / 260)
    look.value = { x: dx / distance * reach, y: dy / distance * reach }
    clearTimeout(rest)
    rest = setTimeout(() => { look.value = null }, 2500)
  })
}

onMounted(() => {
  if (props.follow && props.animated && !matchMedia('(prefers-reduced-motion: reduce)').matches)
    window.addEventListener('pointermove', onPointer, { passive: true })
})
onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointer)
  cancelAnimationFrame(frame)
  clearTimeout(rest)
})
</script>

<template>
  <svg ref="root" viewBox="0 0 32 32" fill="currentColor" aria-hidden="true" class="zug" :class="[`zug--${props.state}`, { 'zug--animated': props.animated, 'zug--following': look }]">
    <defs>
      <mask :id="mask" maskUnits="userSpaceOnUse" x="0" y="0" width="32" height="32">
        <rect width="32" height="32" fill="#fff" />
        <g class="zug-pupils" :style="look ? { transform: `translate(${look.x.toFixed(2)}px, ${look.y.toFixed(2)}px)` } : undefined">
          <rect x="5" y="9" width="4" height="4" fill="#000" />
          <rect x="23" y="9" width="4" height="4" fill="#000" />
        </g>
      </mask>
    </defs>
    <g class="zug-eyes" :mask="`url(#${mask})`">
      <rect x="2" y="6" width="10" height="10" />
      <rect x="20" y="6" width="10" height="10" />
    </g>
    <rect class="zug-mouth" x="2" y="22" width="28" height="4" />
  </svg>
</template>

<style scoped>
.zug-eyes, .zug-mouth { transform-box: fill-box; transform-origin: center; }
.zug-pupils { transition: transform 120ms ease-out; }

.zug--animated .zug-eyes { animation: zug-blink 5.2s var(--zug-delay, 0s) infinite; }
.zug--animated.zug--idle:not(.zug--following) .zug-pupils { animation: zug-look 9s ease-in-out var(--zug-delay, 0s) infinite; }
.zug--animated.zug--working:not(.zug--following) .zug-pupils { animation: zug-read 1.4s steps(4, jump-none) var(--zug-delay, 0s) infinite; }
.zug--thinking:not(.zug--following) .zug-pupils { transform: translate(1.5px, -2px); }
.zug--animated.zug--thinking .zug-mouth { animation: zug-hum 2.4s ease-in-out infinite; }
.zug--done .zug-eyes { transform: scaleY(0.25); animation: none; }
.zug--done .zug-mouth { transform: scaleX(0.7); }
.zug--done .zug-pupils { visibility: hidden; }

@keyframes zug-blink {
  0%, 92%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}
@keyframes zug-look {
  0%, 18% { transform: translate(0, 0); }
  24%, 40% { transform: translate(-2px, 0); }
  46%, 60% { transform: translate(2px, 0.5px); }
  66%, 80% { transform: translate(0.5px, -2px); }
  86%, 100% { transform: translate(0, 0); }
}
@keyframes zug-read {
  from { transform: translate(-2px, 0.5px); }
  to { transform: translate(2px, 0.5px); }
}
@keyframes zug-hum {
  0%, 100% { transform: scaleX(1); }
  50% { transform: scaleX(0.6); }
}

@media (prefers-reduced-motion: reduce) {
  .zug-eyes, .zug-pupils, .zug-mouth { animation: none !important; transition: none; }
}
</style>
