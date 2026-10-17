<script setup lang="ts">
import { ref } from 'vue'
import { useSessionStore } from '../stores/session'
import { usePlaybackStore } from '../stores/playback'

const store = useSessionStore()
const playback = usePlaybackStore()
const fileInput = ref<HTMLInputElement | null>(null)

function onExport(): void {
  const blob = new Blob([store.exportJson()], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${store.session.name || 'session'}.json`
  a.click()
  URL.revokeObjectURL(url)
}

function onImportClick(): void {
  fileInput.value?.click()
}

async function onFile(e: Event): Promise<void> {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  try {
    store.importJson(await file.text())
    // 导入后刷新进度条上限并让播放进度归零
    playback.reset()
  } catch (err) {
    alert('导入失败：' + (err instanceof Error ? err.message : String(err)))
  }
  input.value = ''
}
</script>

<template>
  <header class="app-topbar bg-dark text-white border-bottom d-flex align-items-center gap-2 px-3 py-2">
    <strong class="me-auto text-truncate d-inline-flex align-items-center gap-1">
      <IBiMusicNoteBeamed />
      music#
    </strong>
    <BButton size="sm" variant="info"
      class="d-inline-flex align-items-center gap-1"
      :disabled="playback.playing"
      @click="store.addTrack()"
    >
      <IBiPlusLg />
      音轨
    </BButton>
    <BButton size="sm" variant="outline-light" @click="onImportClick">导入</BButton>
    <BButton size="sm" variant="outline-light" @click="onExport">导出</BButton>
    <BButton size="sm" variant="outline-light" v-b-toggle.global-settings aria-label="全局设置">
      <IBiGear />
    </BButton>
    <input
      ref="fileInput"
      type="file"
      accept="application/json,.json"
      class="d-none"
      @change="onFile"
    />
  </header>
</template>

<style scoped>
.app-topbar {
  position: sticky;
  top: 0;
  z-index: 10;
}
</style>
