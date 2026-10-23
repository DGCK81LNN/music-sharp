import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createRuntime, type MusicRuntime } from '../src/formats/runtime'
import type { ParseOptions, ParseResult } from '../src/formats/types'
import { parse as parseAj } from '../src/formats/aj'
import { parse as parseIp7 } from '../src/formats/ip7'
import { parse as parseIpxf } from '../src/formats/ipxf'
import { getFormat } from '../src/formats/registry'
import { parse as parseTr3 } from '../src/formats/tr3'
import { parse as parseMusicjs } from '../src/formats/musicjs'

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

function slim(events: ParseResult['events']): Slim[] {
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

function ourRun(
  bpm: number,
  code: string,
  parser: (code: string, options: ParseOptions) => ParseResult,
  params: ParseOptions['params'] = {},
): Slim[] {
  return slim(parser(code, { bpm, params, baseFrequency: 440 }).events)
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
  ':12;',
  ':1!3',
  '$1 1 $2 2 %',
  '1@2-@1-',
  '1@1-@2-',
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

const IPXF_SAMPLES = [
  'drmfsltd',
  '1234567',
  '8xX9yY',
  'd/ r+ m- f# sb s\' b,',
  'd.3/ r.2+ m.1-',
  '_(d;r;m)Q',
  '[drm]Q',
  '[d r] m',
  '*d r *',
  '{$1 p}>soft d@soft',
  'd>base $base+',
  '{d r}Q',
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
  'g0.3;1;2',
  'h440&1;2',
  'h220*2&0.5;1',
  'z1;Z2;3',
  'a1;1;1;c1;1',
  'm-5;123',
  'R;1;2',
  '1;R;3',
  '1_2;3.4',
]

describe('aj 保真度', () => {
  it.each(AJ_SAMPLES)('%s', (code) => {
    const ref = refRun('aj.js', 'aj', 120, (aj) => aj(code))
    const mine = ourRun(120, code, parseAj)
    expect(mine).toEqual(ref)
  })
})

describe('ip7 保真度', () => {
  it.each(IP7_SAMPLES)('%s', (code) => {
    const ref = refRun('ip7.js', 'ip7', 240, (ip7) => ip7(code, 240))
    const mine = ourRun(240, code, parseIp7)
    const beatDuration = 60 / 240
    const expected = ref.map((event) => ({
      ...event,
      start: Math.round((event.start - beatDuration) * 1e4) / 1e4,
      end: Math.round((event.end - beatDuration) * 1e4) / 1e4,
    }))
    expect(mine).toEqual(expected)
  })

  it('去掉开头 1 拍休止 (startBeat=0)', () => {
    const code = 'drmfsltd'
    const bpm = 240
    const ref = refRun('ip7.js', 'ip7', bpm, (ip7) => ip7(code, bpm))
    const mine = ourRun(bpm, code, parseIp7)
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

describe('ipxf 保真度', () => {
  it.each(IPXF_SAMPLES)('%s', (code) => {
    const ref = refRun('ipxf.js', 'ipxf', 240, (ipxf) => ipxf(code, 240))
    const mine = ourRun(240, code, parseIpxf)
    expect(mine).toEqual(ref)
  })

  it('格式已注册并将语法错误作为 ParseError 返回', async () => {
    const result = await getFormat('ipxf').parse('d@missing', { bpm: 240, params: {} })
    expect(result.events).toEqual([])
    expect(result.errors).toEqual([{ message: 'NameError: missing' }])
  })
})

describe('abc 基础解析', () => {
  it('解析 ABC 标头、节拍和音符', async () => {
    const code = `X:1
M: 4/4
L: 1/8
K: Emin
D2|EB{c}BA B2 EB|`
    const result = await getFormat('abc').parse(code, { bpm: 180, params: {} })

    expect(result.errors).toEqual([])
    expect(result.events.length).toBeGreaterThan(0)
  })
})

describe('Tr3 保真度', () => {
  it.each(TR3_SAMPLES)('%s', (code) => {
    const ref = refRun('Tr3.js', 'Tr3', 120, (Tr3) => Tr3(code, ';'))
    const mine = ourRun(120, code, parseTr3, { separator: ';' })
    expect(mine).toEqual(ref)
  })

  it('自定义分隔符 ,', () => {
    const code = '1,2,3'
    const ref = refRun('Tr3.js', 'Tr3', 120, (Tr3) => Tr3(code, ','))
    const mine = ourRun(120, code, parseTr3, { separator: ',' })
    expect(mine).toEqual(ref)
  })
})

describe('源码位置追踪', () => {
  it('aj 的音符位置能切回源码', () => {
    const code = '1 2 3'
    const events = parseAj(code, { bpm: 120, params: {} }).events
    for (const ev of events) {
      const slice = code.slice(ev.posStart, ev.posEnd)
      expect(['1', '2', '3']).toContain(slice)
    }
  })

  it('aj 跳转后修饰待处理音符时不扩展源码位置', () => {
    const code = '1@2-@1-'
    const events = parseAj(code, { bpm: 120, params: {} }).events

    expect(events).toHaveLength(1)
    expect(code.slice(events[0].posStart, events[0].posEnd)).toBe('1')
    expect(events[0].end - events[0].start).toBe(1)
  })

  it('ip7 的音符位置能切回源码', () => {
    const code = 'd r m'
    const events = parseIp7(code, { bpm: 240, params: {} }).events
    for (const ev of events) {
      expect(['d', 'r', 'm']).toContain(code.slice(ev.posStart, ev.posEnd))
    }
  })

  it('ipxf 的音符位置能切回源码', () => {
    const code = 'd r m'
    const events = parseIpxf(code, { bpm: 240, params: {} }).events
    for (const event of events) {
      expect(['d', 'r', 'm']).toContain(code.slice(event.posStart, event.posEnd))
    }
  })

  it('Tr3 的音符位置能切回源码', () => {
    const code = '1;2;3'
    const events = parseTr3(code, { bpm: 120, params: {} }).events
    for (const ev of events) {
      expect(['1', '2', '3']).toContain(code.slice(ev.posStart, ev.posEnd))
    }
  })

  it('musicjs 在其调用处记录位置', () => {
    const code = 'note(0, 1); noteJust(2, 1); noteHz(440, 1)'
    const events = parseMusicjs(code, { bpm: 120, params: {} }).events
    expect(events.map((e) => code.slice(e.posStart, e.posEnd))).toEqual([
      'note(0, 1)',
      'noteJust(2, 1)',
      'noteHz(440, 1)',
    ])
  })

  it('musicjs 嵌套调用记录各自的位置', () => {
    const code = 'note(1, [noteHz(440, 1), 1][1])'
    const events = parseMusicjs(code, { bpm: 120, params: {} }).events
    expect(events.map((e) => code.slice(e.posStart, e.posEnd))).toEqual([
      'noteHz(440, 1)',
      code,
    ])
  })
})

describe('musicjs 解释执行', () => {
  it('支持变量、循环与函数', () => {
    const code = `
      bpm = 240
      gain = 0.25
      for (let i = 0; i < 3; i++) note(i, 1)
      const f = (x) => noteJust(x, 0.5)
      f(2)
      rest(1)
    `
    const mine = ourRun(120, code, parseMusicjs)
    expect(mine).toEqual([
      { start: 0, end: 0.25, frequency: 440, gain: 0.25 },
      { start: 0.25, end: 0.5, frequency: 466.1638, gain: 0.25 },
      { start: 0.5, end: 0.75, frequency: 493.8833, gain: 0.25 },
      { start: 0.75, end: 0.875, frequency: 880, gain: 0.25 },
    ])
  })

  it('支持 time 跳转', () => {
    const code = 'note(0, 1); time = 10; note(0, 1)'
    const mine = ourRun(120, code, parseMusicjs)
    expect(mine.map((e) => e.start)).toEqual([0, 10])
  })

  it('语法错误写入 errors 而不是抛出', async () => {
    const res = await getFormat('musicjs').parse('note(', { bpm: 120, params: {} })
    expect(res.events).toEqual([])
    expect(res.errors.length).toBe(1)
  })
})
