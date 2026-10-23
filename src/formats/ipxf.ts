import { createRuntime, type MusicRuntime } from './runtime'
import type { ParseOptions, ParseResult } from './types'

interface NoteAtom {
  kind: 'note'
  midi: number
  posStart: number
  posEnd: number
}

interface RestAtom {
  kind: 'rest'
}

interface VariableAtom {
  kind: 'variable'
  name: string
}

interface GroupAtom {
  kind: 'group'
  items: ParsedNode[]
}

interface BracketAtom {
  kind: 'bracket'
  items: ParsedNode[]
}

interface TupleAtom {
  kind: 'tuple'
  elements: ParsedNode[][]
}

interface FunctionAtom {
  kind: 'function'
  body: ParsedNode[]
}

type Atom = NoteAtom | RestAtom | VariableAtom | GroupAtom | BracketAtom | TupleAtom | FunctionAtom
type SuffixArgument = number | 'd2' | undefined

interface Suffix {
  op: string
  argument?: SuffixArgument
  name?: string
  body?: ParsedNode[]
}

interface ItemNode {
  type: 'item'
  atom: Atom
  suffixes: Suffix[]
}

interface DefinitionNode {
  type: 'definition'
  name: string
  atom: Atom
  suffixes: Suffix[]
}

interface PedalNode {
  type: 'pedal'
}

type ParsedNode = ItemNode | DefinitionNode | PedalNode

interface NoteValue {
  kind: 'value'
  isRest: boolean
  dt: number
  dur: number
  velocity: number
  midi?: number
  link: boolean
  relativeTime?: number
  done?: boolean
  posStart: number
  posEnd: number
}

interface SequenceValue {
  kind: 'sequence'
  items: Value[]
  bracketed: boolean
}

interface TupleValue {
  kind: 'tuple'
  elements: SequenceValue[]
}

interface FunctionValue {
  kind: 'function'
  atom: FunctionAtom
  chain: Suffix[]
}

type Value = NoteValue | SequenceValue | TupleValue | FunctionValue

interface Scope {
  variables: Map<string, Value>
  parent: Scope | null
  pedalOn: boolean
  pending: NoteValue[]
}

const PITCH: Record<string, number> = {
  '1': 48, '2': 50, '3': 52, '4': 53, '5': 55, '6': 57, '7': 59,
  d: 60, r: 62, m: 64, f: 65, s: 67, l: 69, t: 71,
  D: 72, R: 74, M: 76, F: 77, S: 79, L: 81, T: 83,
  '8': -138, x: -150, X: -162, '9': -142, y: -156, Y: -168,
}

const DEFAULT_ARGUMENT_1: Record<string, number> = {
  '/': 2, '+': 2, '-': 1, '#': 1, b: 1, "'": 3, ',': 3,
  p: 1.5, P: 1.5, '!': 2, '~': 2, '%': 1,
}

const DEFAULT_ARGUMENT_2: Record<string, number> = {
  '/': 3, '+': 3, '-': 5, '#': 4, b: 4, "'": 1, ',': 1,
  p: 2, P: 2, '!': 4, '~': Infinity, '%': 0.5,
}

const SUFFIXES = "/+-#b',pP!~%&Q"

