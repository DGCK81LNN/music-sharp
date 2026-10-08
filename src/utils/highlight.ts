import type { NoteEvent } from '../formats/types'

export interface HlSpan {
  text: string
  /** 覆盖该片段的音符事件下标（用于播放时高亮）。 */
  ids: number[]
}

export interface HlLine {
  spans: HlSpan[]
  /** 该行首字符在源码中的下标。 */
  start: number
}

/** 把源码按行切分，并在每行内按音符位置切出高亮片段（与时间无关，可缓存）。 */
export function buildLines(code: string, events: NoteEvent[]): HlLine[] {
  const lines: HlLine[] = []
  let lineStart = 0
  for (let i = 0; i <= code.length; i++) {
    if (i === code.length || code[i] === '\n') {
      lines.push(buildLine(code, lineStart, i, events))
      lineStart = i + 1
    }
  }
  return lines
}

function buildLine(
  code: string,
  start: number,
  end: number,
  events: NoteEvent[],
): HlLine {
  const bounds = new Set<number>([start, end])
  const lineEvents: number[] = []
  for (let idx = 0; idx < events.length; idx++) {
    const e = events[idx]
    if (e.posStart >= e.posEnd) continue
    if (e.posStart >= end || e.posEnd <= start) continue
    lineEvents.push(idx)
    bounds.add(Math.max(start, Math.min(end, e.posStart)))
    bounds.add(Math.max(start, Math.min(end, e.posEnd)))
  }

  const sorted = [...bounds].sort((a, b) => a - b)
  const spans: HlSpan[] = []
  for (let k = 0; k < sorted.length - 1; k++) {
    const a = sorted[k]
    const b = sorted[k + 1]
    if (b <= a) continue
    const ids: number[] = []
    for (const idx of lineEvents) {
      const e = events[idx]
      if (e.posStart <= a && e.posEnd >= b) ids.push(idx)
    }
    spans.push({ text: code.slice(a, b), ids })
  }
  return { spans, start }
}
