<script setup lang="ts">
import { computed } from 'vue'
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'
import { formats } from '../formats/registry'
import { trackSettingsVisible } from '../composables/useTrackSettingsModal'

const store = useSessionStore()
const playback = usePlaybackStore()

const track = computed(() => store.selectedTrack)
const visible = computed({
  get: () => trackSettingsVisible.value,
  set: (v: boolean) => {
    trackSettingsVisible.value = v
  },
})
const title = computed(() =>
  track.value?.name ? `音轨设置 · ${track.value.name}` : '音轨设置',
)
const formatDef = computed(() =>
  track.value
    ? formats.find((f) => f.id === track.value!.format) ?? formats[0]
    : formats[0],
)
const formatOptions = computed(() =>
  formats.map((f) => ({ value: f.id, text: f.name })),
)

function onFormatChange(v: unknown): void {
  const t = track.value
  if (t) store.setFormat(t.id, String(v))
}

function setParam(key: string, type: 'text' | 'number', v: unknown): void {
  const t = track.value
  if (!t) return
  t.params[key] = type === 'number' ? Number(v) : String(v)
}
</script>

<template>
  <BModal
    v-model="visible"
    :title="title"
    ok-only
    ok-title="完成"
    body-class="p-3"
    scrollable
  >
    <template v-if="track">
      <fieldset :disabled="playback.playing" class="border-0 p-0 m-0">
        <div class="mb-2">
          <label class="form-label small text-muted mb-0">名称</label>
          <BFormInput v-model="track.name" size="sm" />
        </div>
        <div class="mb-2">
          <label class="form-label small text-muted mb-0">语法</label>
          <BFormSelect
            :model-value="track.format"
            :options="formatOptions"
            size="sm"
            @update:model-value="onFormatChange"
          />
        </div>
        <div class="row g-2">
          <div class="col-6">
            <label class="form-label small text-muted mb-0">开始时间 (s)</label>
            <BFormInput
              v-model.number="track.startTime"
              type="number"
              step="0.1"
              min="0"
              size="sm"
            />
          </div>
          <div class="col-6">
            <label class="form-label small text-muted mb-0">初始 BPM</label>
            <BFormInput
              v-model.number="track.bpm"
              type="number"
              step="1"
              min="1"
              size="sm"
            />
          </div>
        </div>
        <div v-for="p in formatDef.params" :key="p.key" class="mt-2">
          <label class="form-label small text-muted mb-0">{{ p.label }}</label>
          <BFormInput
            :model-value="String(track.params[p.key] ?? '')"
            :type="p.type"
            size="sm"
            @update:model-value="(v) => setParam(p.key, p.type, v)"
          />
        </div>
      </fieldset>
    </template>
  </BModal>
</template>
