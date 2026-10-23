import { createRuntime, type MusicRuntime } from "./runtime"
import type { ParseOptions, ParseResult } from "./types"
import { parseOnly } from "abcjs/src/api/abc_tunebook"

function runAbc(abc: string, rt: MusicRuntime): void {
  const tune = parseOnly(abc, {})[0]
  if (!tune) throw new TypeError("No tune found")
  const { tempo, tracks } = tune.setUpAudio({
    defaultQpm: rt.bpm,
  })
  rt.bpm = tempo
  for (const track of tracks) {
    for (const event of track) {
      if (event.cmd === "note") {
        rt.time = event.start * (240 / tempo)
        rt.gain = event.volume / 100
        rt.__setPos(event.startChar ?? 0, event.endChar ?? 0)
        rt.note(event.pitch - 69, event.duration * 4)
      }
    }
  }
}

export function parse(abc: string, opts: ParseOptions): ParseResult {
  const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
  try {
    runAbc(abc, rt)
    return { events: rt.__notes, errors: [] }
  } catch (error) {
    return {
      events: rt.__notes,
      errors: [{ message: error instanceof Error ? error.message : String(error) }],
    }
  }
}
