import type { FormatId } from '../formats/types'
import { getFormat } from '../formats/registry'

export interface Track {
  id: string
  name: string
  format: FormatId
  code: string
  /** 相对乐曲起点的开始时间（秒）。 */
  startTime: number
  /** 初始 BPM。 */
  bpm: number
  /** 该乐谱语法独有的参数。 */
  params: Record<string, string | number | boolean>
  muted: boolean
}

export interface Session {
  version: 1
  name: string
  tracks: Track[]
}

export function createId(): string {
  const c = globalThis.crypto
  if (c && typeof c.randomUUID === 'function') return c.randomUUID()
  return 'id-' + Math.random().toString(36).slice(2, 10)
}

export function createTrack(format: FormatId = 'aj'): Track {
  const def = getFormat(format)
  const params: Record<string, string | number | boolean> = {}
  for (const p of def.params) params[p.key] = p.default
  return {
    id: createId(),
    name: '新建音轨',
    format: def.id,
    code: '',
    startTime: 0,
    bpm: def.defaultBpm,
    params,
    muted: false,
  }
}

export function createDefaultSession(): Session {
  const lead = createTrack('aj')
  lead.name = '旋律'
  lead.code = getFormat('aj').example

  return { version: 1, name: '未命名乐曲', tracks: [lead] }
}

/** 把任意来源的对象规整为合法的 Session（用于导入）。 */
export function normalizeSession(input: unknown): Session {
  const obj = (input ?? {}) as Record<string, unknown>
  const rawTracks = Array.isArray(obj.tracks) ? obj.tracks : []
  const tracks: Track[] = rawTracks.map((t) => {
    const o = (t ?? {}) as Record<string, unknown>
    const format = typeof o.format === 'string' ? o.format : 'aj'
    const base = createTrack(format)
    return {
      ...base,
      id: typeof o.id === 'string' ? o.id : createId(),
      name: typeof o.name === 'string' ? o.name : base.name,
      format,
      code: typeof o.code === 'string' ? o.code : '',
      startTime: Number.isFinite(o.startTime) ? Number(o.startTime) : 0,
      bpm: Number.isFinite(o.bpm) ? Number(o.bpm) : base.bpm,
      params: {
        ...base.params,
        ...(typeof o.params === 'object' && o.params ? (o.params as Record<string, never>) : {}),
      },
      muted: Boolean(o.muted),
    }
  })
  return {
    version: 1,
    name: typeof obj.name === 'string' ? obj.name : '未命名乐曲',
    tracks,
  }
}
