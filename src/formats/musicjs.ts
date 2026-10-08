import { createRuntime, type MusicRuntime } from './runtime'
import type { FormatDef, ParseResult } from './types'

/**
 * 直接执行原生 musicjs 代码。允许使用 note()/noteJust()/noteHz()/rest()
 * 以及 bpm、baseFrequency、gain、time 等变量。
 */
export function runMusicjs(code: string, rt: MusicRuntime): void {
  const fn = new Function('$', 'with($){' + code + '\n}')
  fn(rt)
}

export const musicjsFormat: FormatDef = {
  id: 'musicjs',
  name: 'musicjs',
  description: '直接书写 musicjs 代码，可调用 note()、noteJust()、noteHz()、rest() 等。',
  defaultBpm: 120,
  params: [],
  parse(code, opts): ParseResult {
    const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
    const errors: { message: string }[] = []
    try {
      runMusicjs(code, rt)
    } catch (err) {
      errors.push({ message: err instanceof Error ? err.message : String(err) })
    }
    return { events: rt.__notes, errors }
  },
}
