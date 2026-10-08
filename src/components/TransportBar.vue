<script setup lang="ts">
import { computed, ref } from 'vue'
import { usePlaybackStore } from '../stores/playback'
import { formatTime } from '../utils/time'

const store = usePlaybackStore()
const volume = ref(0.8)
const max = computed(() => Math.max(store.duration, 0.001))
const currentDisplay = computed(() => (Math.round(store.currentTime * 10) / 10).toFixed(1))

function onSeek(v: unknown): void {
  store.seek(Number(v))
}

function onVolume(v: unknown): void {
  const n = Number(v)
  volume.value = n
  store.setVolume(n)
}
</script>

<template>
  <footer class="transport-bar border-top px-3 py-2">
    <div class="d-flex align-items-center gap-2">
      <BButton variant="primary" class="px-3" @click="store.toggle()">
        {{ store.playing ? '⏸ 暂停' : '▶ 播放' }}
      </BButton>
      <BButton
        variant="outline-secondary"
        size="sm"
        title="回到开头"
        @click="store.stop()"
      >
        ⏮
      </BButton>
      <span class="time-label text-nowrap ms-auto">
        {{ formatTime(store.currentTime) }} / {{ formatTime(store.duration) }}
      </span>
    </div>

    <BFormInput
      class="mt-2"
      type="range"
      min="0"
      :max="max"
      step="0.01"
      :model-value="store.currentTime"
      @update:model-value="onSeek"
    />

    <div class="d-flex align-items-center gap-2 mt-1">
      <label class="small text-muted mb-0">秒</label>
      <BFormInput
        type="number"
        size="sm"
        style="max-width: 6rem"
        min="0"
        step="0.1"
        :model-value="currentDisplay"
        @update:model-value="onSeek"
      />
      <label class="small text-muted mb-0 ms-auto">音量</label>
      <BFormInput
        type="range"
        size="sm"
        min="0"
        max="1"
        step="0.01"
        style="max-width: 8rem"
        :model-value="volume"
        @update:model-value="onVolume"
      />
    </div>
  </footer>
</template>

<style scoped>
.transport-bar {
  position: sticky;
  bottom: 0;
  z-index: 10;
  background-color: var(--bs-body-bg, #fff);
}
.time-label {
  font-variant-numeric: tabular-nums;
  color: #6c757d;
}
</style>
