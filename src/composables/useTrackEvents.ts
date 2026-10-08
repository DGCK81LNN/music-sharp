import type { NoteEvent, ParseError } from '../formats/types'
import type { Track } from '../types/session'
import { getFormat } from '../formats/registry'

export interface ParsedTrack {
  events: NoteEvent[]
  errors: ParseError[]
}

/**
 * 解析单条音轨：生成事件并把时间整体平移 `track.startTime`。
 * 结果按轨道内容缓存，避免重复解析。
 */
const cache = new WeakMap<Track, { key: string; value: ParsedTrack }>()

export function parseTrack(track: Track): ParsedTrack {
  const key = JSON.stringify([track.format, track.code, track.bpm, track.params, track.startTime])
  const hit = cache.get(track)
  if (hit && hit.key === key) return hit.value

  let value: ParsedTrack
  try {
    const def = getFormat(track.format)
    const res = def.parse(track.code, {
      bpm: track.bpm,
      params: track.params,
      baseFrequency: 440,
    })
    const events = res.events.map((e) => ({
      ...e,
      start: e.start + track.startTime,
      end: e.end + track.startTime,
    }))
    value = { events, errors: res.errors }
  } catch (err) {
    value = {
      events: [],
      errors: [{ message: err instanceof Error ? err.message : String(err) }],
    }
  }

  cache.set(track, { key, value })
  return value
}
