# `std:json` v1 — the usability critique: what it is like to walk the tree

> Status: CRITIQUE, 2026-09-01, of `docs/json-design.md` as of commit `e40ffbf8`

Four programs a real consumer writes, on the 2026-09-01 seed, from the worktree root with
`VL_STD=$PWD/std`. The module is not built and `Json | JsonError` does not compile (D1021),
so nothing here calls `parseJson`; what it measures is the part of the surface a consumer
spends their time in — **building a `Json` tree by hand and walking it.**

**Read this first: the shared `build/vl-compiler.wasm` was ~18 hours stale and reproduced
NONE of §4's rows** — every appendix program graded as a check error, which reads exactly
like the proposal being wrong. After `scripts/refresh-compiler.sh`, **all three doc witnesses
re-run as filed** (D1021 check-clean invalid wasm; D1022 both halves). Refresh before
believing a disagreement.

---

## The four programs

### P1 — config read

**RUNS.** `svc` · `8080` · `2` · `a` · `1.5` · `true` · `true` · `false`

```vl
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }

// build: {"name":"svc","port":8080,"tags":["a","b"],"limits":{"cpu":1.5,"mem":null}}
let tags: Json[] = []
tags.push("a")
tags.push("b")
let limits: { [string]: Json } = Map()
limits["cpu"] = 1.5
limits["mem"] = null
let cfg: { [string]: Json } = Map()
cfg["name"] = "svc"
cfg["port"] = 8080.0
cfg["tags"] = tags
cfg["limits"] = limits
const root: Json = cfg

// read it back
if root is { [string]: Json } {
  const name = root["name"]
  if name is string { print(name) }

  const port = root["port"]
  if port is f64 { print(port as i32) }

  const tv = root["tags"]
  if tv is Json[] {
    let out: string[] = []
    let i = 0
    while i < tv.length {
      const t = tv[i]
      if t is string { out.push(t) }
      i = i + 1
    }
    print(out.length)
    print(out[0])
  }

  const lim = root["limits"]
  if lim is { [string]: Json } {
    const cpu = lim["cpu"]
    if cpu is f64 { print(cpu) }
    print(lim.has("mem"))     // true  — present
    const mem = lim["mem"]
    print(mem == null)        // true  — and null
    print(lim.has("disk"))    // false — missing
  }
}
```

**27 lines of reading, 7 `is` checks, 7 hoisted locals.** Missing-vs-null is answered by
`has` beside the read, exactly as §2.1 says — and `has` is only reachable once the receiver
has been narrowed to the map arm, which matters for P4.

### P2 — response build

**RUNS.** `true` · `true` · `2` · `1` · `y`

```vl
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Item = { id: i32, n: string }

function toNode(self: Item): Json {
  let o: { [string]: Json } = Map()
  o["id"] = self.id as f64
  o["n"] = self.n
  return o
}

function respond(items: Item[]): Json {
  let arr: Json[] = []
  let i = 0
  while i < items.length {
    arr.push(items[i].toNode())
    i = i + 1
  }
  let root: { [string]: Json } = Map()
  root["ok"] = true
  root["items"] = arr
  root["next"] = null
  return root
}

const items: Item[] = [{ id: 1, n: "x" }, { id: 2, n: "y" }]
const body = respond(items)
// … the read-back is P1's shape and is elided; it prints the five values above.
```

The construction side is the good news of this critique: UFCS into the tree
(`items[i].toNode()`), `as f64`, a `Map()` returned as `Json`, `null` written straight into
a map slot — all first try, no workaround. Two natural spellings do refuse:

```vl
const root: Json = { "ok": true, "next": null }
// check reject: cannot assign {ok: boolean, next: null} to 'root' of type Json   (§3, as filed)

root["tags"] = ["a", null]
// check reject: cannot assign (string | null)[] to Json | null                   (D1010)
root["tags"] = ["a", "b"]                       // RUNS — the SAME literal without the null
const t: Json[] = ["a", null]                   // annotate, then assign — RUNS
```

### P3 — generic walker

**RUNS.** `count` → `4`; `jsonKind` → `object array null number string boolean`;
`deepEquals` → `true false true true false`

