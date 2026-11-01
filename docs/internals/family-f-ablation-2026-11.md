# Family F, graded by ablation (2026-11-01)

The architecture target's step 6 promised to close "family F's ledger-disagreement rows (64 open)".
Family F was a keyword label (narrowing, nullable, `as`, `??`), not a mechanism. This file grades
it by ablation, as CLAUDE.md asks: re-run each witness, minimise it, and let the minimal witness's
ingredients name the family. Master `8c716bf0c`, fixpoint seed.

## Method

1. Population: open rows whose title, status or Mechanism text names narrowing, nullable, `??`,
   `as`, a null test or a niche, and whose status mentions a clause-1 outcome. 86 rows.
2. `check-filed-witnesses.vl --strict` over the 86: 86 graded, 86 as filed, 0 MOVED.
3. Each witness run for its measured outcome. 57 are clause 1 (24 invalid wasm, 23 runs with a
   wrong value, 9 traps, plus D1413). 29 are not: 24 loud check rejects, 4 rows now loud check
   rejects (D1400, D521, D541, D834) and 1 loud emit reject. The status filter had matched "was
   check-clean".
4. A greedy line-removal minimiser keeps a removal only while the outcome and its normalised
   message both hold. Its control, D2652, keeps its trap at 4 lines.
5. Families come from the minimal witnesses, not from messages: 19 of the 24 invalid-wasm rows
   print the same `type mismatch: expected` sentence and share nothing else.

## Families

