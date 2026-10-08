export interface EngineNote {
  id: number
  start: number
  end: number
  frequency: number
  gain: number
}

const SAMPLE_RATE = 44100

/**
 * 实时音频引擎：使用前瞻调度器（lookahead scheduler）逐个排程音符，
 * 支持播放 / 暂停 / 跳转，避免一次性创建大量音频节点。
 */
export class AudioEngine {
  private ctx: AudioContext | null = null
  private master: GainNode | null = null
  private wave: PeriodicWave | null = null
  private noiseBuffer: AudioBuffer | null = null
  private score: EngineNote[] = []
  private duration = 0
  private active: { node: AudioScheduledSourceNode; gain: GainNode }[] = []
  private nextIndex = 0
  private startedAt = 0
  private songStart = 0
  private pausedAt = 0
  private playing = false
  private timer: ReturnType<typeof setInterval> | null = null
  private volume = 0.8

  private static readonly LOOKAHEAD = 0.025
  private static readonly SCHEDULE_AHEAD = 0.2

  private ensureCtx(): AudioContext {
    if (!this.ctx) {
      const ctx = new AudioContext()
      const master = ctx.createGain()
      master.gain.value = this.volume
      const cmp = ctx.createDynamicsCompressor()
      cmp.connect(ctx.destination)
      master.connect(cmp)
      this.ctx = ctx
      this.master = master
      this.wave = ctx.createPeriodicWave([0, 0, 0, 0], [0, 1, 1, 1])
      this.noiseBuffer = this.makeNoise(ctx)
      // 浏览器可能在切后台等场景自动挂起 AudioContext：播放中若被挂起则尝试恢复
      ctx.addEventListener('statechange', () => {
        if (this.playing && ctx.state !== 'running') {
          void this.ensureRunning(ctx)
        }
      })
    }
    return this.ctx
  }

  /**
   * 确保 AudioContext 处于运行状态（非 suspended / interrupted）。
   * 需在用户手势调用链中调用，否则部分浏览器会拒绝恢复。
   */
  private async ensureRunning(ctx: AudioContext): Promise<void> {
    if (ctx.state === 'running') return
    try {
      await ctx.resume()
    } catch {
      /* 某些浏览器会拒绝非用户手势的 resume，忽略 */
    }
  }

  private makeNoise(ctx: AudioContext): AudioBuffer {
    const len = 10 * SAMPLE_RATE
    const buf = ctx.createBuffer(1, len, SAMPLE_RATE)
    const data = buf.getChannelData(0)
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1
    return buf
  }

  setScore(notes: EngineNote[], duration: number): void {
    this.score = notes
    this.duration = duration
    if (this.playing) this.retime()
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v))
    if (this.master) this.master.gain.value = this.volume
  }

  getDuration(): number {
    return this.duration
  }

  private findStartIndex(from: number): number {
    let lo = 0
    let hi = this.score.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (this.score[mid].end <= from) lo = mid + 1
      else hi = mid
    }
    return lo
  }

  async play(from: number): Promise<void> {
    const ctx = this.ensureCtx()
    // 点击播放后确保 AudioContext 不处于暂停状态
    await this.ensureRunning(ctx)
    this.songStart = from
    this.pausedAt = from
    this.startedAt = ctx.currentTime + 0.05
    this.nextIndex = this.findStartIndex(from)
    this.playing = true
    this.scheduleWindow()
    this.startTimer()
  }

  private startTimer(): void {
    this.stopTimer()
    this.timer = setInterval(() => this.scheduleWindow(), AudioEngine.LOOKAHEAD * 1000)
  }

  private stopTimer(): void {
    if (this.timer !== null) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  private currentSongTime(): number {
    if (!this.ctx || !this.playing) return this.pausedAt
    return this.songStart + (this.ctx.currentTime - this.startedAt)
  }

  private scheduleWindow(): void {
    const ctx = this.ctx
    if (!ctx || !this.playing) return
    const horizon = this.currentSongTime() + AudioEngine.SCHEDULE_AHEAD
    while (this.nextIndex < this.score.length) {
      const note = this.score[this.nextIndex]
      if (note.start > horizon) break
      this.spawn(note)
      this.nextIndex++
    }
  }

  private spawn(note: EngineNote): void {
    const ctx = this.ctx
    const master = this.master
    if (!ctx || !master) return
    const now = ctx.currentTime
    const effectiveStart = Math.max(note.start, this.songStart)
    const startCtx = Math.max(this.startedAt + (effectiveStart - this.songStart), now)
    const endCtx = this.startedAt + (note.end - this.songStart)
    if (endCtx <= now) return

    const gain = ctx.createGain()
    gain.gain.setValueAtTime(Math.max(0.0001, note.gain), startCtx)
    gain.gain.linearRampToValueAtTime(0, endCtx)
    gain.connect(master)

    let node: AudioScheduledSourceNode
    if (note.frequency < 0) {
      const src = ctx.createBufferSource()
      src.buffer = this.noiseBuffer
      src.loop = true
      src.playbackRate.value = -note.frequency / SAMPLE_RATE
      src.connect(gain)
      node = src
    } else {
      const src = ctx.createOscillator()
      if (this.wave) src.setPeriodicWave(this.wave)
      src.frequency.value = note.frequency
      src.connect(gain)
      node = src
    }

    node.start(startCtx)
    node.stop(endCtx)

    const rec = { node, gain }
    node.addEventListener('ended', () => {
      gain.disconnect()
      const i = this.active.indexOf(rec)
      if (i >= 0) this.active.splice(i, 1)
    })
    this.active.push(rec)
  }

  pause(): void {
    if (!this.playing) return
    this.pausedAt = Math.max(0, this.currentSongTime())
    this.playing = false
    this.stopTimer()
    this.killActive()
  }

  private killActive(): void {
    for (const rec of this.active) {
      try {
        rec.node.stop()
      } catch {
        /* 可能已经停止 */
      }
      rec.gain.disconnect()
    }
    this.active = []
  }

  private retime(): void {
    const from = Math.max(0, this.currentSongTime())
    this.killActive()
    this.songStart = from
    this.startedAt = (this.ctx?.currentTime ?? 0) + 0.05
    this.nextIndex = this.findStartIndex(from)
  }

  seek(t: number): void {
    this.pausedAt = t
    if (this.playing) {
      this.killActive()
      this.songStart = t
      this.startedAt = (this.ctx?.currentTime ?? 0) + 0.05
      this.nextIndex = this.findStartIndex(t)
    }
  }

  currentTime(): number {
    return this.playing ? this.currentSongTime() : this.pausedAt
  }

  isPlaying(): boolean {
    return this.playing
  }
}

