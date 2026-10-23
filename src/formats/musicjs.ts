import { parse as parseJs } from 'acorn'
import Sval from 'sval'
import { createRuntime, type MusicRuntime } from './runtime'
import type { ParseOptions, ParseResult } from './types'

/** 需要记录源码位置的 musicjs 函数。 */
const POSITIONED_CALLS = new Set(['note', 'noteJust', 'noteHz'])

/** acorn AST 节点（只声明遍历时用到的字段）。 */
interface AstNode {
  type: string
  start: number
  end: number
  [key: string]: unknown
}

function walkAst(node: AstNode, visit: (n: AstNode) => void): void {
  visit(node)
  for (const key of Object.keys(node)) {
    if (key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue
    const child = node[key] as AstNode | AstNode[] | null | undefined
    if (Array.isArray(child)) {
      for (const item of child) {
        if (item && typeof item.type === 'string') walkAst(item, visit)
      }
    } else if (child && typeof child.type === 'string') {
      walkAst(child, visit)
    }
  }
}

/**
 * 在 note() / noteJust() / noteHz() 的调用处记录源码位置。
 *
 * 把 `note(a, b)` 改写成 `__noteAt(start, end, note)(a, b)`：
 * `__noteAt` 返回一个闭包，在真正调用 `note` 之前才执行 `__setPos`，
 * 因此嵌套调用（如 `note(noteHz(...), 1)`）也能记录到正确的位置。
 */
function instrumentPositions(code: string): string {
  const ast = parseJs(code, { ecmaVersion: 'latest', sourceType: 'script' }) as unknown as AstNode
  const edits: { start: number; end: number; text: string }[] = []
  walkAst(ast, (node) => {
    if (node.type !== 'CallExpression') return
    const callee = node.callee as AstNode | undefined
    if (!callee || callee.type !== 'Identifier') return
    const name = callee.name
    if (typeof name !== 'string' || !POSITIONED_CALLS.has(name)) return
    if (node.optional === true) return
    edits.push({
      start: callee.start,
      end: callee.end,
      text: `__noteAt(${node.start},${node.end},${name})`,
    })
  })
  edits.sort((a, b) => b.start - a.start)
  let out = code
  for (const edit of edits) {
    out = out.slice(0, edit.start) + edit.text + out.slice(edit.end)
  }
  return out
}

/**
 * 在 Sval 解释器中执行原生 musicjs 代码，不使用 eval / new Function。
 * 允许使用 note()/noteJust()/noteHz()/rest() 以及 bpm、baseFrequency、gain、time 等变量。
 */
function runMusicjs(code: string, rt: MusicRuntime): void {
  const source = instrumentPositions(code)
  // 通过 with 把运行时作为作用域，使 bpm/time 等访问器读写仍然生效。
  const scope = Object.create(rt) as MusicRuntime & {
    __noteAt: (
      start: number,
      end: number,
      fn: (...args: number[]) => unknown,
    ) => (...args: number[]) => unknown
  }
  scope.__noteAt = (start, end, fn) => (...args) => {
    rt.__setPos(start, end)
    return fn(...args)
  }

  const interpreter = new Sval({
    ecmaVer: 'latest',
    sourceType: 'script',
    sandBox: true,
  })
  interpreter.import('$', scope)
  interpreter.run('with($){\n' + source + '\n}')
}

export function parse(code: string, opts: ParseOptions): ParseResult {
  const rt = createRuntime(opts.bpm, opts.baseFrequency ?? 440)
  const errors: { message: string }[] = []
  try {
    runMusicjs(code, rt)
  } catch (err) {
    errors.push({ message: err instanceof Error ? err.message : String(err) })
  }
  return { events: rt.__notes, errors }
}
