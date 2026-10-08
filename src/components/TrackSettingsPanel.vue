<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'
import { formats } from '../formats/registry'

const store = useSessionStore()
const playback = usePlaybackStore()
const open = ref(true)

const track = computed(() => store.selectedTrack)
const formatDef = computed(() =>
  track.value
    ? formats.find((f) => f.id === track.value!.format) ?? formats[0]
    : formats[0],
)
const formatOptions = computed(() =>
  formats.map((f) => ({ value: f.id, text: f.name })),
)

watch(
  () => store.selectedTrackId,
  () => {
    open.value = true
  },
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
  <div v-if="track && !playback.playing" class="settings-panel">
    <button type="button" class="settings-handle" @click="open = !open">
      <span class="text-truncate">⚙ {{ track.name || '音轨设置' }}</span>
      <span class="ms-2">{{ open ? '▾' : '▴' }}</span>
    </button>
    <BCollapse v-model="open">
      <div class="settings-body">
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
      </div>
    </BCollapse>
  </div>
</template>

<style scoped>
.settings-panel {
  position: fixed;
  z-index: 20;
  background: #fff;
  box-shadow: 0 -2px 12px rgba(0, 0, 0, 0.15);
  border: 1px solid #dee2e6;
}
.settings-handle {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  border: 0;
  background: #f1f3f5;
  padding: 0.5rem 0.75rem;
  font-weight: 600;
  text-align: left;
}
.settings-body {
  padding: 0.75rem;
  max-height: 50vh;
  overflow: auto;
}
/* 窄屏：贴底浮动 */
@media (max-width: 991.98px) {
  .settings-panel {
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 12px 12px 0 0;
  }
}
/* 宽屏：停靠右侧 */
@media (min-width: 992px) {
  .settings-panel {
    right: 1rem;
    bottom: 1rem;
    width: 20rem;
    border-radius: 8px;
  }
}
</style>