function parseIpxf(source: string): ParsedNode[] {
  let position = 0
  const sourceLength = source.length

  function skipWhitespace(): void {
    while (position < sourceLength && ' \t\n\r'.includes(source[position])) position += 1
  }

  function readIdentifier(): string {
    let identifier = ''
    while (position < sourceLength && /[A-Za-z0-9_]/.test(source[position])) {
      identifier += source[position]
      position += 1
    }
    return identifier
  }

  function readDigits(): number | undefined {
    const start = position
    while (position < sourceLength && source[position] >= '0' && source[position] <= '9') {
      position += 1
    }
    return position === start ? undefined : Number.parseInt(source.slice(start, position), 10)
  }

  function parseSequence(stopCharacters: string[]): ParsedNode[] {
    const nodes: ParsedNode[] = []
    for (;;) {
      skipWhitespace()
      if (position >= sourceLength) return nodes

      const character = source[position]
      if (stopCharacters.includes(character)) return nodes
      if (character === ')' || character === ']' || character === '}') {
        throw new Error(`Too much ${character}`)
      }
      if (character === ';') {
        position += 1
        continue
      }
      if (character === '*') {
        position += 1
        nodes.push({ type: 'pedal' })
        continue
      }
      if (character === '>') throw new Error('Expected item before >')

      const item = parseItem()
      if (item) nodes.push(item)
    }
  }

  function parseGroup(): GroupAtom | TupleAtom {
    position += 1
    const elements: ParsedNode[][] = []
    let current = parseSequence([';', ')'])

    for (;;) {
      skipWhitespace()
      if (position >= sourceLength) throw new Error('Unmatched (')

      const character = source[position]
      if (character === ';') {
        position += 1
        elements.push(current)
        current = parseSequence([';', ')'])
        continue
      }
      if (character === ')') {
        position += 1
        elements.push(current)
        break
      }
      throw new Error(`Unmatched ${character}`)
    }

    return elements.length === 1
      ? { kind: 'group', items: elements[0] }
      : { kind: 'tuple', elements }
  }

  function parseItem(): ItemNode | DefinitionNode | null {
    const atom = parseAtom()
    if (!atom) return null

    const suffixes: Suffix[] = []
    for (;;) {
      skipWhitespace()
      if (position >= sourceLength) break

      const character = source[position]
      if (character === '{') {
        position += 1
        const body = parseSequence(['}'])
        skipWhitespace()
        if (position >= sourceLength || source[position] !== '}') throw new Error('Unmatched {')
        position += 1
        suffixes.push({ op: 'call', body })
        continue
      }
      if (character === '>') {
        position += 1
        const name = readIdentifier()
        if (!name) throw new Error('Expected identifier after >')
        return { type: 'definition', name, atom, suffixes }
      }
      if (character === '@') {
        position += 1
        const name = readIdentifier()
        if (!name) throw new Error('Expected identifier after @')
        suffixes.push({ op: '@', name })
        continue
      }
      if (character === '.') {
        position += 1
        const first = readDigits()
        let second: number | undefined
        if (position < sourceLength && source[position] === '.') {
          position += 1
          second = readDigits()
        }

        let argument: SuffixArgument
        if (second !== undefined) argument = (first !== undefined ? first : 1) / second
        else if (first !== undefined) argument = first
        else argument = 'd2'

        skipWhitespace()
        if (position < sourceLength && SUFFIXES.includes(source[position])) {
          suffixes.push({ op: source[position], argument })
          position += 1
        }
        continue
      }
      if (SUFFIXES.includes(character)) {
        suffixes.push({ op: character })
        position += 1
        continue
      }
      break
    }

    return { type: 'item', atom, suffixes }
  }

  function parseAtom(): Atom | null {
    skipWhitespace()
    if (position >= sourceLength) return null

    const start = position
    const character = source[position]
    const midi = PITCH[character]
    if (midi !== undefined) {
      position += 1
      return { kind: 'note', midi, posStart: start, posEnd: position }
    }
    if (character === '_') {
      position += 1
      return { kind: 'rest' }
    }
    if (character === '$') {
      position += 1
      const name = readIdentifier()
      if (!name) throw new Error('Expected identifier after $')
      return { kind: 'variable', name }
    }
    if (character === '(') return parseGroup()
    if (character === '[') {
      position += 1
      const items = parseSequence([']'])
      skipWhitespace()
      if (position >= sourceLength || source[position] !== ']') throw new Error('Unmatched [')
      position += 1
      return { kind: 'bracket', items }
    }
    if (character === '{') {
      position += 1
      const body = parseSequence(['}'])
      skipWhitespace()
      if (position >= sourceLength || source[position] !== '}') throw new Error('Unmatched {')
      position += 1
      return { kind: 'function', body }
    }

    position += 1
    return null
  }

  return parseSequence([])
}

