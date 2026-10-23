import { onScopeDispose, shallowRef, watch } from 'vue'
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
const cache = new WeakMap<Track, { key: string; value: Promise<ParsedTrack> }>()

function cacheKey(track: Track): string {
  return JSON.stringify([track.format, track.code, track.bpm, track.params, track.startTime])
}

export function parseTrack(track: Track): Promise<ParsedTrack> {
  const key = cacheKey(track)
  const hit = cache.get(track)
  if (hit && hit.key === key) return hit.value

  const value = (async (): Promise<ParsedTrack> => {
    try {
      const def = getFormat(track.format)
      const result = await def.parse(track.code, {
        bpm: track.bpm,
        params: track.params,
        baseFrequency: 440,
      })
      const events = result.events.map((event) => ({
        ...event,
        start: event.start + track.startTime,
        end: event.end + track.startTime,
      }))
      return { events, errors: result.errors }
    } catch (error) {
      return {
        events: [],
        errors: [{ message: error instanceof Error ? error.message : String(error) }],
      }
    }
  })()

  cache.set(track, { key, value })
  return value
}

export function useParsedTrack(getTrack: () => Track) {
  const parsed = shallowRef<ParsedTrack>({ events: [], errors: [] })
  let latestRequest = 0

  watch(
    () => cacheKey(getTrack()),
    () => {
      const request = ++latestRequest
      void parseTrack(getTrack()).then((result) => {
        if (request === latestRequest) parsed.value = result
      })
    },
    { immediate: true },
  )

  onScopeDispose(() => {
    latestRequest += 1
  })

  return parsed
}
