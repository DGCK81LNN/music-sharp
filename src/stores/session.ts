import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import type { Session, Track } from '../types/session'
import {
  createDefaultSession,
  createTrack,
  normalizeSession,
} from '../types/session'
import { getFormat } from '../formats/registry'

const STORAGE_KEY = 'music-sharp-session'

function loadStored(): Session | null {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY)
    if (!raw) return null
    return normalizeSession(JSON.parse(raw))
  } catch {
    return null
  }
}

export const useSessionStore = defineStore('session', () => {
  const session = ref<Session>(loadStored() ?? createDefaultSession())
  const selectedTrackId = ref<string | null>(null)

  watch(
    session,
    () => {
      try {
        globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(session.value))
      } catch {
        /* 忽略持久化错误 */
      }
    },
    { deep: true },
  )

  const tracks = computed(() => session.value.tracks)
  const selectedTrack = computed(
    () => tracks.value.find((t) => t.id === selectedTrackId.value) ?? null,
  )

  function addTrack(format = 'aj'): Track {
    const t = createTrack(format)
    session.value.tracks.push(t)
    selectedTrackId.value = t.id
    return t
  }

  function removeTrack(id: string): void {
    const i = session.value.tracks.findIndex((t) => t.id === id)
    if (i >= 0) session.value.tracks.splice(i, 1)
    if (selectedTrackId.value === id) selectedTrackId.value = null
  }

  function moveTrack(id: string, dir: -1 | 1): void {
    const i = session.value.tracks.findIndex((t) => t.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= session.value.tracks.length) return
    const arr = session.value.tracks
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }

  function setFormat(id: string, format: string): void {
    const t = session.value.tracks.find((x) => x.id === id)
    if (!t) return
    const def = getFormat(format)
    t.format = def.id
    t.bpm = def.defaultBpm
    const params: Record<string, string | number | boolean> = {}
    for (const p of def.params) params[p.key] = p.default
    t.params = params
  }

  function exportJson(): string {
    return JSON.stringify(session.value, null, 2)
  }

  function importJson(text: string): void {
    session.value = normalizeSession(JSON.parse(text))
    selectedTrackId.value = null
  }

  return {
    session,
    tracks,
    selectedTrackId,
    selectedTrack,
    addTrack,
    removeTrack,
    moveTrack,
    setFormat,
    exportJson,
    importJson,
  }
})