function createScope(parent: Scope | null): Scope {
  return {
    variables: new Map(),
    parent,
    pedalOn: parent?.pedalOn ?? false,
    pending: [],
  }
}

function exitScope(scope: Scope): void {
  for (const note of scope.pending) {
    note.dur = Infinity
    note.link = false
  }
  scope.pending.length = 0
}

function lookup(scope: Scope, name: string): Value | undefined {
  for (let current: Scope | null = scope; current; current = current.parent) {
    if (current.variables.has(name)) return current.variables.get(name)
  }
  return undefined
}

function togglePedal(scope: Scope, offset: number): void {
  if (!scope.pedalOn) {
    scope.pedalOn = true
    return
  }

  for (const note of scope.pending) {
    let duration = offset - (note.relativeTime as number)
    if (Number.isNaN(duration)) {
      if (offset === Infinity || note.relativeTime === Infinity) duration = Infinity
      else throw new Error('NaN')
    }
    note.dur = duration
    note.link = false
  }
  scope.pending.length = 0
  scope.pedalOn = false
}

function advanceOf(value: Value): number {
  if (value.kind === 'function' || value.kind === 'tuple') return 0
  if (value.kind === 'sequence') {
    if (value.bracketed) return 0
    return value.items.reduce((total, item) => total + advanceOf(item), 0)
  }
  return value.dt
}

function walk(value: Value, base: number, scope: Scope): void {
  if (value.kind === 'sequence') {
    let offset = 0
    for (const item of value.items) {
      walk(item, base + offset, scope)
      offset += advanceOf(item)
    }
    return
  }
  if (value.kind !== 'value' || value.isRest) return

  value.relativeTime = base
  if (!value.done) {
    value.done = true
    if (scope.pedalOn) scope.pending.push(value)
  }
}

function cloneValue(value: Value): Value {
  if (value.kind === 'function') return value
  if (value.kind === 'tuple') {
    return { kind: 'tuple', elements: value.elements.map((element) => cloneValue(element) as SequenceValue) }
  }
  if (value.kind === 'sequence') {
    return {
      kind: 'sequence',
      items: value.items.map(cloneValue),
      bracketed: value.bracketed,
    }
  }

  const cloned: NoteValue = { ...value, done: false }
  if (cloned.link) cloned.dur = cloned.dt
  return cloned
}

function eachLeaf(value: Value, visit: (note: NoteValue) => void): void {
  if (value.kind === 'sequence') {
    for (const item of value.items) eachLeaf(item, visit)
  } else if (value.kind === 'value') {
    visit(value)
  }
}

function resolveArgument(
  suffix: Suffix,
  defaultArgument1: number,
  defaultArgument2: number,
): number {
  if (suffix.argument === undefined) return defaultArgument1
  if (suffix.argument === 'd2') return defaultArgument2
  return suffix.argument
}