```vl
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }

function count(self: Json): i32 {
  if self is Json[] {
    let n = 0
    let i = 0
    while i < self.length {
      n = n + count(self[i])          // array element: no hoist needed
      i = i + 1
    }
    return n
  }
  if self is { [string]: Json } {
    let n = 0
    for k in self {
      const v = self[k]               // D1009: count(self[k]) is a check reject
      if v == null { n = n + 1 } else { n = n + count(v) }
      //           ^^^^^^^^^^^ the leaf rule is now duplicated at the CALL SITE
    }
    return n
  }
  return 1
}

function jsonKind(self: Json): "null" | "boolean" | "number" | "string" | "array" | "object" {
  if self == null { return "null" }
  if self is boolean { return "boolean" }
  if self is f64 { return "number" }
  if self is string { return "string" }
  if self is Json[] { return "array" }
  return "object"
}

function deepEquals(self: Json, other: Json): boolean {
  if self == null { return other == null }
  if self is boolean { if other is boolean { return self == other } return false }
  if self is f64 { if other is f64 { return self == other } return false }
  if self is string { if other is string { return self == other } return false }
  if self is Json[] {
    if other is Json[] {
      if self.length != other.length { return false }
      let i = 0
      while i < self.length {
        if !deepEquals(self[i], other[i]) { return false }
        i = i + 1
      }
      return true
    }
    return false
  }
  if self is { [string]: Json } {
    if other is { [string]: Json } {
      if self.size != other.size { return false }
      for k in self {
        if !other.has(k) { return false }
        const a = self[k]
        const b = other[k]
        if a == null || b == null {          // D1009 again — and this block is
          if a != null || b != null { return false }   // where the bug goes (F2)
        } else {
          if !deepEquals(a, b) { return false }
        }
      }
      return true
    }
    return false
  }
  return false
}
```

`jsonKind`'s ladder works today, bare `return "object"` fall-through included, so §2.8's
"nineteen lines in every walker" is really six — worth shipping mostly to stop six subtly
different spellings of it existing.

### P4 — the declined helpers, as plain VL

**RUNS.** `svc` · `8080` · `2` · `a` · `1.5` · `true` · `true` · `true`

```vl
function get(self: Json, key: string): Json {
  if self is { [string]: Json } {
    const v = self[key]
    if v == null { return null }
    return v
  }
  return null
}

function at(self: Json, index: i32): Json {
  if self is Json[] {
    if index < 0 { return null }
    if index >= self.length { return null }
    return self[index]
  }
  return null
}

// … the same `type Json` and the same built tree as P1 …

const name = root.get("name")
if name is string { print(name) }
const port = root.get("port")
if port is f64 { print(port as i32) }
const tv = root.get("tags")
if tv is Json[] { /* … P1's 9-line loop, unchanged: the helpers do not touch it … */ }
const cpu = root.get("limits").get("cpu")   // 2 lines where P1 needed 4
if cpu is f64 { print(cpu) }
print(root.get("limits").get("mem") == null)    // true
print(root.get("limits").get("disk") == null)   // true — the distinction is GONE
const t1 = root.get("tags").at(1)
if t1 is string { print(t1 == "b") }        // `t1 == "b"` direct is an emit refusal (F4)
```

**The helpers build, chain three deep, and cost 16 one-time library lines.** They cannot be
declared `: Json | null` (F3), so "absent" and "present null" are the same answer by
construction — worse than the doc says, because `has` is not reachable through the chain at
all: a consumer needing missing-vs-null abandons the chain for that read and writes P1's
spelling beside it.

---

## Workarounds → row

| # | workaround the program needed | row |
| --- | --- | --- |
| 1 | hoist **every** map read into a local before `is` — `if m["k"] is T` narrows nothing | **NEW — gap A** |
| 2 | bind + `== null` before handing a map read to a `Json` callee | D1009 |
| 3 | annotate a null-bearing array literal before assigning it | D1010 |
| 4 | narrow to `string` before `==` against a literal | clause-2 literal, unfiled reach (F4) |
| 5 | spell an object binding `{ [string]: Json }`, never `JsonObject` | D1022 (emit half) |
| 6 | never declare `: Json \| null` | **NEW — gap C** |
| 7 | hand-roll an 8-line range-and-integrality-checked `f64 → i32` | language, unfiled |
| 8 | duplicate the null-leaf rule at every map call site | D1009 (consequence) |

---

## Findings, by impact

### F1 — the idiom's cost is NOT D1009/D1010, and §2.8's second ground for declining the helpers is false

§2.8 declines the helpers partly because "two of its four hoists exist only because of
D1009", and predicts that fixing D1009/D1010 gives you
`if r is {[string]: Json} && r["users"] is Json[] && …`. **That chain cannot work, and
D1009/D1010 are not what stops it.** A string-key index place is not a narrowable place at
all:

    NEW GAP A — loud check reject, `cannot assign string | f64 | null to 'z' of type string`
    let m: { [string]: string | f64 } = Map()
    m["a"] = "x"
    if m["a"] is string { const z: string = m["a"] print(z) }

    CONTROL — integer-key element place, one token different, RUNS and prints `x`
    let xs: (string | f64)[] = []
    xs.push("x")
    if xs[0] is string { const z: string = xs[0] print(z) }

