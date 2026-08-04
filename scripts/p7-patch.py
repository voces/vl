#!/usr/bin/env python3
"""P7 scratch: hand-patch VL's own emitted WAT to prototype hash/probe changes.

Every variant is a source-to-source rewrite of one helper function body; the
result is reassembled with wasm-tools and run on the UNMODIFIED host, which is
this repo's standard for calling a perf item "prototyped".
"""
import re, subprocess, sys, os

def funcspan(lines, n):
    """0-based [start, end) line span of `(func (;n;)`."""
    start = None
    for i, l in enumerate(lines):
        if l.startswith(f'  (func (;{n};)'):
            start = i
            break
    assert start is not None, f'func {n} not found'
    for j in range(start + 1, len(lines)):
        if lines[j].startswith('  (func ') or lines[j].startswith('  (export') \
           or lines[j] == '  )':
            return start, j + 1 if lines[j] == '  )' else j
    raise AssertionError

def get(lines, n):
    a, b = funcspan(lines, n)
    return a, b, '\n'.join(lines[a:b])

def put(lines, a, b, txt):
    lines[a:b] = txt.split('\n')

# ---------------------------------------------------------------- variants

def v_mask(lines):
    """__map_probe__ (func 10): cap is always a power of two (index starts at 16
    and only ever doubles), so `h % cap` == `h & (cap-1)`. Two i32.rem_u — one
    per probe plus one per collision step — become i32.and."""
    a, b, t = get(lines, 10)
    assert t.count('i32.rem_u') == 2, t.count('i32.rem_u')
    t = t.replace('    array.len\n    local.set 5\n',
                  '    array.len\n    i32.const 1\n    i32.sub\n    local.set 5\n', 1)
    t = t.replace('i32.rem_u', 'i32.and')
    put(lines, a, b, t)
    return lines

def v_hashlen(lines):
    """__str_hash__ (func 7): hoist array.len out of the loop into a 3rd local.
    Reference locals live in stack-map slots so `local.get 0; array.len` is a
    memory load every iteration; the length of an immutable string cannot change."""
    a, b, t = get(lines, 7)
    assert '(local i32 i32)' in t
    t = t.replace('(local i32 i32)', '(local i32 i32 i32)')
    t = t.replace('''    i32.const 0
    local.set 2
    loop ;; label = @1
      local.get 2
      local.get 0
      array.len
      i32.ge_s''', '''    i32.const 0
    local.set 2
    local.get 0
    array.len
    local.set 3
    loop ;; label = @1
      local.get 2
      local.get 3
      i32.ge_s''', 1)
    assert 'local.set 3' in t
    put(lines, a, b, t)
    return lines

UNROLL_BODY = '''  (func (;7;) (type 10) (param (ref 0)) (result i32)
    (local i32 i32 i32 i32)
    i32.const -2128831035
    local.set 1
    i32.const 0
    local.set 2
    local.get 0
    array.len
    local.set 3
    local.get 3
    i32.const {K}
    i32.sub
    local.set 4
    loop ;; label = @1
      local.get 2
      local.get 4
      i32.gt_s
      if ;; label = @2
      else
{BLOCK}        local.get 2
        i32.const {K}
        i32.add
        local.set 2
        br 1 (;@1;)
      end
    end
    loop ;; label = @3
      local.get 2
      local.get 3
      i32.ge_s
      if ;; label = @4
      else
        local.get 1
        local.get 0
        local.get 2
        array.get 0
        i32.xor
        i32.const 16777619
        i32.mul
        local.set 1
        local.get 2
        i32.const 1
        i32.add
        local.set 2
        br 1 (;@3;)
      end
    end
    local.get 1
    i32.const 2147483647
    i32.and
  )'''

def v_unroll(k):
    def f(lines):
        step = []
        for j in range(k):
            step.append('        local.get 1\n        local.get 0\n        local.get 2\n')
            if j:
                step.append(f'        i32.const {j}\n        i32.add\n')
            step.append('        array.get 0\n        i32.xor\n        i32.const 16777619\n'
                        '        i32.mul\n        local.set 1\n')
        a, b, _ = get(lines, 7)
        put(lines, a, b, UNROLL_BODY.replace('{K}', str(k)).replace('{BLOCK}', ''.join(step)))
        return lines
    return f

VARIANTS = {
    'mask':    [v_mask],
    'hashlen': [v_hashlen],
    'hash4':   [v_unroll(4)],
    'hash8':   [v_unroll(8)],
    'mask+hash8': [v_mask, v_unroll(8)],
    'mask+hashlen': [v_mask, v_hashlen],
}

if __name__ == '__main__':
    base, variant, out = sys.argv[1], sys.argv[2], sys.argv[3]
    lines = open(base).read().split('\n')
    for fn in VARIANTS[variant]:
        lines = fn(lines)
    open(out + '.wat', 'w').write('\n'.join(lines))
    r = subprocess.run(['wasm-tools', 'parse', out + '.wat', '-o', out + '.wasm'])
    print('PARSE_RC=%d' % r.returncode)
    if r.returncode == 0:
        r2 = subprocess.run(['wasm-tools', 'validate', '--features', 'all', out + '.wasm'])
        print('VALIDATE_RC=%d' % r2.returncode)