function applyFieldOperation(note: NoteValue, suffix: Suffix): void {
  const argument = resolveArgument(
    suffix,
    DEFAULT_ARGUMENT_1[suffix.op],
    DEFAULT_ARGUMENT_2[suffix.op],
  )

  if (note.isRest) {
    if (!'/+-'.includes(suffix.op)) return
    let nextDuration: number
    if (suffix.op === '/') nextDuration = note.dt / argument
    else if (suffix.op === '+') nextDuration = note.dt * argument
    else nextDuration = note.dt + argument
    if (Number.isNaN(nextDuration)) throw new Error('NaN')
    note.dt = nextDuration
    return
  }

  let result: number | undefined
  switch (suffix.op) {
    case '/':
      note.dt /= argument
      if (note.link) note.dur = note.dt
      result = note.dt
      break
    case '+':
      note.dt *= argument
      if (note.link) note.dur = note.dt
      result = note.dt
      break
    case '-':
      note.dt += argument
      if (note.link) note.dur = note.dt
      result = note.dt
      break
    case '#':
      note.midi! += argument
      result = note.midi
      break
    case 'b':
      note.midi! -= argument
      result = note.midi
      break
    case "'":
      note.midi! += 12 * argument
      result = note.midi
      break
    case ',':
      note.midi! -= 12 * argument
      result = note.midi
      break
    case 'p':
      note.velocity /= argument
      result = note.velocity
      break
    case 'P':
      note.velocity *= argument
      result = note.velocity
      break
    case '!':
      note.dur /= argument
      note.link = false
      result = note.dur
      break
    case '~':
      note.dur *= argument
      note.link = false
      result = note.dur
      break
    case '%':
      note.dur = argument
      note.link = false
      result = note.dur
      break
  }
  if (Number.isNaN(result)) throw new Error('NaN')
}

