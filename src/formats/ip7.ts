import { createRuntime, type MusicRuntime } from './runtime'
import type { FormatDef, ParseResult } from './types'

interface StoredNote {
  tone: number
  length: number
  loudness: number
  posStart: number
  posEnd: number
}

// 与参考实现一致的音高表（相对 A4=69 的 MIDI 编号，负数表示噪波鼓点）。
const IP7_TONES: Record<string, number> = {
  '1': 48, '2': 50, '3': 52, '4': 53, '5': 55, '6': 57, '7': 59,
  d: 60, r: 62, m: 64, f: 65, s: 67, l: 69, t: 71,
  D: 72, R: 74, M: 76, F: 77, S: 79, L: 81, T: 83,
  '8': -138, x: -150, X: -162, '9': -142, y: -156, Y: -168,
}

function gcd(a: number, b: number): number {
  while (b !== 0) {
    const tmp = b
    b = a % b
    a = tmp
  }
  return a
}

function reduceFrac(a: number, b: number): [number, number] {
  if (b === 0) return [a, b]
  const g = gcd(a, b)
  return [a / g, b / g]
}

function addFrac(e: number, t: number, l: number, s: number): [number, number] {
  return reduceFrac(e * s + l * t, t * s)
}

function highestPow2of(n: number): number {
  return Math.pow(2, Math.floor(Math.log2(n)))
}

/**
 * 复刻参考实现的预处理：自动补齐括号，去空白，并把「音符 + 连写减号」
 * 重排为「减号 + 音符」。同时维护 `o` 每个下标到原始源码下标的映射。
 */
function preprocess(code: string): { str: string; map: number[] } {
  let extraOpenBrace = 0
  let extraOpenBracket = 0
  let extraCloseBrace = 0
  let extraCloseBracket = 0
  for (let i = 0; i < code.length; i++) {
    const ch = code[i]
    if (ch === '{') extraCloseBrace++
    else if (ch === '}') {
      if (extraCloseBrace > 0) extraCloseBrace--
      else extraOpenBrace++
    } else if (ch === '[') extraCloseBracket++
    else if (ch === ']') {
      if (extraCloseBracket > 0) extraCloseBracket--
      else extraOpenBracket++
    }
  }
  if (code.includes(':') && !code.includes('{') && !code.includes('}')) {
    extraOpenBracket += 1
    extraCloseBracket += 1
  }
  if (code.includes('|') && !code.includes('[') && !code.includes(']')) {
    extraOpenBrace += 1
    extraCloseBrace += 1
  }

  const chars: { ch: string; src: number }[] = []
  for (let i = 0; i < extraOpenBrace; i++) chars.push({ ch: '{', src: -1 })
  for (let i = 0; i < extraOpenBracket; i++) chars.push({ ch: '[', src: -1 })
  for (let i = 0; i < code.length; i++) chars.push({ ch: code[i], src: i })
  for (let i = 0; i < extraCloseBrace; i++) chars.push({ ch: '}', src: -1 })
  for (let i = 0; i < extraCloseBracket; i++) chars.push({ ch: ']', src: -1 })

  const noWs = chars.filter((c) => !/[\n\r\t ]/.test(c.ch))

  const isNoteChar = /^[123456789drmfsltxyDRMFSLTXY_]$/
  const out: { ch: string; src: number }[] = []
  for (let i = 0; i < noWs.length; i++) {
    const cur = noWs[i]
    if (isNoteChar.test(cur.ch)) {
      let j = i + 1
      while (j < noWs.length && noWs[j].ch === '-') j++
      if (j > i + 1) {
        for (let q = i + 1; q < j; q++) out.push(noWs[q])
        out.push(cur)
        i = j - 1
        continue
      }
    }
    out.push(cur)
  }

  return { str: out.map((c) => c.ch).join(''), map: out.map((c) => c.src) }
}