| family | rows | mechanism | lane |
|---|---|---|---|
| A | 13 | a join of scalars or type parameters read at the wrong rep | step 5 |
| C | 13 | a record or container delivered at a rep its destination stores differently | c-2 |
| D | 7 | a generic or hole function value at an instance | γ (D14791: mcall's flip) |
| E | 6 | `??` and short-circuit lowering | error-channel |
| I | 5 | not narrowing: loop overflow, match re-evaluation, extern `never`, u8 truncation, `x!` parse | step 7 (re-label only) |
| B | 4 | a narrowing survives a write through an alias (the narrowing ledger proper) | step 7 |
| F | 3 | `as` / `as!` inside an instance, a hole lambda or a copied hole binding | mono |
| G | 3 | a generic body's read in an instance (`is`, list ops) | D3423 |
| H | 2 | a module global read before its initializer | step 7 |
| J | 1 | a tail `null` write lowered void | mcall |

Only family B is the emitter-versus-checker narrowing ledger the step was written for. Family I is
not narrowing at all, and the rest belong to the rep, container, generic-instance, `??`, cast and
init-order work they are routed to.

## Rows

| row | outcome | lines (filed → minimal) | family |
|---|---|---|---|
| [D1373](inventory/D1373.md) | runs | not minimised (unparsed `Repro (...)` label; graded from its status) | F |
| [D1413](inventory/D1413.md) | invalid | not minimised (unparsed `Repro (fused ...)` label; graded from its status) | E |
| [D2027](inventory/D2027.md) | trap | 6 → 5 | I |
| [D2038](inventory/D2038.md) | runs | 8 → 6 | I |
| [D2439](inventory/D2439.md) | invalid | 5 → 5 | D |
| [D2451](inventory/D2451.md) | trap | 10 → 9 | E |
| [D2498](inventory/D2498.md) | invalid | 8 → 7 | C |
| [D2652](inventory/D2652.md) | trap | 4 → 4 | H |
| [D2653](inventory/D2653.md) | trap | 3 → 3 | H |
| [D2660](inventory/D2660.md) | invalid | 10 → 8 | C |
| [D2701](inventory/D2701.md) | runs | 12 → 11 | A |
| [D2713](inventory/D2713.md) | invalid | 4 → 2 | C |
| [D2791](inventory/D2791.md) | trap | 2 → 2 | F |
| [D2816](inventory/D2816.md) | invalid | 6 → 5 | E |
| [D2846](inventory/D2846.md) | invalid | 5 → 4 | E |
| [D2858](inventory/D2858.md) | runs | 6 → 6 | A |
| [D3189](inventory/D3189.md) | invalid | 4 → 4 | E |
| [D3226](inventory/D3226.md) | invalid | 4 → 4 | D |
| [D3359](inventory/D3359.md) | runs | 8 → 7 | G |
| [D3362](inventory/D3362.md) | runs | 13 → 12 | A |
| [D3389](inventory/D3389.md) | invalid | 7 → 3 | C |
| [D3401](inventory/D3401.md) | invalid | 6 → 5 | C |
| [D3402](inventory/D3402.md) | invalid | 8 → 6 | C |
| [D3403](inventory/D3403.md) | runs | 7 → 6 | C |
| [D3408](inventory/D3408.md) | invalid | 11 → 9 | C |
| [D3428](inventory/D3428.md) | runs | 3 → 3 | I |
| [D3495](inventory/D3495.md) | runs | 6 → 6 | A |
| [D3531](inventory/D3531.md) | trap | 6 → 5 | E |
| [D3535](inventory/D3535.md) | runs | 5 → 5 | A |
| [D3566](inventory/D3566.md) | invalid | 12 → 11 | C |
| [D3585](inventory/D3585.md) | runs | 3 → 3 | I |
| [D3611](inventory/D3611.md) | runs | 8 → 8 | A |
| [D3612](inventory/D3612.md) | runs | 9 → 9 | A |
| [D3618](inventory/D3618.md) | trap | 6 → 5 | A |
| [D3624](inventory/D3624.md) | trap | 2 → 2 | F |
| [D3643](inventory/D3643.md) | invalid | 5 → 5 | A |
| [D3656](inventory/D3656.md) | runs | 7 → 6 | A |
| [D3657](inventory/D3657.md) | runs | 7 → 6 | A |
| [D3926](inventory/D3926.md) | invalid | 8 → 8 | D |
| [D3969](inventory/D3969.md) | trap | 8 → 8 | D |
| [D4019](inventory/D4019.md) | invalid | 3 → 3 | D |
| [D4040](inventory/D4040.md) | invalid | 6 → 4 | C |
| [D4084](inventory/D4084.md) | runs | 9 → 9 | B |
| [D4131](inventory/D4131.md) | runs | 12 → 12 | B |
| [D4133](inventory/D4133.md) | runs | 12 → 12 | B |
| [D4134](inventory/D4134.md) | runs | 12 → 12 | B |
| [D4170](inventory/D4170.md) | runs | 7 → 7 | A |
| [D4174](inventory/D4174.md) | invalid | 13 → 10 | A |
| [D4981](inventory/D4981.md) | runs | 7 → 5 | G |
| [D5003](inventory/D5003.md) | runs | 9 → 7 | G |
| [D8880](inventory/D8880.md) | invalid | 7 → 6 | J |
| [D12181](inventory/D12181.md) | runs | 6 → 6 | I |
| [D13960](inventory/D13960.md) | invalid | 9 → 8 | C |
| [D14140](inventory/D14140.md) | invalid | 5 → 5 | C |
| [D14722](inventory/D14722.md) | invalid | 8 → 8 | D |
| [D14791](inventory/D14791.md) | invalid | 11 → 10 | D |
| [D14813](inventory/D14813.md) | invalid | 7 → 6 | C |

Not clause 1, out of this population: D521, D541, D834, D1400, D1656, D1950, D2469, D2799, D3197, D3225, D3287, D3300, D3306, D3307, D3308, D3315, D3319, D3335, D3368, D4063, D4985, D5520, D6400, D6426, D6482, D8060, D8301, D9011, D14882.

## Minimal witnesses

### A: a join of scalars or type parameters read at the wrong rep

D2701, runs:

    function mk(): {[string]: string} {
      const m: {[string]: string} = Map()
      return m
    }
    function mkw(): {[string]: string | null} {
      const m: {[string]: string | null} = Map()
      return m
    }
    const c = mk().length > 0
    const r = if c { mk() } else { mkw() }
    print(r is {[string]: string})

D2858, runs:

    function h<T>(c: boolean, t: T) {
      if c { return [null, t] }
      [7, 8, 9]
    }
    const v = h(false, true)
    if v is (boolean | null)[] { print(v[1]) } else { print(v[1]) }

D3362, runs:

    type P = {x: i32}
    function j<T, U>(a: T, b: U, k: i32) {
      return if k == 0 { a } else { b }
    }
    function h(a, b, k: i32) {
      const r = j(a, b, k)
      print(r is P)
    }
    const x0: string = "x"
    const x1: string | null = null
    h(x0, x1, 0)
    h(x0, x1, 1)

D3495, runs:

    function f(k: i32, a: i32, b: f64) {
      if k == 0 { return a }
      if k == 1 { return b }
      return 3
    }
    print(f(0, 7, 2.5) / 2)

D3535, runs:

    function f(a: i64 | null, b: i32) {
      const xs = [a, b]
      print(xs[1] is i64)
    }
    f(null, 7)

D3611, runs:

    function G<A, B>(k: i32, a: A, b: B) {
      if k == 0 { return a }
      if k == 1 { return b }
      null
    }
    const x: f64 = 2.5
    const y: i32 = 4
    print(G(1, x, y) is f64)

D3612, runs:

    function G<A, B>(k: i32, a: A, b: B) {
      if k == 0 { a } else if k == 1 { b } else { null }
    }
    function F<A, B>(k: i32, a: A, b: B) {
      const v = G(k, a, b)
      const ys = [v]
      print(ys[0])
    }
    F(1, 3, "u")

D3618, trap:

    function F<A, B>(k: i32, a: A, b: B) {
      const v: A | B | null = if k == 0 { a } else if k == 1 { b } else { null }
      print(v ?? 9)
    }
    F(2, true, "s")

D3643, invalid:

    function F<A, B>(v: A | B | null) {
      print(v ?? 9)
    }
    const n: boolean | string | null = null
    F(n)

D3656, runs:

    function mk(q: i32 | null, r: i32 | null): i32 | f64 {
      if q != null { q } else { if r != null { r } else { 2.5 } }
    }
    const x = mk(null, -3)
    print(x is f64)
    print(x / 2)

D3657, runs:

    function run(q: i32 | null, r: f64 | null) {
      const x = if q != null { q } else { if r != null { r } else { 7 } }
      print(x is f64)
      print(x / 2)
    }
    run(null, null)

D4170, runs:

    function g<T>(a1: T, k: i32) {
      const v = if k == 1 { a1 } else { "z" }
      print(v ?? "n")
    }
    const x1: string | null = null
    g(x1, 1)
    g(x1, 2)

D4174, invalid:

    type K = "a" | "b"
    function g<T>(a0: T, k: i32) {
      const xs = [match k {
        0 => a0
        1 => null
        _ => "z"
      }]
    }
    const x0: K = "a"
    g(x0, 2)

### C: a record or container delivered at a rep its destination stores differently

D13960, invalid:

    type Shape = { r: f64 }
    type Circle = { r: f64, name: string }
    function total(...xs: Shape[]): f64 {
      let t = 0.0
      t
    }
    const cs: Circle[] = [{ r: 1.5, name: "a" }, { r: 2.0, name: "b" }]
    print(total(...cs))

D14140, invalid:

    function len<T>(r: {v: T | string}) {
      7
    }
    const r = {v: 5}
    print(len(r))

D14813, invalid:

    type Circle = { r: i32 | null }
    function sink(_x: Circle) { }
    function mkcall() { { r: null } }
    sink(mkcall())
    function keep<T>(xs: T[]): T[] { xs }
    const k = keep([mkcall()])

D2498, invalid:

    type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
    function storeIt(v: Json, o: { [string]: Json }) {
      if v is { [string]: Json } { o["x"] = v }
    }
    const o3: { [string]: Json } = Map()
    const m: { [string]: Json } = Map()
    const r = storeIt(m, o3)

D2660, invalid:

    function link2<T>(xs: T[], v: T) { xs.push(v) }
    function main() {
      const xs: (string | null)[] = []
      let x = null
      link2(xs, x)
      x = 5
    }
    main()

D2713, invalid:

    const m: {[string]: 1} = Map()
    const w: {[string]: 1 | null} = m

D3389, invalid:

    type J = { f: i32 | null }
    const x: i32 = 3
    const b: J = (if x > 0 { { f: 5 } } else { null }) ?? { f: 6 }

D3401, invalid:

    type D = { v: f64 | string }
    const x: i32 | string = 3
    function mk() { return { v: x } }
    const o = mk()
    const d: D = o

D3402, invalid:

    function h(a: f64[]) {
      a[0] = 1.5
    }
    function g<T>(xs: T[]) { return h(xs) }
    const xs: i32[] = [1]
    print(g(xs))

D3403, runs:

    const x: i32 | string = 4
    const o = { v: x }
    const d: { v: f64 | string | null } = o
    print(d.v)
    const t = o.v
    if t is i32 { print("i") } else { print("n") }

D3408, invalid:

    function nf() {
      null
    }
    function t(n: i32) {
      const z = null
      let w = if n == 1 { print("a") z ?? nf() } else { print("b") null }
      w = { x: 7 }
    }
    t(1)

D3566, invalid:

    type A = { k: i32, legs: i64 }
    type B = { s: string }
    type Pet = A | B
    type Box = { pet: Pet }
    let n = 0
    function f(): boolean { n = n + 1; return true }
    function mk(): Box {
      const sv = { pet: { k: 1, legs: 4, purr: f() } }
      return sv
    }
    const b = mk()

D4040, invalid:

    type A = { x: i32 } | null
    type U = A | { tag: i32 }
    const a: A = { x: 1 }
    const u: U = a

### D: a generic or hole function value at an instance

D14722, invalid:

    function idg<T>(t: T) { return t }
    function one<T>(t: T) { return 1 }
    function run<U>(x: U) {
      let f = idg
      if "ab".length < 5 { f = one }
      print(f(x))
    }
    run("s")

D14791, invalid:

    function inner<U>(u: U) { print(u) }
    function other<V>(v: V) { print("O") }
    function c<T>(x: T) {
      let k: (t: T) => void = inner
      const toO = () => {
        if x == x { k = other }
      }
      const r = toO()
    }
    c(1)

D2439, invalid:

    function h<T>(e: T): T {
      let v: T | string = "z"
      return (v = e)
    }
    print(h(5) + 1)

D3226, invalid:

    function H(h, v) {
      return h(v)
    }
    print(H((x: f32) => x, 1.5))

D3926, invalid:

    function outer<T>(x: T) {
      function inner<U>(u: U) { print(x); print(u) }
      const k = inner
      const h: (n: i32) => void = k
      h(2)
    }
    outer(7)
    outer("s")

D3969, trap:

    function inner<U>(u: U) { print("I"); print(u) }
    function retV<V>(v: V): V { print("R"); print(v); v }
    function main() {
      let k = inner
      k = retV
      k(3)
    }
    main()

D4019, invalid:

    function useK() { const s: string = k(1); print(s) }
    const k = (x) => x + 1
    useK()

### E: `??` and short-circuit lowering

D2451, trap:

    function nn(v: i32): i32 | null {
      return v
    }
    function main() {
      let c: i32 | null = null
      const _k = nn(3) ?? (c = 5)
      print(c ?? -1)
    }
    main()

D2816, invalid:

    function h<T>(xs: T[] | null) {
      const r = xs ?? [false]
      r
    }
    const q = h<f64>(null)

D2846, invalid:

    function h<T>(xs: T[][] | null) {
      xs ?? [[1]]
    }
    const q = h([["s"]])

D3189, invalid:

    type K = "a" | "b"
    const f = (x: string | null) => x ?? "none"
    const k: K = "a"
    print(f(k))

D3531, trap:

    type U = 1 | "s"
    function mk(): U { 1 }
    const x = mk()
    const r: i64 | string = x ?? 5
    print(r)

### I: not narrowing: loop overflow, match re-evaluation, extern `never`, u8 truncation, `x!` parse

Each of these five is its own one-row family, and each row's own Mechanism section already says so;
only the keyword classifier put them under F. Their honest labels:

| row | family | owner |
|---|---|---|
| D12181 | range loop: the counter add wraps before the exit test | loops |
| D2038 | `match` lowering: a computed scrutinee is re-evaluated per arm | match |
| D2027 | extern `never` result: the witness is graded through a host that lacks `exit` (fixed) | none |
| D3428 | exact-constant ruling at a `u8` element: needs an owner ruling | owner |
| D3585 | parser: `x! is O` reads as `x !is O`: needs an owner ruling | owner |

D12181, runs:

    let n = 0
    for i in 2147483646 to 2147483647 {
      n = n + 1
      if n > 5 { break }
    }
    print(n)

D2038, runs:

    let n = 5
    function next() {
      n = n + 1
    }
    const ok = true && match next() { 5 => false, 6 => true, 7 => false, _ => false }
    print("\{ok} \{n}")

D2027, trap:

    extern function exit(code: i32): never
    function f(x: i32 | null): i32 {
      if x == null { exit(2) }
      x + 1
    }

D3428, runs:

    const K = -2147483648
    const xs: u8[] = [K]
    print(xs[0])

D3585, runs:

    type O = { n: i32 }
    const x: O | null = { n: 1 }
    print(x! is O)

### B: a narrowing survives a write through an alias (the narrowing ledger proper)

D4084, runs:

    type A = { x: i32 }
    type B = { x: 1 | 2 }
    const keep: B[] = []
    function stash(a: A) { if a is B { keep.push(a) } }
    const a: A = { x: 1 }
    stash(a)
    a.x = 7
    const y: 1 | 2 = keep[0].x
    print(y)

D4131, runs:

    type A = { x: i32 }
    type B = { x: 1 | 2 }
    type H = { v: A | B }
    function f(base: A) {
      const h: H = { v: base }
      if h.v is B {
        base.x = 7
        const y: 1 | 2 = h.v.x
        print(y)
      }
    }
    f({ x: 1 })

D4133, runs:

    type A = { x: i32 }
    type B = { x: 1 | 2 }
    function f(base: A) {
      const a: A | B = base
      if a is B {
        const c = a
        base.x = 7
        const y: 1 | 2 = c.x
        print(y)
      }
    }
    f({ x: 1 })

D4134, runs:

    type A = { x: i32 }
    type B = { x: 1 | 2 }
    function f(base: A) {
      const a: A | B = base
      const b = a as? B
      if b != null {
        base.x = 7
        const y: 1 | 2 = b.x
        print(y)
      }
    }
    f({ x: 1 })

### F: `as` / `as!` inside an instance, a hole lambda or a copied hole binding

D2791, trap:

    function k<T>(u: T): i32 { u as! i32 }
    print(k<f64>(1.5))

D3624, trap:

    const k = (x) => x as! u8
    print(k(300))

### G: a generic body's read in an instance (`is`, list ops)

D3359, runs:

    type P = {x: i32}
    type U = P | string
    function g<T>(a: T) {
      print(a is U)
    }
    const p: P = {x: 1}
    g(p)

D4981, runs:

    function g<V>(v: V) {
      print(v.length)
    }
    const e: i32[] = []
    g(e)

D5003, runs:

    function t<V>(a: V[]) {
      if a is f64[] {
      }
      print(a.length)
    }
    const e: i32[] = []
    t(e)

### H: a module global read before its initializer

D2652, trap:

    function four() { 4 }
    function rn(): i32 { n }
    print(rn())
    const n = 3 + four()

D2653, trap:

    function rs(): string { ls }
    print(rs())
    const ls = "s" + "t"

### J: a tail `null` write lowered void

D8880, invalid:

    type O = { v: string | null }
    const o: O = { v: "a" }
    const c = () => {
      o.v = null
    }
    const r = c()