function evaluate(source: string, rt: MusicRuntime): void {
  const program = parseIpxf(source)

  function applySuffix(value: Value, suffix: Suffix, scope: Scope): Value {
    if (value.kind === 'function' && suffix.op !== 'call' && suffix.op !== '@') {
      return { ...value, chain: [...value.chain, suffix] }
    }

    if (value.kind === 'sequence' && value.bracketed) {
      const result = applySuffix({ ...value, bracketed: false }, suffix, scope)
      if (result.kind === 'function' || result.kind === 'tuple') return result
      return { kind: 'sequence', items: [result], bracketed: true }
    }

    if (suffix.op === 'call') {
      const functionAtom: FunctionAtom = { kind: 'function', body: suffix.body ?? [] }
      return callFunction({ kind: 'function', atom: functionAtom, chain: [] }, value, scope)
    }

    if (suffix.op === '@') {
      const name = suffix.name ?? ''
      const functionValue = lookup(scope, name)
      if (functionValue === undefined) throw new Error(`NameError: ${name}`)
      if (functionValue.kind !== 'function') throw new Error(`TypeError: ${name} is not a function`)
      return callFunction(functionValue, value, scope)
    }

    if (suffix.op === 'Q') {
      if (value.kind === 'tuple') {
        const items: Value[] = []
        if (value.elements.length > 0) {
          items.push(cloneValue(value.elements[0]))
          for (let index = 1; index < value.elements.length; index += 1) {
            items.push(cloneValue(value.elements[index]), cloneValue(value.elements[0]))
          }
        }
        return { kind: 'sequence', items, bracketed: false }
      }

      const count = resolveArgument(suffix, 2, 3)
      if (!Number.isInteger(count)) throw new Error('Q non-integer argument')
      const items: Value[] = []
      for (let index = 0; index < count; index += 1) items.push(cloneValue(value))
      return { kind: 'sequence', items, bracketed: false }
    }

    if (value.kind === 'tuple') throw new Error('Tuple')
    if (suffix.op === '&') {
      eachLeaf(value, (note) => {
        note.dt = 0
        if (!note.isRest) note.link = false
      })
    } else {
      eachLeaf(value, (note) => applyFieldOperation(note, suffix))
    }
    return value
  }

  function callFunction(functionValue: FunctionValue, parameter: Value, scope: Scope): Value {
    const functionScope = createScope(scope)
    if (parameter.kind === 'tuple') {
      parameter.elements.forEach((element, index) => {
        functionScope.variables.set(String(index + 1), element)
      })
    } else {
      functionScope.variables.set('1', parameter)
    }

    let result: Value = evaluateSequence(functionValue.atom.body, functionScope)
    exitScope(functionScope)
    for (const suffix of functionValue.chain) result = applySuffix(result, suffix, scope)
    return result
  }

  function evaluateAtom(atom: Atom, scope: Scope): Value {
    switch (atom.kind) {
      case 'note':
        return {
          kind: 'value',
          isRest: false,
          dt: 1,
          dur: 1,
          velocity: 1,
          midi: atom.midi,
          link: true,
          posStart: atom.posStart,
          posEnd: atom.posEnd,
        }
      case 'rest':
        return {
          kind: 'value',
          isRest: true,
          dt: 1,
          dur: 1,
          velocity: 1,
          link: false,
          posStart: 0,
          posEnd: 0,
        }
      case 'function':
        return { kind: 'function', atom, chain: [] }
      case 'variable': {
        const value = lookup(scope, atom.name)
        if (value === undefined) throw new Error(`NameError: ${atom.name}`)
        return value.kind === 'function' ? value : cloneValue(value)
      }
      case 'group': {
        const groupScope = createScope(scope)
        const value = evaluateSequence(atom.items, groupScope)
        exitScope(groupScope)
        return value
      }
      case 'bracket': {
        const bracketScope = createScope(scope)
        const value = evaluateSequence(atom.items, bracketScope)
        exitScope(bracketScope)
        value.bracketed = true
        return value
      }
      case 'tuple': {
        const tupleScope = createScope(scope)
        const elements = atom.elements.map((element) => evaluateSequence(element, tupleScope))
        exitScope(tupleScope)
        return { kind: 'tuple', elements }
      }
    }
  }

  function evaluateItem(node: ItemNode | DefinitionNode, scope: Scope): Value {
    let value = evaluateAtom(node.atom, scope)
    for (const suffix of node.suffixes) value = applySuffix(value, suffix, scope)
    return value
  }

  function evaluateSequence(nodes: ParsedNode[], scope: Scope): SequenceValue {
    let offset = 0
    const items: Value[] = []

    for (const node of nodes) {
      if (node.type === 'pedal') {
        togglePedal(scope, offset)
        continue
      }

      const value = evaluateItem(node, scope)
      if (node.type === 'definition') {
        if (value.kind === 'tuple') throw new Error('Tuple')
        scope.variables.set(node.name, value)
        continue
      }
      if (value.kind === 'function') continue
      if (value.kind === 'tuple') throw new Error('Tuple')

      walk(value, offset, scope)
      offset += advanceOf(value)
      if (Number.isNaN(offset)) throw new Error('NaN')
      items.push(value)
    }

    return { kind: 'sequence', items, bracketed: false }
  }

  const globalScope = createScope(null)
  const tree = evaluateSequence(program, globalScope)
  exitScope(globalScope)

  function collect(value: Value, base: number): void {
    if (value.kind === 'sequence') {
      let offset = 0
      for (const item of value.items) {
        collect(item, base + offset)
        offset += advanceOf(item)
      }
      return
    }
    if (value.kind !== 'value' || value.isRest || base === Infinity) return
    if (Number.isNaN(base)) throw new Error('NaN')

    rt.time = base * (60 / rt.bpm)
    rt.gain = value.velocity
    rt.__setPos(value.posStart, value.posEnd)
    if (value.midi! > -48) {
      const maximumDuration = (rt.bpm / 16) * 2 ** ((21 - value.midi!) / 24)
      rt.note(value.midi! - 69, Math.min(value.dur, maximumDuration))
    } else {
      const duration = Number.isFinite(value.dur) ? value.dur : 1
      rt.noteHz(-Math.pow(2, -value.midi! / 12), duration)
    }
  }

  collect(tree, 0)
}

function runIpxf(source: string, rt: MusicRuntime): void {
  evaluate(source, rt)
}

export function parse(source: string, options: ParseOptions): ParseResult {
  const rt = createRuntime(options.bpm, options.baseFrequency ?? 440)
  try {
    runIpxf(source, rt)
    return { events: rt.__notes, errors: [] }
  } catch (error) {
    return {
      events: rt.__notes,
      errors: [{ message: error instanceof Error ? error.message : String(error) }],
    }
  }
}