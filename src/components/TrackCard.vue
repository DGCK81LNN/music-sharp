<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { Track } from '../types/session'
import { formats } from '../formats/registry'
import { useParsedTrack } from '../composables/useTrackEvents'
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'
import { useSettingsStore } from '../stores/settings'
import TrackCodeView from './TrackCodeView.vue'
import FormatPicker from './FormatPicker.vue'
import { openTrackSettings } from '../composables/useTrackSettingsModal'

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
const parsed = useParsedTrack(() => props.track)

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

function openSettings(): void {
  store.selectedTrackId = props.track.id
  openTrackSettings()
}
</script>

<template>
  <BCard class="mb-2 track-card" no-body>
    <div class="d-flex align-items-center gap-2 p-2">
      <BButton
        size="sm"
        variant="outline-secondary"
        class="flex-shrink-0"
        :title="open ? '折叠' : '展开'"
        :aria-expanded="open ? 'true' : 'false'"
        @click="open = !open"
      >
        <IBiCaretDown v-if="open" />
        <IBiCaretRight v-else />
      </BButton>
      <BFormInput
        v-model="track.name"
        :disabled="playback.playing"
        size="sm"
        class="track-name"
        title="名称"
      />
      <FormatPicker
        :model-value="track.format"
        :disabled="playback.playing"
        size="sm"
        class="track-format"
        @update:model-value="(v) => store.setFormat(track.id, String(v))"
      />
      <div class="ms-auto d-flex gap-1 flex-shrink-0">
        <BButton
          size="sm"
          variant="outline-secondary"
          title="音轨属性"
          @click="openSettings"
        >
          <IBiGear />
        </BButton>
        <BButton
          size="sm"
          variant="outline-secondary"
          :pressed="track.muted"
          title="静音"
          @click="track.muted = !track.muted"
        >
          <IBiVolumeMute v-if="track.muted" />
          <IBiVolumeUp v-else />
        </BButton>
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index === 0"
          title="上移"
          @click="store.moveTrack(track.id, -1)"
        >
          <IBiArrowUp />
        </BButton>
        <BButton
          size="sm"
          variant="outline-secondary"
          :disabled="index === total - 1"
          title="下移"
          @click="store.moveTrack(track.id, 1)"
        >
          <IBiArrowDown />
        </BButton>
        <BButton
          size="sm"
          variant="outline-danger"
          title="删除"
          @click="store.removeTrack(track.id)"
        >
          <IBiX />
        </BButton>
      </div>
    </div>

    <BCollapse v-model="open">
      <div class="p-2 border-top">
        <TrackCodeView
          :show="playback.playing"
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
          :class="{ 'score-code--musicjs': track.format === 'musicjs' }"
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
.track-name {
  max-width: 12rem;
}
.track-format {
  max-width: 12rem;
}
</style>
