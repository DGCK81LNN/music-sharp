<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import type { Track } from '../types/session'
import { useParsedTrack } from '../composables/useTrackEvents'
import { usePlaybackStore } from '../stores/playback'
import { usePrefersReducedMotion } from '../composables/usePrefersReducedMotion'
import { useSettingsStore } from '../stores/settings'
import { buildLines } from '../utils/highlight'

const props = defineProps<{ show?: boolean, track: Track; scrollRatio?: number }>()
const emit = defineEmits<{ (e: 'scroll', ratio: number): void }>()
const playback = usePlaybackStore()
const settings = useSettingsStore()
const reduced = usePrefersReducedMotion()

const parsed = useParsedTrack(() => props.track)
const lines = computed(() => buildLines(props.track.code, parsed.value.events))

const activeIds = computed(() => {
  const t = playback.currentTime
  const set = new Set<number>()
  const evs = parsed.value.events
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i]
    if (e.start <= t && t < e.end) set.add(i)
  }
  return set
})

const containerRef = ref<HTMLElement | null>(null)

// 平滑滚动进行中的冷却时间，避免每帧重复触发导致抖动
let scrollCooldownUntil = 0

/**
 * 自动滚动策略：
 * - 取所有正在发声的音符（.sounding）在视口坐标系中的并集；
 * - 若并集「装得下」视口，则把它滚到视口中间，尽量让所有高亮音符同时可见；
 * - 若并集装不下（跨度超过视口高度），则不自动滚动，允许用户在最上/最下高亮音符之间自由滚动。
 * 不依赖换行符，因此对「不换行」的长乐谱同样有效。
 */
function maybeAutoScroll(): void {
  if (!settings.autoScroll) return
  const cont = containerRef.value
  if (!cont) return
  if (!reduced.value && performance.now() < scrollCooldownUntil) return
  const els = cont.querySelectorAll<HTMLElement>('.sounding')
  if (els.length === 0) return
  const contRect = cont.getBoundingClientRect()
  if (contRect.height === 0) return

  let top = Infinity
  let bottom = -Infinity
  for (const el of els) {
    const r = el.getBoundingClientRect()
    if (r.top < top) top = r.top
    if (r.bottom > bottom) bottom = r.bottom
  }

  // 装不下：放行自由滚动，不干预
  if (bottom - top > contRect.height) return

  // 已经全部可见：保持不动
  if (top >= contRect.top && bottom <= contRect.bottom) return

  // 尽量让所有高亮音符同时落入视口：把并集居中
  const viewCenter = (contRect.top + contRect.bottom) / 2
  const unionCenter = (top + bottom) / 2
  const smooth = !reduced.value
  cont.scrollTo({
    top: cont.scrollTop + (unionCenter - viewCenter),
    behavior: smooth ? 'smooth' : 'auto',
  })
  if (smooth) scrollCooldownUntil = performance.now() + 250
}

watch(activeIds, async () => {
  await nextTick()
  maybeAutoScroll()
})

/** 挂载时按传入的进度比例（0..1）恢复滚动位置。 */
function applyScrollRatio() {
  const cont = containerRef.value
  if (!cont) return
  const max = cont.scrollHeight - cont.clientHeight
  cont.scrollTop = max > 0 ? (props.scrollRatio ?? 0) * max : 0
}

/** 把当前滚动进度比例回传给父组件，确保停止播放后仍能对应。 */
function onScroll() {
  const cont = containerRef.value
  if (!cont) return
  const max = cont.scrollHeight - cont.clientHeight
  emit('scroll', max > 0 ? cont.scrollTop / max : 0)
}

watch(() => props.show, (show) => {
  if (show) nextTick().then(applyScrollRatio)
}, { immediate: true })
</script>

<template>
  <pre
    v-show="props.show !== false"
    ref="containerRef"
    class="score-code code-view border bg-body-tertiary"
    :class="{ 'score-code--musicjs': track.format === 'musicjs' }"
    @scroll="onScroll"
    ><template
      v-if="show !== false"
      ><span
        v-for="(line, li) in lines"
        :key="li"
        class="score-line"
      ><span
          v-for="(span, si) in line.spans"
          :key="si"
          :class="{ sounding: span.ids.some((id) => activeIds.has(id)) }"
        >{{ span.text }}</span
      ></span
    ></template
  ></pre>
</template>

<style scoped>
.code-view {
  box-sizing: content-box;
  height: 5lh;
  overflow: auto;
  border-radius: 4px;
  padding: .375rem .75rem;
}
</style>
