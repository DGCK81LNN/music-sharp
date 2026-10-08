import { createRuntime, type MusicRuntime } from './runtime'
import type { FormatDef, ParseResult } from './types'

interface Pending {
  tone: number
  beats: number
  sustain?: number
  noise?: boolean
  posStart: number
  posEnd: number
}

// 与参考实现一致：下标 1..7 对应 do..ti；其余（0/8/9/未知）为 undefined → NaN → 休止。
const TONES: (number | undefined)[] = [undefined, -9, -7, -5, -4, -2, 0, 2]

/**
 * aj 语法的解析器（移植自原始 aj 实现 tests/reference/aj.js，并加入源码位置追踪）。
 * 运行时参数通过 `rt` 提供，生成的音符写入 `rt.__notes`。
 */
export function runAj(code: string, rt: MusicRuntime): void {
  let dd = 0
  let l = 1
  let m = 1
  let k = 1
  const a: Pending[] = []
  let d = 0
  const t: number[] = []
  let v = 0.5
  rt.gain = 0.5
  v = 0.5
  let i = 0
  let c = ''

  function flush(): void {
    for (const p of a) {
      rt.__setPos(p.posStart, p.posEnd)
      const y = p.tone
      // `y === y` 为 false 表示 NaN（未知音符 → 按休止处理）
      if (y === y) {
        const b = p.beats
        const s = p.sustain
        if (p.noise) rt.noteHz(-8000 * 2 ** (y / 12), s || b)
        else rt.note(y, s || b)
        if (s) rt.rest(b - s)
      } else {
        rt.rest(p.beats)
      }
    }
    a.length = 0
  }

  while (i < code.length) {
    c = code[i++]
    switch (c) {
      case '(':
        l /= 2
        break
      case ')':
        l *= 2
        break
      // 动态 case：仅当 c 是「数字字符串」时匹配（等价于原实现的 `case +c+""`）
      case String(+c): {
        const tone = (TONES[+c] as number) + dd + d
        a.push({ tone, beats: l * k, posStart: i - 1, posEnd: i })
        d = 0
        m = 1
        break
      }
      case 'X':
      case 'x': {
        const tone = c === 'X' ? 0 : -6
        a.push({ tone, beats: l * k, sustain: 0, noise: true, posStart: i - 1, posEnd: i })
        d = 0
        m = 1
        break
      }
      case '.': {
        const last = a[a.length - 1]
        m /= 2
        last.beats += l * m * k
        last.posEnd = i
        break
      }
      case '-': {
        const last = a[a.length - 1]
        last.beats += l * k
        last.posEnd = i
        m = 1
        break
      }
      case ',': {
        const last = a[a.length - 1]
        last.tone -= 12
        last.posEnd = i
        break
      }
      case "'": {
        const last = a[a.length - 1]
        last.tone += 12
        last.posEnd = i
        break
      }
      case 'b':
        --d
        break
      case '#':
        ++d
        break
      case '[':
        flush()
        t.push(rt.time)
        break
      case ']':
        t.pop()
        break
      case '/':
        flush()
        rt.time = t[t.length - 1]
        break
      case '>':
        ++dd
        break
      case '<':
        --dd
        break
      case 'f':
        v = v === 0.75 ? 1 : 0.75
        rt.gain = v
        break
      case 'm':
        v = 0.5
        rt.gain = v
        break
      case 'p':
        v = v === 0.33 ? 0.18 : 0.33
        rt.gain = v
        break
      case 't':
        k = k === 1 ? 2 / 3 : 1
        break
      case 'd': {
        const matched = code.slice(i).match(/^\d*(.\d*)?/)
        const numStr = matched ? matched[0] : ''
        const nv = Number(numStr) || 1
        const e = Math.log2(nv)
        i += numStr.length
        k = e && Number.isInteger(e) ? 0.75 : 2 ** Math.floor(e) / nv
        break
      }
      case 'r': {
        const matched = code.slice(i).match(/^(\d*(.\d*)?):(\d*(.\d*)?)/) || ['']
        i += matched[0].length
        k = (Number(matched[3]) || 1) / Number(matched[1]) || 1
        break
      }
      case 's': {
        const last = a[a.length - 1]
        last.sustain = (last.sustain || last.beats) + l * k
        last.posEnd = i
        break
      }
      case 'S': {
        const last = a[a.length - 1]
        last.sustain = (last.sustain || last.beats) / 2
        last.posEnd = i
        break
      }
    }
  }
  flush()
}

export const ajFormat: FormatDef = {
  id: 'aj',
  name: 'aj',
  description: '受简谱启发的语法：数字 1-7 为音符，配合 . - ' + "' ( ) [ / ] 等符号。",
  defaultBpm: 120,
  params: [],
  parse(code, opts): ParseResult {
    const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
    runAj(code, rt)
    return { events: rt.__notes, errors: [] }
  },
}
