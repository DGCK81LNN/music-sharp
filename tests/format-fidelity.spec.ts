import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRuntime, type MusicRuntime } from '../src/formats/runtime'
import type { NoteEvent } from '../src/formats/types'
import { runAj } from '../src/formats/aj'
import { runIp7 } from '../src/formats/ip7'
import { runTr3, tokenizeTr3 } from '../src/formats/tr3'

const refDir = resolve(dirname(fileURLToPath(import.meta.url)), 'reference')

/** 把参考实现加载到一个以 `rt` 作为作用域的闭包里，使其 note/noteHz/bpm/time 指向运行时。 */
function loadRef(
  file: string,
  name: string,
  rt: MusicRuntime,
): (...args: unknown[]) => void {
  const text = readFileSync(resolve(refDir, file), 'utf8')
  return new Function('$', 'with($){' + text + '\n; return ' + name + '; }')(rt)
}

type Slim = { start: number; end: number; frequency: number; gain: number }

function slim(events: NoteEvent[]): Slim[] {
  const r = (x: number) => Math.round(x * 1e4) / 1e4
  return events.map((e) => ({
    start: r(e.start),
    end: r(e.end),
    frequency: r(e.frequency),
    gain: r(e.gain),
  }))
}

function refRun(
  file: string,
  name: string,
  bpm: number,
  call: (fn: (...args: unknown[]) => void) => void,
): Slim[] {
  const rt = createRuntime(bpm)
  call(loadRef(file, name, rt))
  return slim(rt.__notes)
}

function ourRun(bpm: number, run: (rt: MusicRuntime) => void): Slim[] {
  const rt = createRuntime(bpm)
  run(rt)
  return slim(rt.__notes)
}

const AJ_SAMPLES = [
  '1234567',
  "1,2'3.4-5|67",
  '(1234)(5671)',
  '[135/246]',
  't123t456',
  'd3 123',
  'p1m2f3',
  '1s2S3',
  'XxX,',
  '#1 b2 >1 <2',
  ">>>>>1231'",
  '1 2 3 (4 5) 6 | 7-',
]

const IP7_SAMPLES = [
  'drmfsltd',
  '1234567',
  'DRMFSLT',
  'd-r-m',
  'd~rm',
  '!!!drm',
  'd_e_fg',
  '[d|f|l][r|m]',
  '{drm:fsl}',
  '{drm:fsl:tdr}',
  '#dbd',
  'pdPd',
  "<d >d +d =d ,d 'd",
  'd*ef',
  '8 9 x y X Y',
  '((drm))',
]

const TR3_SAMPLES = [
  '1;2;3',
  '12345',
  '1.;2*;3/',
  '1#;2b;3',
  'b60;1231',
  'm5;123',
  'r1;1;1',
  '1;3;5',
  '13;r1;57',
  '12345;j-2',
  '1;j2',
  'z;Z;1',
  'n;1;2',
  '1$;1%;1*2',
  'S;1;2;E;3',
]

describe('aj 保真度', () => {
  it.each(AJ_SAMPLES)('%s', (code) => {
    const ref = refRun('aj.js', 'aj', 120, (aj) => aj(code))
    const mine = ourRun(120, (rt) => runAj(code, rt))
    expect(mine).toEqual(ref)
  })
})

describe('ip7 保真度', () => {
  it.each(IP7_SAMPLES)('%s', (code) => {
    const ref = refRun('ip7.js', 'ip7', 240, (ip7) => ip7(code, 240))
    const mine = ourRun(240, (rt) => runIp7(code, rt))
    expect(mine).toEqual(ref)
  })

  it('去掉开头 1 拍休止 (startBeat=0)', () => {
    const code = 'drmfsltd'
    const bpm = 240
    const ref = refRun('ip7.js', 'ip7', bpm, (ip7) => ip7(code, bpm))
    const mine = ourRun(bpm, (rt) => runIp7(code, rt, 0))
    const shift = 60 / bpm
    const r4 = (x: number) => Math.round(x * 1e4) / 1e4
    const expected = ref.map((e) => ({
      ...e,
      start: r4(e.start - shift),
      end: r4(e.end - shift),
    }))
    expect(mine).toEqual(expected)
  })
})

describe('Tr3 保真度', () => {
  it.each(TR3_SAMPLES)('%s', (code) => {
    const ref = refRun('Tr3.js', 'Tr3', 120, (Tr3) => Tr3(code, ';'))
    const mine = ourRun(120, (rt) => runTr3(code, rt, ';', 120))
    expect(mine).toEqual(ref)
  })

  it('自定义分隔符 ,', () => {
    const code = '1,2,3'
    const ref = refRun('Tr3.js', 'Tr3', 120, (Tr3) => Tr3(code, ','))
    const mine = ourRun(120, (rt) => runTr3(code, rt, ',', 120))
    expect(mine).toEqual(ref)
  })
})

describe('Tr3 分词器', () => {
  function refTokens(code: string, sep: string): string[] {
    return code
      .split(sep)
      .flatMap((x) => (/^[\dnzZR]/.test(x) ? x.split(/(?=[\dnzZR])/) : x)) as string[]
  }
  it.each(['1;2;3', '12345', '1.;2*;3/', 'b60;1231', '13;r1;57', 'z;Z'])(
    'tokens: %s',
    (code) => {
      const mine = tokenizeTr3(code, ';').map((t) => t.text)
      expect(mine).toEqual(refTokens(code, ';'))
    },
  )
})

describe('源码位置追踪', () => {
  it('aj 的音符位置能切回源码', () => {
    const code = '1 2 3'
    const rt = createRuntime(120)
    runAj(code, rt)
    for (const ev of rt.__notes) {
      const slice = code.slice(ev.posStart, ev.posEnd)
      expect(['1', '2', '3']).toContain(slice)
    }
  })

  it('ip7 的音符位置能切回源码', () => {
    const code = 'd r m'
    const rt = createRuntime(240)
    runIp7(code, rt)
    for (const ev of rt.__notes) {
      expect(['d', 'r', 'm']).toContain(code.slice(ev.posStart, ev.posEnd))
    }
  })
})
