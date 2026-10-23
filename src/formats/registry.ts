import type { FormatDef, FormatParser } from './types'
import { parse as parseAj } from "./aj"
import { parse as parseIp7 } from "./ip7"
import { parse as parseIpxf } from "./ipxf"
import { parse as parseTr3 } from "./tr3"

type FormatMetadata = Omit<FormatDef, 'parse'>
type FormatLoader = () => Promise<FormatParser>

function lazyFormat(metadata: FormatMetadata, load: FormatLoader): FormatDef {
  return {
    ...metadata,
    parse: async (code, options) => (await load())(code, options),
  }
}

/** 所有已注册的乐谱语法。新增语法只需在此登记。 */
export const formats: FormatDef[] = [
  {
    id: 'aj',
    name: 'aj',
    description: '用符号控制时值、八度、力度和段落跳转的类简谱语法。',
    defaultBpm: 120,
    params: [],
    parse: parseAj,
  },
  {
    id: 'ip7',
    name: 'ip7',
    description: '混用数字与字母音名表示三个八度，并以紧凑符号修饰节奏、音高、力度和分组结构。',
    defaultBpm: 240,
    params: [],
    parse: parseIp7,
  },
  {
    id: 'ipxf',
    name: 'ipxf',
    description: '在ip7的音名基础上扩展语法，支持分组、变奏、函数调用和可配置后缀。',
    defaultBpm: 240,
    params: [],
    parse: parseIpxf,
  },
  {
    id: 'tr3',
    name: 'Tr3',
    description: '以可配置分隔符组织音符和控制项，堆叠低等操作编写音符、节拍与播放控制。',
    defaultBpm: 120,
    params: [{ key: 'separator', label: '分隔符', type: 'text', default: ';' }],
    parse: parseTr3,
  },
  lazyFormat(
    {
      id: 'abc',
      name: 'abc',
      description: '使用 abcjs 解析标准 ABC 记谱法，基于五线谱描述旋律，支持自动和弦。',
      defaultBpm: 180,
      params: [],
    },
    () => import('./abc').then((module) => module.parse),
  ),
  lazyFormat(
    {
      id: 'musicjs',
      name: 'musicjs',
      description: '直接编写 JavaScript，精确控制音高、时值、速度、音量和时间。',
      defaultBpm: 120,
      params: [],
    },
    () => import('./musicjs').then((module) => module.parse),
  ),
]

const byId = new Map(formats.map((f) => [f.id, f] as const))

export function getFormat(id: string): FormatDef {
  return byId.get(id) ?? formats[0]
}

export function registerFormat(def: FormatDef): void {
  if (!byId.has(def.id)) formats.push(def)
  byId.set(def.id, def)
}