Ablated: recursion, the alias and a ref arm are all NOT ingredients, and it is not the miss
sentinel — **no fact of any kind lands on the place**, not even nullness
(`if m["a"] != null { const z: string | f64 = m["a"] }` → `cannot assign string | f64 | null
to 'z' of type string | f64`). Mechanism: `placeKeyOf` (`compiler/typecheck.vl:3985`) mints
an Index key only when `intLitTextOf(n.idxIndex)` returns digits, so a string subscript mints
`""` and `pushNarrowFact` drops the fact. This is where arrays were before **D11** in
`silent-class-inventory-2.md`, whose ten rungs built the integer-literal half and stopped;
the map half is the same landing one subscript kind over. Run today, §2.8's own chain fails
with `member access '.length' on non-object Json | null` — a message that names the miss
sentinel and hides the cause.

**Recommendation.** File gap A, and re-state §2.8's build list as D1009 + D1010 + **the
map-key place**. Until the third lands, "hoist every read" is permanent, and it is 7 of P1's
27 lines.

### F2 — D1009's workaround has a wrong spelling that checks, runs, and is silently wrong

The compiler refuses the correct `deepEquals` and accepts this one:

    CHECKS, RUNS, prints `true` — and the two documents are NOT equal
    for k in self {
      if !other.has(k) { return false }
      const a = self[k]
      const b = other[k]
      if a != null && b != null { if !deepEquals(a, b) { return false } }
    }
    // deepEquals({"mem": null}, {"mem": 1.5})  →  true

`a != null && b != null` is the *obvious* repair of `argument 1: expected Json, got Json |
null`, is shorter than the correct one, and makes a present null compare equal to everything
— the round-trip-and-diff test §6 names, quietly passing. **Recommendation:** the strongest
argument here for prioritising D1009 over D1022, and for the module shipping its own
`jsonEquals` rather than leaving every consumer to write the null dance.

### F3 — `Json | null`, the signature every accessor wants, is check-clean and emit-refused

    NEW GAP C — vl check rc 0, then `emitProgram: bare null needs a struct-typed context`
    type Json = null | f64 | Json[]
    function g(): Json | null { return null }
    print(g() == null)

    CONTROL — one token removed, RUNS and prints `true`
    function g(): Json { return null }

`null` is already an arm, so `Json | null` and `Json` denote the same set. Ablated: recursion
is NOT an ingredient (`type P = null | f64; function g(): P | null` refuses identically), and
`return null` is not the only trigger — returning `1.5` from the same signature refuses one
step later with ``emitProgram: `is` names a type that is not a union variant``, so the
composed **type** has no rep in either direction. Related to D1009-N (same membership fact,
check side, value direction) but a different position: this one the checker admits.
**Recommendation:** file gap C — it is the signature a consumer writes for `get` first, and
the shape §2.8's helpers would have to avoid in std too.

### F4 — `==` against a literal over a `Json` is an emit refusal

    vl check rc 0, then `emitProgram: `==` over a struct union is not supported yet`
    type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
    const v: Json = "b"
    print(v == "b")

`v == null` is fine; `v == "b"` is not. Every `if body.get("kind") == "user"` — the single
most common line in JSON-consuming code — needs an `is string` first. The literal is one of
the clause-2 phrases `goal-scoreboard.py --sites` counts, and per CLAUDE.md all such literals
are reached by **no corpus cell**; this is a three-line hand probe for it.

**Recommendation.** Add it to `scripts/capability-probes/` under the json campaign. Not a
`std:json` API question, but it is on the critical path of every consumer of the API.

### F5 — the `f64 → i32` step traps on legal JSON, and the safe spelling is eight lines

`as i32` truncates toward zero and **traps** out of range. A document with a perfectly legal
number kills a `vl check`-clean program at runtime:

    TRAPS — `wasm trap: integer overflow`
    cfg["port"] = 3000000000.0
    …
    if p is f64 { print(p as i32) }

What a careful consumer writes instead, measured (`false true true true`, then `8080`):

    function asExactI32(self: f64): i32 | null {
      if self != self { return null }                 // NaN
      if self < -2147483648.0 { return null }
      if self > 2147483647.0 { return null }
      const t = self as i32
      if (t as f64) != self { return null }           // 8080.7 is not an i32
      return t
    }

Three failure modes (out of range, non-integral, NaN), each silent-or-fatal in the naive
spelling, and no std module offers the bridge: `std:fmt` has `parseI32` for *text*, nothing
for a number already in hand.

**Recommendation — disagree with §2.3's "no".** The `f64` arm is right, and it is *because*
it is right that something owes the way back. `asExactI32(self: f64): i32 | null` belongs in
`std:fmt` beside the `parseI32` family — a number question, not a JSON one, and putting it
there stops `std:json` growing a numeric surface. Not speculative: P1, P2 and every handler
reading a port, count, index or status code needs it.

