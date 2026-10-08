import type { NoteEvent } from './types'

/**
 * 收集式 musicjs 运行时：与 musicjs 的语义保持一致，
 * 但把生成的音符收集到一个数组里，并额外记录源码位置以便高亮。
 */
export interface MusicRuntime {
  note(tone: number, beats: number, temperament?: number): void
  noteJust(ratio: number, beats: number): void
  noteHz(frequency: number, beats: number): void
  rest(beats: number): void
  bpm: number
  baseFrequency: number
  gain: number
  time: number
  getTime(): number
  setTime(v: number): void
  /** 由解析器在创建音符/休止前设置当前源码位置。 */
  __setPos(start: number, end: number): void
  __notes: NoteEvent[]
}

export function createRuntime(initialBpm = 120, initialBaseFrequency = 440): MusicRuntime {
  let bpm = initialBpm
  let baseFrequency = initialBaseFrequency
  let gain = 0.5
  let time = 0
  let posStart = 0
  let posEnd = 0
  const notes: NoteEvent[] = []

  function noteHz(frequency: number, beats: number): void {
    if (!Number.isFinite(beats)) return
    const start = time
    time += (60 / bpm) * beats
    if (!Number.isFinite(frequency)) return
    notes.push({ start, end: time, frequency, gain, posStart, posEnd })
  }

  function note(tone: number, beats: number, temperament = 12): void {
    noteHz(baseFrequency * 2 ** (tone / temperament), beats)
  }

  function noteJust(ratio: number, beats: number): void {
    noteHz(baseFrequency * ratio, beats)
  }

  function rest(beats: number): void {
    if (!Number.isFinite(beats)) return
    time += (60 / bpm) * beats
  }

  const rt: MusicRuntime = {
    note,
    noteJust,
    noteHz,
    rest,
    get bpm() {
      return bpm
    },
    set bpm(v: number) {
      v = +v
      if (v > 0 && v !== Infinity) bpm = v
    },
    get baseFrequency() {
      return baseFrequency
    },
    set baseFrequency(v: number) {
      v = +v
      if (v > 0 && v !== Infinity) baseFrequency = v
    },
    get gain() {
      return gain
    },
    set gain(v: number) {
      v = +v
      if (v > 0 && v !== Infinity) gain = v
    },
    get time() {
      return time
    },
    set time(v: number) {
      v = +v
      if (Number.isFinite(v)) time = Math.max(0, v)
    },
    getTime() {
      return time
    },
    setTime(v: number) {
      rt.time = v
    },
    __setPos(s: number, e: number) {
      posStart = s
      posEnd = e
    },
    __notes: notes,
  }
  return rt
}
