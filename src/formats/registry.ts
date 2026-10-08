import type { FormatDef } from './types'
import { ajFormat } from './aj'
import { ip7Format } from './ip7'
import { tr3Format } from './tr3'
import { musicjsFormat } from './musicjs'

/** 所有已注册的乐谱语法。新增语法只需在此登记。 */
export const formats: FormatDef[] = [ajFormat, ip7Format, tr3Format, musicjsFormat]

const byId = new Map(formats.map((f) => [f.id, f] as const))

export function getFormat(id: string): FormatDef {
  return byId.get(id) ?? ajFormat
}

export function registerFormat(def: FormatDef): void {
  if (!byId.has(def.id)) formats.push(def)
  byId.set(def.id, def)
}
