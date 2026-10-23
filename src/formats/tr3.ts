import { createRuntime, type MusicRuntime } from './runtime'
import type { ParseOptions, ParseResult } from './types'

interface Tr3Token {
  text: string
  start: number
  end: number
}

interface Op {
  expr: string
  beats: number
  posStart: number
  posEnd: number
}

function boom(tag: string): never {
  throw new Error('Tr3: 同时使用了互斥后缀 (' + tag + ')')
}

/** 按分隔符与「音符开头」切分，并记录每段在源码中的偏移（等价于参考实现的分词）。 */
function tokenizeTr3(code: string, sep: string): Tr3Token[] {
  const result: Tr3Token[] = []
  const segs: [number, number][] = []
  if (sep === '') {
    for (let i = 0; i < code.length; i++) segs.push([i, i + 1])
  } else {
    let idx = 0
    for (;;) {
      const found = code.indexOf(sep, idx)
      if (found === -1) {
        segs.push([idx, code.length])
        break
      }
      segs.push([idx, found])
      idx = found + sep.length
    }
  }
  for (const [s0, s1] of segs) {
    const seg = code.slice(s0, s1)
    if (/^[\dnzZR]/.test(seg)) {
      let off = s0
      for (const part of seg.split(/(?=[\dnzZR])/)) {
        result.push({ text: part, start: off, end: off + part.length })
        off += part.length
      }
    } else {
      result.push({ text: seg, start: s0, end: s1 })
    }
  }
  return result
}

/** 在 runtime 作用域内求值参考实现生成的表达式（保留赋值表达式与副作用）。 */
function evalExpr(rt: MusicRuntime, expr: string): unknown {
  if (expr === '') return undefined
  return new Function('$', 'with($){return (' + expr + ')}')(rt)
}

/** Tr3 语法的解析器（移植自原始 Tr3 实现 tests/reference/Tr3.js，并加入源码位置追踪）。 */
function runTr3(
  code: string,
  rt: MusicRuntime,
  separator = ';',
  initialBpm = 120,
): void {
  let tempBpm = initialBpm
  let freeze = 0
  let a_T = 0
  let diff = 0
  let lastNoteLength = 1
  const tokens = tokenizeTr3(code, separator)
  const dict: Record<string, number> = {
    '1': -9, '2': -7, '3': -5, '4': -4, '5': -2, '6': 0, '7': 2,
  }
  // o_t / o_T 在参考实现中是函数作用域变量：初始为 undefined，
  // 未赋值时会沿用上次的值。为与参考实现完全一致（含 NaN 传播），这里同样如此。
  let oTexpr = 'undefined'
  let oT: number | undefined = undefined
  const ops: Op[] = []

  for (let i = 0; i < tokens.length; i++) {
    let runit = 1
    const tok = tokens[i]
    const o_t_s = tok.text
    const posStart = tok.start
    const posEnd = tok.end

    if (o_t_s[0] === 'b') {
      oTexpr = 'bpm=' + o_t_s.slice(1)
      oT = 0
      tempBpm = Number(o_t_s.slice(1))
      runit = 0
    }
    if (o_t_s[0] === 'g') {
      oTexpr = 'gain=' + o_t_s.slice(1)
      oT = 0
      runit = 0
    }
    if (o_t_s === 'S') {
      freeze = 1
      a_T -= oT as number
      oT = 0
      runit = 0
    }
    if (o_t_s === 'E') {
      freeze = 0
      oT = 1
      runit = 0
    }
    if (o_t_s[0] === 'r') {
      oTexpr = 'time-=' + (Number(o_t_s.slice(1)) * 60) / tempBpm
      oT = 0
      runit = 0
    }
    if (o_t_s[0] === 'R') {
      oTexpr = 'time-=' + (lastNoteLength * 60) / tempBpm
      oT = 0
      runit = 0
    }
    if (o_t_s[0] === 'h') {
      const suf = o_t_s.slice(1).split('&')
      oTexpr = '[noteHz(' + suf[0] + ',' + suf[1] + '),1][1]'
      oT = 1
      runit = 0
    }
    if (o_t_s[0] === 'j') {
      const back = Number(o_t_s.slice(1))
      tokens.splice(i, 1)
      if (back > -1) {
        i = back - 1
        continue
      } else {
        i += back - 1
        continue
      }
    }
    if (o_t_s[0] === 'm') {
      oTexpr = ''
      oT = 0
      runit = 0
      diff = Number(o_t_s.slice(1))
    }
    if (o_t_s[0] === 'a') {
      oTexpr = ''
      oT = 0
      runit = 0
      dict[o_t_s[1]] += 1
    }
    if (o_t_s[0] === 'c') {
      oTexpr = ''
      oT = 0
      runit = 0
      dict[o_t_s[1]] -= 1
    }
    if (runit) {
      let o_t: number | string = o_t_s[0] === 'n' ? '' : dict[o_t_s[0]] + diff
      oT = 1
      if (o_t_s.length > 1) {
        const down =
          o_t_s.indexOf('.') > 0 && o_t_s.indexOf('_') > 0
            ? boom('A')
            : o_t_s.split('_').length - 1
        const up =
          o_t_s.indexOf('_') > 0 && o_t_s.indexOf('.') > 0
            ? boom('B')
            : o_t_s.split('.').length - 1
        const filterSymbol =
          o_t_s.indexOf('#') > 2 && o_t_s.indexOf('b') > 0
            ? boom('C')
            : o_t_s.split('#').length - 1
        const flatCount =
          o_t_s.indexOf('b') > 2 && o_t_s.indexOf('#') > 0
            ? boom('D')
            : o_t_s.split('b').length - 1
        const aske = o_t_s.split('*').length - 1
        const divm = 2 ** (o_t_s.split('/').length - 1)
        const divn = o_t_s.split('%').length - 1
        const muln = o_t_s.split('$').length - 1
        if (down) {
          o_t = (o_t as number) - 12 * down
        } else if (up) {
          o_t = (o_t as number) + 12 * up
        }
        if (filterSymbol) {
          o_t = (o_t as number) + filterSymbol
        } else if (flatCount) {
          o_t = (o_t as number) - flatCount
        }
        if (aske) oT += aske
        if (divm - 1) oT /= divm
        if (divn) oT /= divn
        if (muln) oT *= muln
      }
      if (o_t_s[0] === 'z') {
        o_t = '[noteHz(-8000,' + oT + '),1][1]'
        oT = 0
      }
      if (o_t_s[0] === 'Z') {
        o_t = '[noteHz(-5657.7,' + oT + '),1][1]'
        oT = 0
      }
      oTexpr = typeof o_t === 'string' ? o_t : String(o_t)
      a_T += (oT as number) * (freeze ? 0 : 1)
      lastNoteLength = oT as number
    }

    ops.push({ expr: oTexpr, beats: oT as number, posStart, posEnd })
    if (freeze) {
      ops.push({ expr: 'time=' + a_T, beats: 0, posStart, posEnd })
    }
  }

  for (const op of ops) {
    rt.__setPos(op.posStart, op.posEnd)
    const val = evalExpr(rt, op.expr)
    rt.note(val as number, op.beats)
  }
}

export function parse(code: string, opts: ParseOptions): ParseResult {
  const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
  const rawSeparator = typeof opts.params.separator === 'string' ? opts.params.separator : ';'
  const separator = rawSeparator === '' ? ';' : rawSeparator
  runTr3(code, rt, separator, opts.bpm)
  return { events: rt.__notes, errors: [] }
}