/** ip7 语法的解析器（移植自原始 ip7 实现 tests/reference/ip7.js，并加入源码位置追踪）。 */
export function runIp7(code: string, rt: MusicRuntime, startBeat = 1): void {
  const round3 = (x: number) => Math.round(1e3 * x) / 1e3
  const { str, map } = preprocess(code)

  let sustain = false
  let transpose = 0
  let scaleNum = 1
  let scaleDen = 1
  const repeatStack: { start: number; loopTime: number }[] = []
  const parallelStack: [number, number][] = []
  let timeNum = startBeat
  let timeDen = 1
  let lenNum = 1
  let lenDen = 1
  let tieCount = 1
  let accidental = 0
  let loudnessExp = 0
  let tupletDots = 3

  const notesByTime: Record<string, StoredNote[]> = {}

  for (let i = 0; i < str.length; i++) {
    const ch = str[i]
    if (ch === '*') sustain = !sustain
    else if (ch === '_') {
      const res = addFrac(timeNum, timeDen, tieCount * scaleNum * lenNum, scaleDen * lenDen)
      timeNum = res[0]
      timeDen = res[1]
      lenNum = 1
      lenDen = 1
    } else if (ch === '-') tieCount += 1
    else if (ch === '#') accidental += 1
    else if (ch === 'b') accidental -= 1
    else if (ch === 'p') loudnessExp -= 1
    else if (ch === 'P') loudnessExp += 1
    else if (ch === ',') accidental -= 36
    else if (ch === "'") accidental += 36
    else if (ch === '<') transpose -= 12
    else if (ch === '>') transpose += 12
    else if (ch === '+') transpose += 1
    else if (ch === '=') transpose -= 1
    else if (ch === '(') {
      if (scaleNum % 2 === 0) scaleNum /= 2
      else scaleDen *= 2
    } else if (ch === ')') {
      if (scaleDen % 2 === 0) scaleDen /= 2
      else scaleNum *= 2
    } else if (ch === '.') tupletDots += 1
    else if (ch === '/') {
      if (scaleNum % tupletDots === 0) scaleNum /= tupletDots
      else scaleDen *= tupletDots
      const e2 = highestPow2of(tupletDots)
      if (scaleDen % e2 === 0) scaleDen /= e2
      else scaleNum *= e2
      tupletDots = 3
    } else if (ch === ';') {
      if (scaleDen % tupletDots === 0) scaleDen /= tupletDots
      else scaleNum *= tupletDots
      const e2 = highestPow2of(tupletDots)
      if (scaleNum % e2 === 0) scaleNum /= e2
      else scaleDen *= e2
      tupletDots = 3
    } else if (ch === '{') {
      repeatStack.push({ start: i, loopTime: 0 })
    } else if (ch === ':') {
      const seg = repeatStack[repeatStack.length - 1]
      let depth = 0
      let segCount = 0
      for (let j = seg.start + 1; j < i; j++) {
        if (str[j] === '{') depth++
        else if (str[j] === '}') depth--
        else if (depth === 0 && str[j] === ':') segCount++
      }
      if (segCount === 0) {
        for (segCount = seg.loopTime; segCount-- > 0; ) {
          for (i++, depth = 0; depth !== 0 || str[i] !== ':'; ) {
            if (str[i] === '{') depth++
            else if (str[i] === '}') depth--
            i++
          }
        }
      } else {
        for (depth = 0; depth >= 0; ) {
          if (str[i] === '{') depth++
          else if (str[i] === '}') depth--
          i++
        }
        i -= 2
      }
    } else if (ch === '}') {
      const seg = repeatStack.pop() as { start: number; loopTime: number }
      let depth = 0
      let segCount = 0
      for (let j = seg.start + 1; j < i; j++) {
        if (str[j] === '{') depth++
        else if (str[j] === '}') depth--
        else if (depth === 0 && str[j] === ':') segCount++
      }
      if (segCount === 0) segCount = 2
      seg.loopTime++
      if (!(seg.loopTime < segCount)) continue
      repeatStack.push(seg)
      i = seg.start
    } else if (ch === '[') parallelStack.push([timeNum, timeDen])
    else if (ch === '|') {
      const last = parallelStack[parallelStack.length - 1]
      timeNum = last[0]
      timeDen = last[1]
    } else if (ch === ']') parallelStack.pop()
    else if (ch === '~') {
      lenNum += lenDen
      const res = reduceFrac(lenNum, lenDen)
      lenNum = res[0]
      lenDen = res[1]
    } else if (ch === '!') {
      if (lenNum % 2 === 0) lenNum /= 2
      else lenDen *= 2
    } else if (IP7_TONES[ch] !== undefined) {
      const tone = IP7_TONES[ch] + accidental + transpose
      const key = round3(timeNum / timeDen)
      const length = sustain ? Infinity : round3(((tieCount * scaleNum) / scaleDen) * lenNum / lenDen)
      const loudness = round3(Math.pow(1.5, loudnessExp))
      if (!notesByTime[key]) notesByTime[key] = []
      notesByTime[key].push({ tone, length, loudness, posStart: map[i], posEnd: map[i] + 1 })
      const res = addFrac(timeNum, timeDen, tieCount * scaleNum * lenNum, scaleDen * lenDen)
      timeNum = res[0]
      timeDen = res[1]
      tieCount = 1
      accidental = 0
      lenNum = 1
      lenDen = 1
    }
  }

  for (const key of Object.keys(notesByTime)) {
    const keyNum = Number(key)
    for (const nnote of notesByTime[key]) {
      rt.time = keyNum * (60 / rt.bpm)
      rt.gain = nnote.loudness
      rt.__setPos(nnote.posStart, nnote.posEnd)
      if (nnote.tone > -48) {
        const beats = Number.isFinite(nnote.length)
          ? nnote.length
          : (rt.bpm / 16) * 2 ** ((21 - nnote.tone) / 24)
        rt.note(nnote.tone - 69, beats)
      } else {
        rt.noteHz(-Math.pow(2, -nnote.tone / 12), nnote.length)
      }
    }
  }
}

export const ip7Format: FormatDef = {
  id: 'ip7',
  name: 'ip7',
  description: '移植自网页版谱曲工具的紧凑记谱语法；初始 BPM 作为第二个参数传入。',
  defaultBpm: 240,
  params: [],
  parse(code, opts): ParseResult {
    const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
    // 参考实现从第 2 拍开始（开头有 1 拍休止）；这里去掉该前置休止。
    runIp7(code, rt, 0)
    return { events: rt.__notes, errors: [] }
  },
}
