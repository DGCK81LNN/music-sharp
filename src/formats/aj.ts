import { createRuntime, type MusicRuntime } from './runtime'
import type { FormatDef, ParseResult } from './types'

interface Pending {
  tone: number
  beats: number
  sustain?: number
  noise?: boolean
  posStart: number
  posEnd: number
  posEndOpen: boolean
}

// 与参考实现一致：下标 1..7 对应 do..ti；其余（0/8/9/未知）为 undefined → NaN → 休止。
const TONES: (number | undefined)[] = [undefined, -9, -7, -5, -4, -2, 0, 2]

/**
 * aj 语法的解析器（移植自原始 aj 实现 tests/reference/aj.js，并加入源码位置追踪）。
 * 运行时参数通过 `rt` 提供，生成的音符写入 `rt.__notes`。
 */
export function runAj(code: string, rt: MusicRuntime): void {
  let toneShift = 0
  let beatLength = 1
  let dotMultiplier = 1
  let tupletScale = 1
  const pendingNotes: Pending[] = []
  let accidental = 0
  const timeStack: number[] = []
  let gain = 0.5
  rt.gain = gain
  let cursor = 0
  const loopStack: [cursor: number, count: number][] = []
  let jumpIndex = 1
  let jumpTargets: Record<number, number> = {}

  function updateLastPosition(end: number): void {
    const lastNote = pendingNotes[pendingNotes.length - 1]
    if (lastNote?.posEndOpen) lastNote.posEnd = end
  }

  function lockLastPosition(): void {
    const lastNote = pendingNotes[pendingNotes.length - 1]
    if (lastNote) lastNote.posEndOpen = false
  }

  function flush(): void {
    for (const pendingNote of pendingNotes) {
      rt.__setPos(pendingNote.posStart, pendingNote.posEnd)
      const tone = pendingNote.tone
      // `tone === tone` 为 false 表示 NaN（未知音符 → 按休止处理）
      if (tone === tone) {
        const beats = pendingNote.beats
        const sustain = pendingNote.sustain
        if (pendingNote.noise) rt.noteHz(-8000 * 2 ** (tone / 12), sustain || beats)
        else rt.note(tone, sustain || beats)
        if (sustain) rt.rest(beats - sustain)
      } else {
        rt.rest(pendingNote.beats)
      }
    }
    pendingNotes.length = 0
  }

  while (cursor < code.length) {
    const currentChar = code[cursor++]
    switch (currentChar) {
      case '(':
        beatLength /= 2
        break
      case ')':
        beatLength *= 2
        break
      // 动态 case：仅当 c 是「数字字符串」时匹配（等价于原实现的 `case +c+""`）
      case String(+currentChar): {
        const tone = TONES[+currentChar]! + toneShift + accidental
        pendingNotes.push({
          tone,
          beats: beatLength * tupletScale,
          posStart: cursor - 1,
          posEnd: cursor,
          posEndOpen: true,
        })
        accidental = 0
        dotMultiplier = 1
        break
      }
      case 'X':
      case 'x': {
        const tone = currentChar === 'X' ? 0 : -6
        pendingNotes.push({
          tone,
          beats: beatLength * tupletScale,
          sustain: 0,
          noise: true,
          posStart: cursor - 1,
          posEnd: cursor,
          posEndOpen: true,
        })
        accidental = 0
        dotMultiplier = 1
        break
      }
      case '.': {
        dotMultiplier /= 2
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.beats += beatLength * dotMultiplier * tupletScale
        updateLastPosition(cursor)
        break
      }
      case '-': {
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.beats += beatLength * tupletScale
        updateLastPosition(cursor)
        dotMultiplier = 1
        break
      }
      case ',': {
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.tone -= 12
        updateLastPosition(cursor)
        break
      }
      case "'": {
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.tone += 12
        updateLastPosition(cursor)
        break
      }
      case 'b':
        accidental--
        break
      case '#':
        accidental++
        break
      case '[':
        flush()
        timeStack.push(rt.time)
        break
      case ']':
        timeStack.pop()
        break
      case '/':
        flush()
        rt.time = timeStack[timeStack.length - 1]
        break
      case '>':
        toneShift++
        break
      case '<':
        toneShift--
        break
      case ':':
        loopStack.push([cursor, 0])
        break
      case ';':
      case '!': {
        const repeatCountText = currentChar === '!' ? code.slice(cursor).match(/^\d*/)?.[0] || '' : ''
        const repeatCount = repeatCountText ? Number(repeatCountText) : 2
        const loop = loopStack[loopStack.length - 1]

        if (loop) loop[1]++
        if (loop && loop[1] < repeatCount) {
          lockLastPosition()
          cursor = loop[0]
        } else {
          loopStack.pop()
          cursor += repeatCountText.length
        }
        break
      }
      case '$': {
        const labelText = code.slice(cursor).match(/^\d*/)?.[0] ?? ''
        if (labelText) {
          cursor += labelText.length
          jumpTargets[Number(labelText)] = cursor
        } else {
          jumpIndex = 1
          jumpTargets = { 0: cursor }
        }
        break
      }
      case '%': {
        const repeatCountText = code.slice(cursor).match(/^\d*/)?.[0] || ''
        const repeatCount = repeatCountText ? Number(repeatCountText) : 2
        jumpIndex++

        if (jumpIndex - 1 < repeatCount) {
          lockLastPosition()
          cursor = jumpTargets[jumpIndex] || jumpTargets[0] || 0
        } else {
          jumpIndex = 1
          cursor += repeatCountText.length
          jumpTargets = { 0: cursor }
        }
        break
      }
      case '@': {
        const selectedIndices = code.slice(cursor).match(/^\d+(@\d+)*/)?.[0]
        if (!selectedIndices) break

        cursor += selectedIndices.length
        const selectedIndexList = selectedIndices.split('@').map(Number)
        if (!selectedIndexList.includes(jumpIndex)) {
          lockLastPosition()
          const nextJumpOffset = code.slice(cursor).search(/[@%]/)
          if (nextJumpOffset < 0) cursor = Infinity
          else cursor += nextJumpOffset
        }
        break
      }
      case 'f':
        gain = gain === 0.75 ? 1 : 0.75
        rt.gain = gain
        break
      case 'm':
        gain = 0.5
        rt.gain = gain
        break
      case 'p':
        gain = gain === 0.33 ? 0.18 : 0.33
        rt.gain = gain
        break
      case 't':
        tupletScale = tupletScale === 1 ? 2 / 3 : 1
        break
      case 'd': {
        const matched = code.slice(cursor).match(/^\d*(\.\d*)?/)
        const numberText = matched ? matched[0] : ''
        const value = Number(numberText) || 1
        const exponent = Math.log2(value)
        cursor += numberText.length
        tupletScale = exponent && Number.isInteger(exponent)
          ? 1.5
          : 2 ** Math.floor(exponent) / value
        break
      }
      case 'r': {
        const matched = code.slice(cursor).match(/^(\d*(\.\d*)?):(\d*(\.\d*)?)/) || ['']
        cursor += matched[0].length
        const numerator = Number(matched[3]) || 1
        const denominator = Number(matched[1])
        tupletScale = numerator / denominator || 1
        break
      }
      case 's': {
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.sustain = (lastNote.sustain || lastNote.beats) + beatLength * tupletScale
        updateLastPosition(cursor)
        break
      }
      case 'S': {
        const lastNote = pendingNotes[pendingNotes.length - 1]
        lastNote.sustain = (lastNote.sustain || lastNote.beats) / 2
        updateLastPosition(cursor)
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