### F6 — D1010 refuses exactly the literal the tree exists to hold

`root["tags"] = ["a", "b"]` runs; `root["tags"] = ["a", null]` is a check reject. A JSON
array with a null in it is not an edge case, it is the reason `null` is an arm.
**Recommendation:** keep D1010 sequenced with D1009 as one membership predicate, as its row
says — the json surface is a second consumer for it, not a new one.

### F7 — D1022's readable half already works; the refusing half is the line every builder writes

With the aliases declared **after** the tree: `is JsonObject`, `is JsonArray` and
`let a: JsonArray = []` all RUN (prints `array`, `object`). The single refusal is
`let o: JsonObject = Map()` → `unsupported map value type … interned no mv slot`. So the
`is` sites — the ones that read badly — already work; the position that refuses is the one
line in P1 and P2 a consumer cannot avoid. **Recommendation:** keep D1022 non-blocking, but
sequence its EMIT half as the part with user-visible value, not the checker half.

### F8 — a consumer cannot write a cycle-safe walker at all

The tree admits cycles (§2.7, re-run: representable). `count` and `deepEquals` above both
trap on one and a consumer cannot defend: `===` does not parse today (`expected an expression
but found EQUAL`), so no seen-set exists outside std. §2.7's depth cap protects `parseJson`
and `toJson` — it protects **nothing a consumer writes**. **Recommendation:** say so beside
the cap in the module header (a *parsed* tree cannot contain a cycle, so the exposure is
program-built trees), so nobody reads "depth cap 128" as a property of the type.

---

## Answers to the five questions put to this angle

**1. Is the helper decline right? — No, overturn it.** Same five extractions: **P1 27 lines /
7 `is` / 7 hoists → P4 20 lines / 6 `is` / 5 hoists**, plus 16 one-time library lines, minus
missing-vs-null. A weak win — because P1 is shallow. On the doc's OWN §2.8 example
(`users[0].name`, depth 4), both spellings run and the helpers are **9 lines / 4 `is` /
3 hoists → 2 lines / 1 `is` / 0 hoists**. The value scales with path DEPTH, not field count,
and real documents are deep. The decline's ground 2 — a compiler gap D1009/D1010 will close —
is **false as stated** (F1): the `&&` chain it predicts is blocked by the map-key place,
which is neither row and is not on the build list. So the difference is a LIBRARY gap that
was mis-attributed to a compiler one; ground 1 (name squatting) stands and the noun-first
spelling answers it. **Ship `jsonGet`/`jsonAt` in v1**, documented as the lossy path with
`has` named as the alternative — every consumer writes them otherwise, and each hand-rolled
copy re-decides what a missing key returns.

**2. A third gap the idiom hides? — two.** The map-key narrowing place (F1, gap A) is
load-bearing; `Json | null` having no rep (F3, gap C) is what would force even std's helpers
to be lossy. Adjacent third: `==` against a literal (F4).

**3. `JsonObject`/`JsonArray`?** Cosmetic where they work, load-bearing where they don't —
F7. `is { [string]: Json }` is fine to read in practice.

**4. The `i32`-from-`f64` step?** F5 — the naive spelling traps on legal input, so the module
(or better, `std:fmt`) owes the bridge.

**5. Footguns, ranked.** (a) the D1009 null repair that compiles and is wrong (F2);
(b) `as i32` on a number off the wire (F5); (c) `get(k) == null` read as "absent";
(d) writing `: Json | null` (F3).

---

## Verdict on §6's five decisions

1. **Names — `parseJson`/`toJson`: KEEP** — `s.parseJson()` is what the hand types, and one
   `toJson` across both stages is worth more than noun-first symmetry.
2. **Large integers — silent rounding: KEEP** — a `precision` error makes a whole document
   unparseable over one field a program may never read, and stage 3 is the exact path.
3. **Helpers — OVERTURN, ship `jsonGet`/`jsonAt` in v1** — the decline's compiler-gap ground
   does not survive being run (Q1, F1).
4. **Error type — one `JsonError`: KEEP** — every program here writes `if r is JsonError` and
   nothing else, so a render-side twin buys a distinction no consumer branches on.
5. **Input type — `string` only: KEEP** — nothing in these four programs wanted `u8[]`, though
   this is a vote on the shape rather than a measurement, since D1021 blocks the call.

---

## Appendix — provenance

Seed: `scripts/refresh-compiler.sh` on `e40ffbf8` (the shared seed was stale — see the
header). Runner: `VL_STD=$PWD/std scripts/vl-host/target/release/vl run …` from the worktree
root; P1–P4 are the final working spellings, run verbatim. The two NEW gaps (A, C) are
minimised to three lines with a one-token control each and are **not filed as inventory rows
here** — the coordinator owns that.
