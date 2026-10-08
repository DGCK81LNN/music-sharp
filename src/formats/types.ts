/**
 * 乐谱格式相关的公共类型。
 * FormatId 故意用 string，方便后续注册新的乐谱语法。
 */
export type FormatId = string

/** 一个已解析出的音符事件（时间为秒，相对轨道起点）。 */
export interface NoteEvent {
  start: number
  end: number
  frequency: number
  gain: number
  /** 该音符在乐谱源码中的起始字符下标（用于高亮）。 */
  posStart: number
  /** 该音符在乐谱源码中的结束字符下标（不含）。 */
  posEnd: number
}

export interface ParseError {
  message: string
}

export interface ParseResult {
  events: NoteEvent[]
  errors: ParseError[]
}

/** 某个乐谱语法独有的可配置参数。 */
export interface FormatParamDef {
  key: string
  label: string
  type: 'text' | 'number'
  default: string | number
  help?: string
}

export interface ParseOptions {
  /** 轨道初始 BPM。 */
  bpm: number
  /** 该语法独有的参数。 */
  params: Record<string, string | number | boolean>
  /** 基准音频率。 */
  baseFrequency?: number
}

/** 一种乐谱语法的定义（插件）。新增语法 = 新增一个 FormatDef。 */
export interface FormatDef {
  id: FormatId
  name: string
  description: string
  defaultBpm: number
  params: FormatParamDef[]
  parse(code: string, opts: ParseOptions): ParseResult
}
