<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Track } from '../types/session'
import { formats } from '../formats/registry'
import { parseTrack } from '../composables/useTrackEvents'
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'
import { useSettingsStore } from '../stores/settings'
import TrackCodeView from './TrackCodeView.vue'

const props = defineProps<{ track: Track; index: number; total: number }>()
const store = useSessionStore()
const playback = usePlaybackStore()
const settings = useSettingsStore()
const open = ref(true)

// 代码框的滚动进度比例（0..1）。播放时保存 <pre> 代码视图的状态，
// 停止时恢复文本域的状态，使切换前后滚动位置成比例对应。
const codeScrollRatio = ref(0)
const textareaRef = ref<unknown>(null)

function elementOf(refValue: unknown): HTMLElement | null {
  if (refValue instanceof HTMLElement) return refValue
  const candidate = refValue as { $el?: unknown } | null
  if (candidate && candidate.$el instanceof HTMLElement) return candidate.$el
  return null
}

/** 记录滚动进度比例（文本域滚动时触发）。 */
function captureScroll(e: Event) {
  const el = e.target as HTMLElement
  const max = el.scrollHeight - el.clientHeight
  codeScrollRatio.value = max > 0 ? el.scrollTop / max : 0
}

/** 播放停止、文本域重新出现时，按记录的进度比例恢复其滚动位置。 */
async function restoreTextareaScroll() {
  await nextTick()
  const el = elementOf(textareaRef.value)
  if (!el) return
  const max = el.scrollHeight - el.clientHeight
  el.scrollTop = max > 0 ? codeScrollRatio.value * max : 0
}

const formatDef = computed(
  () => formats.find((f) => f.id === props.track.format) ?? formats[0],
)
const formatOptions = computed(() =>
  formats.map((f) => ({ value: f.id, text: f.name })),
)
const parsed = computed(() => parseTrack(props.track))

const trackWindow = computed(() => {
  const evs = parsed.value.events
  if (!evs.length) return null
  let end = 0
  for (const e of evs) if (e.end > end) end = e.end
  return { start: props.track.startTime, end }
})

const activeNow = computed(() => {
  if (!playback.playing) return true
  const w = trackWindow.value
  if (!w) return false
  return playback.currentTime >= w.start && playback.currentTime < w.end
})

const forceCollapsed = computed(
  () => playback.playing && settings.collapseInactive && !activeNow.value,
)

watch(forceCollapsed, (v) => {
  if (playback.playing) open.value = !v
})

watch(
  () => playback.playing,
  (p) => {
    if (!p) {
      open.value = true
      void restoreTextareaScroll()
    }
  },
)
</script>

<template>
  <BCard
    class="mb-2 track-card"
    :class="{ 'track-selected': store.selectedTrackId === props.track.id }"
    no-body
    @click="store.selectedTrackId = props.track.id"
  >
    <div class="d-flex align-items-center gap-2 p-2">
      <BButton
        size="sm"
        variant="light"
        class="flex-shrink-0"
        :aria-expanded="open ? 'true' : 'false'"
        @click="open = !open"
      >
        {{ open ? '▾' : '▸' }}
      </BButton>
      <BFormInput v-model="track.name" size="sm" class="track-name" />
      <BFormSelect
        :model-value="track.format"
        :options="formatOptions"
        size="sm"
        class="track-format"
        @update:model-value="(v) => store.setFormat(track.id, String(v))"
      />
      <div class="ms-auto d-flex gap-1 flex-shrink-0">
        <BButton
          size="sm"
          :variant="track.muted ? 'secondary' : 'outline-secondary'"
          title="静音"
          @click.stop="track.muted = !track.muted"
        >
          {{ track.muted ? '🔇' : '🔊' }}
        </BButton>
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index === 0"
          title="上移"
          @click="store.moveTrack(track.id, -1)"
        >
          ↑
        </BButton>
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index === total - 1"
          title="下移"
          @click="store.moveTrack(track.id, 1)"
        >
          ↓
        </BButton>
        <BButton
          size="sm"
          variant="outline-danger"
          title="删除"
          @click="store.removeTrack(track.id)"
        >
          ✕
        </BButton>
      </div>
    </div>

    <BCollapse v-model="open">
      <div class="p-2 border-top">
        <TrackCodeView
          v-if="playback.playing"
          :track="track"
          :scroll-ratio="codeScrollRatio"
          @scroll="codeScrollRatio = $event"
        />
        <BFormTextarea
          v-show="!playback.playing"
          ref="textareaRef"
          v-model="track.code"
          rows="5"
          class="score-code"
          :placeholder="`在此输入 ${formatDef.name} 乐谱…`"
          @scroll="captureScroll"
        />
        <div class="small mt-2 text-muted">
          共 {{ parsed.events.length }} 个音符
          <span v-if="parsed.errors.length" class="text-danger">
            · {{ parsed.errors[0].message }}
          </span>
        </div>
      </div>
    </BCollapse>
  </BCard>
</template>

<style scoped>
.track-card {
  border-left: 4px solid #0d6efd;
  cursor: pointer;
}
.track-selected {
  outline: 2px solid #0d6efd;
  outline-offset: -2px;
}
.track-name {
  max-width: 12rem;
}
.track-format {
  max-width: 12rem;
}
</style>
