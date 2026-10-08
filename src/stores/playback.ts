import { defineStore } from 'pinia'
import { ref, watch } from 'vue'
import { useSessionStore } from './session'
import { parseTrack } from '../composables/useTrackEvents'
import { AudioEngine, type EngineNote } from '../audio/engine'

export const usePlaybackStore = defineStore('playback', () => {
  const sessionStore = useSessionStore()
  const engine = new AudioEngine()

  const playing = ref(false)
  const currentTime = ref(0)
  const duration = ref(0)
  let rafId = 0

  function buildScore(): EngineNote[] {
    const all: EngineNote[] = []
    let id = 0
    for (const track of sessionStore.tracks) {
      if (track.muted) continue
      const { events } = parseTrack(track)
      for (const e of events) {
        if (!(e.frequency && e.end > e.start && e.gain > 0)) continue
        all.push({
          id: id++,
          start: e.start,
          end: e.end,
          frequency: e.frequency,
          gain: e.gain,
        })
      }
    }
    all.sort((a, b) => a.start - b.start)
    return all
  }

  /** 重新解析所有音轨并更新引擎乐谱与总时长。 */
  function refresh(): void {
    const score = buildScore()
    duration.value = score.reduce((m, n) => Math.max(m, n.end), 0)
    engine.setScore(score, duration.value)
    // 乐谱缩短时把播放位置收回到新的总时长内，避免进度条超出上限
    if (currentTime.value > duration.value) {
      currentTime.value = duration.value
      engine.seek(duration.value)
    }
  }

  // 会话中音轨发生任何变化（增删、排序、改格式、改代码、导入等）时同步总时长，
  // 让进度条的最大值始终与当前乐谱一致。
  watch(() => sessionStore.tracks, () => refresh(), { deep: true })

  function tick(): void {
    if (!playing.value) return
    const t = engine.currentTime()
    if (t >= duration.value) {
      engine.pause()
      playing.value = false
      currentTime.value = duration.value
      return
    }
    currentTime.value = Math.max(0, t)
    rafId = requestAnimationFrame(tick)
  }

  async function play(): Promise<void> {
    refresh()
    if (duration.value <= 0) return
    if (currentTime.value >= duration.value) currentTime.value = 0
    await engine.play(currentTime.value)
    playing.value = true
    cancelAnimationFrame(rafId)
    rafId = requestAnimationFrame(tick)
  }

  function pause(): void {
    engine.pause()
    playing.value = false
    cancelAnimationFrame(rafId)
    currentTime.value = engine.currentTime()
  }

  async function toggle(): Promise<void> {
    if (playing.value) pause()
    else await play()
  }

  function seek(t: number): void {
    const clamped = Math.max(0, Math.min(duration.value, t))
    engine.seek(clamped)
    currentTime.value = clamped
  }

  function stop(): void {
    engine.pause()
    playing.value = false
    cancelAnimationFrame(rafId)
    engine.seek(0)
    currentTime.value = 0
  }

  /** 导入等整体替换乐谱后：停止播放、刷新总时长并回到开头。 */
  function reset(): void {
    stop()
    refresh()
  }

  function setVolume(v: number): void {
    engine.setVolume(v)
  }

  return {
    playing,
    currentTime,
    duration,
    engine,
    refresh,
    play,
    pause,
    toggle,
    seek,
    stop,
    reset,
    setVolume,
  }
})
