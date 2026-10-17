/*! @author islptng <https://wiki.xdi8.top/wiki/User:6xL-Bro_islptng> */
function ipxf(src, _bpm=240) {
  bpm = _bpm;
  const brt = 60 / bpm;
  const PITCH = {
    '1':48,'2':50,'3':52,'4':53,'5':55,'6':57,'7':59,
    'd':60,'r':62,'m':64,'f':65,'s':67,'l':69,'t':71,
    'D':72,'R':74,'M':76,'F':77,'S':79,'L':81,'T':83,
    '8':-138,'x':-150,'X':-162,
    '9':-142,'y':-156,'Y':-168
  };
  const DEF1 = {'/':2,'+':2,'-':1,'#':1,'b':1,"'":3,',':3,'p':1.5,'P':1.5,'!':2,'~':2,'%':1};
  const DEF2 = {'/':3,'+':3,'-':5,'#':4,'b':4,"'":1,',':1,'p':2,'P':2,'!':4,'~':Infinity,'%':0.5};
  const SUFFIX = "/+-#b',pP!~%&Q";
  let pos = 0; const n = src.length;
  const skipWs = () => { while (pos < n && ' \t\n\r'.includes(src[pos])) pos++; };
  const readIdent = () => { let s=''; while (pos < n && /[A-Za-z0-9_]/.test(src[pos])) s += src[pos++]; return s; };
  const readDigits = () => { let s=''; while (pos < n && src[pos] >= '0' && src[pos] <= '9') s += src[pos++]; return s === '' ? undefined : parseInt(s, 10); };

  function parseSeq(stop) {
    const nodes = [];
    for (;;) {
      skipWs();
      if (pos >= n) return nodes;
      const c = src[pos];
      if (stop.includes(c)) return nodes;
      if (c === ')' || c === ']' || c === '}') throw new Error('Too much ' + c);
      if (c === ';') { pos++; continue; }
      if (c === '*') { pos++; nodes.push({type:'pedal'}); continue; }
      if (c === '>') throw new Error('Expected item before >');
      const item = parseItem();
      if (item) nodes.push(item);
    }
  }
  function parseGroup() {
    pos++;
    const elems = [];
    let cur = parseSeq([';', ')']);
    for (;;) {
      skipWs();
      if (pos >= n) throw new Error('Unmatched (');
      const c = src[pos];
      if (c === ';') { pos++; elems.push(cur); cur = parseSeq([';', ')']); continue; }
      if (c === ')') { pos++; elems.push(cur); break; }
      throw new Error('Unmatched ' + c);
    }
    return elems.length === 1 ? {type:'group', items:elems[0]} : {type:'tuple', elems};
  }
  function parseItem() {
    const atom = parseAtom();
    if (!atom) return null;
    const suffixes = [];
    for (;;) {
      skipWs();
      if (pos >= n) break;
      const c = src[pos];
      if (c === '{') {
        pos++;
        const body = parseSeq(['}']);
        skipWs(); if (pos >= n || src[pos] !== '}') throw new Error('Unmatched {');
        pos++; suffixes.push({op:'call', body}); continue;
      }
      if (c === '>') {
        pos++;
        const name = readIdent();
        if (!name) throw new Error('Expected identifier after >');
        return {type:'def', name, atom, suffixes};
      }
      if (c === '@') {
        pos++;
        const name = readIdent();
        if (!name) throw new Error('Expected identifier after @');
        suffixes.push({op:'@', name}); continue;
      }
      if (c === '.') {
        pos++;
        const p = readDigits();
        let q;
        if (pos < n && src[pos] === '.') { pos++; q = readDigits(); }
        let arg;
        if (q !== undefined) arg = (p !== undefined ? p : 1) / q;
        else if (p !== undefined) arg = p;
        else arg = 'd2';
        skipWs();
        if (pos < n && SUFFIX.includes(src[pos])) suffixes.push({op: src[pos++], arg});
        continue;
      }
      if (SUFFIX.includes(c)) { pos++; suffixes.push({op:c, arg:undefined}); continue; }
      break;
    }
    return {type:'item', atom, suffixes};
  }
  function parseAtom() {
    skipWs();
    if (pos >= n) return null;
    const c = src[pos];
    if (PITCH[c] !== undefined) { pos++; return {type:'note', midi:PITCH[c]}; }
    if (c === '_') { pos++; return {type:'rest'}; }
    if (c === '$') { pos++; const name = readIdent(); if (!name) throw new Error('Expected identifier after $'); return {type:'var', name}; }
    if (c === '(') return parseGroup();
    if (c === '[') {
      pos++;
      const items = parseSeq([']']);
      skipWs(); if (pos >= n || src[pos] !== ']') throw new Error('Unmatched [');
      pos++; return {type:'bracket', items};
    }
    if (c === '{') {
      pos++;
      const body = parseSeq(['}']);
      skipWs(); if (pos >= n || src[pos] !== '}') throw new Error('Unmatched {');
      pos++; return {type:'func', body};
    }
    pos++;
    return null;
  }

  const newScope = p => ({vars:new Map(), parent:p, pedalOn:p.pedalOn, pending:[]});
  function exitScope(s) { for (const lf of s.pending) { lf.dur = Infinity; lf.link = false; } s.pending.length = 0; }
  function lookup(sc, name) { for (let s = sc; s; s = s.parent) if (s.vars.has(name)) return s.vars.get(name); return undefined; }
  function togglePedal(sc, off) {
    if (sc.pedalOn) {
      for (const lf of sc.pending) {
        let d = off - lf.rel;
        if (Number.isNaN(d)) { if (off === Infinity || lf.rel === Infinity) d = Infinity; else throw new Error('NaN'); }
        lf.dur = d; lf.link = false;
      }
      sc.pending.length = 0; sc.pedalOn = false;
    } else sc.pedalOn = true;
  }
  function advOf(v) {
    if (v.func || v.tuple) return 0;
    if (v.items) return v.br ? 0 : v.items.reduce((a,it)=>a+advOf(it), 0);
    return v.dt;
  }
  function walk(v, base, sc) {
    if (v.items) { let o = 0; for (const it of v.items) { walk(it, base+o, sc); o += advOf(it); } }
    else if (!v.rest) {
      v.rel = base;
      if (!v.done) { v.done = true; if (sc.pedalOn) sc.pending.push(v); }
    }
  }
  function clone(v) {
    if (v.func) return v;
    if (v.tuple) return {tuple: v.tuple.map(e => clone(e))};
    if (v.items) return {items: v.items.map(it => clone(it)), br: v.br};
    const c = Object.assign({}, v);
    c.done = false;
    if (c.link) c.dur = c.dt;
    return c;
  }
  function eachLeaf(v, f) { if (v.items) for (const it of v.items) eachLeaf(it, f); else f(v); }
  const resolveArg = (suf, d1, d2) => suf.arg === undefined ? d1 : suf.arg === 'd2' ? d2 : suf.arg;

  function fieldOp(lf, suf) {
    const op = suf.op, x = resolveArg(suf, DEF1[op], DEF2[op]);
    if (lf.rest) {
      if (!'/+-'.includes(op)) return;
      const dt = op === '/' ? lf.dt / x : op === '+' ? lf.dt * x : lf.dt + x;
      if (Number.isNaN(dt)) throw new Error('NaN');
      lf.dt = dt; return;
    }
    let v;
    switch (op) {
      case '/': lf.dt = lf.dt / x; if (lf.link) lf.dur = lf.dt; v = lf.dt; break;
      case '+': lf.dt = lf.dt * x; if (lf.link) lf.dur = lf.dt; v = lf.dt; break;
      case '-': lf.dt = lf.dt + x; if (lf.link) lf.dur = lf.dt; v = lf.dt; break;
      case '#': v = lf.midi += x; break;
      case 'b': v = lf.midi -= x; break;
      case "'": v = lf.midi += 12 * x; break;
      case ',': v = lf.midi -= 12 * x; break;
      case 'p': v = lf.vel /= x; break;
      case 'P': v = lf.vel *= x; break;
      case '!': v = lf.dur /= x; lf.link = false; break;
      case '~': v = lf.dur *= x; lf.link = false; break;
      case '%': v = lf.dur = x;  lf.link = false; break;
    }
    if (Number.isNaN(v)) throw new Error('NaN');
  }

  function applySuffix(tree, suf, scope) {
    if (tree.func && suf.op !== 'call' && suf.op !== '@')
      return {func: tree.func, chain: tree.chain.concat([suf])};
    if (tree.br) {
      const r = applySuffix({items: tree.items, br:false}, suf, scope);
      if (r.func || r.tuple) return r;
      return {items: [r], br: true};
    }
    if (suf.op === 'call') return callFunc({func:{type:'func', body:suf.body}, chain:[]}, tree, scope);
    if (suf.op === '@') {
      const v = lookup(scope, suf.name);
      if (v === undefined) throw new Error('NameError: ' + suf.name);
      if (!v.func) throw new Error('TypeError: ' + suf.name + ' is not a function');
      return callFunc(v, tree, scope);
    }
    if (suf.op === 'Q') {
      if (tree.tuple) {
        const its = [];
        if (tree.tuple.length) {
          its.push(clone(tree.tuple[0]));
          for (let i = 1; i < tree.tuple.length; i++)
            its.push(clone(tree.tuple[i]), clone(tree.tuple[0]));
        }
        return {items: its, br:false};
      }
      const cnt = resolveArg(suf, 2, 3);
      if (!Number.isInteger(cnt)) throw new Error('Q non-integer argument');
      const its = [];
      for (let i = 0; i < cnt; i++) its.push(clone(tree));
      return {items: its, br:false};
    }
    if (tree.tuple) throw new Error('Tuple');
    if (suf.op === '&') eachLeaf(tree, lf => { lf.dt = 0; if (!lf.rest) lf.link = false; });
    else eachLeaf(tree, lf => fieldOp(lf, suf));
    return tree;
  }

  function callFunc(f, param, scope) {
    const s = newScope(scope);
    if (param && param.tuple) param.tuple.forEach((e,i) => s.vars.set(String(i+1), e));
    else s.vars.set('1', param);
    let result = evalSeq(f.func.body, s);
    exitScope(s);
    for (const c of f.chain) result = applySuffix(result, c, scope);
    return result;
  }

  function evalAtom(atom, scope) {
    switch (atom.type) {
      case 'note':  return {dt:1, dur:1, vel:1, midi:atom.midi, link:true};
      case 'rest':  return {rest:true, dt:1};
      case 'func':  return {func: atom, chain: []};
      case 'var': {
        const v = lookup(scope, atom.name);
        if (v === undefined) throw new Error('NameError: ' + atom.name);
        return v.func ? v : clone(v);
      }
      case 'group':  { const s = newScope(scope); const t = evalSeq(atom.items, s); exitScope(s); return t; }
      case 'bracket':{ const s = newScope(scope); const t = evalSeq(atom.items, s); exitScope(s); t.br = true; return t; }
      case 'tuple':  {
        const s = newScope(scope);
        const elems = atom.elems.map(e => evalSeq(e, s));
        exitScope(s);
        return {tuple: elems};
      }
    }
  }

  function evalItem(node, scope) {
    let tree = evalAtom(node.atom, scope);
    for (const suf of node.suffixes) tree = applySuffix(tree, suf, scope);
    return tree;
  }

  function evalSeq(nodes, scope) {
    let off = 0;
    const items = [];
    for (const node of nodes) {
      if (node.type === 'pedal') { togglePedal(scope, off); continue; }
      const tree = evalItem(node, scope);
      if (node.type === 'def') {
        if (tree.tuple) throw new Error('Tuple');
        scope.vars.set(node.name, tree);
        continue;
      }
      if (tree.func) continue;
      if (tree.tuple) throw new Error('Tuple');
      walk(tree, off, scope);
      off += advOf(tree);
      if (Number.isNaN(off)) throw new Error('NaN');
      items.push(tree);
    }
    return {items, br:false};
  }

  const program = parseSeq([]);
  const g = {vars:new Map(), parent:null, pedalOn:false, pending:[]};
  const tree = evalSeq(program, g);
  exitScope(g);
  (function collect(v, base) {
    if (v.items) { let o = 0; for (const it of v.items) { collect(it, base+o); o += advOf(it); } }
    else if (!v.rest && base !== Infinity) {
      if (Number.isNaN(base)) throw new Error('NaN');
      time=base*brt;gain=v.vel;
      if(v.midi > -48) note(v.midi-69,Math.min(v.dur,bpm/16*2**((21-v.midi)/24)));
      else noteHz(-Math.pow(2,-v.midi/12),isFinite(v.dur)?v.dur:1);
    }
  })(tree, 0);
}