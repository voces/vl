# The 253 numeric no-record deliveries, classed by ablation (2026-11-08)

Step 5. Follows `2026-11-08-payload-compound-residue-records.md` (#6865), which left 253 numeric
deliveries with no record at 18 positions, `emitFnTagDispatch`'s 474 aside.

## Method

`probe.sh`'s shadow, with each row also naming its node's kind, type and ctx record, over the 124
sweep files that carry one. Each (file, site pair, position) was delta-debugged to a minimal
witness by greedy line removal, keeping a removal only while `vl check` stays clean and the row
stands. Each class was then ablated one ingredient at a time. A class is what its witness
needs, never its position.

## This PR's records

| class | needs | record | moved |
|---|---|---|---|
| union `==` against a number | a union operand, a wide concrete one | `numOwnStamp` in `binOperandsStamp` where the pair rule has no answer | 17 → table |
| loop and labelled-block exits | `break @L v` or a tail into a wide join | `numExitsStamp` per exit in `lpPopResult` | 3 → table |
| a tail typed `never` | a call that never returns in a value arm | none owed: `numFloorWhy` names it `floor: never returns` | 8 → named floor |

Two more moved with them: a type-param `==` and a generic join exit, both at their instance.

## What stands, 223

**Step 2, 79.** Re-measure these when step 2 lands.

| class | n | witness |
|---|---|---|
| a hole function's call result returned | 33 | `function w(h, x) { return h(x) }` called as `w(half, 3.5)` |
| a hole-typed value (un-annotated parameter) | 21 | `function f(v) { const xs = []; xs.push(v) }` called as `f(2.5)` |
| a type-parameter value | 17 | `function f<T>(x: T) { const l = []; l.push(x) }` called as `f(1.5)` |
| a generic instance's own nodes | 7 | `const v: A \| B \| null = if … { a } else { b }`, then `W(0, 2.5, 4.5)` |
| a `null` hole filled later | 1 | `let x = null; if c { x = 1.5 }` |

**Site-owned, 27.** The site mints the value at the width it delivers, so no checker pair exists.

| class | n | witness |
|---|---|---|
| hex literal width hoisted into a closure write | 17 | `let x: i64 = 0; const set = () => { x = if c { 0xfffffffe } else { 1 } }` |
| `??` integer default minted at the `i64` arm (3 are the payload's) | 8 | `function g(x: i32 \| i64 \| null): i64 { x ?? 5 }` |
| literal tree at a wide destination | 2 | `const e: i64 = ~0 >>> 1` |

**Step 5's own, 117: records not yet written.** Each is a checker delivery that stamps no pair.

| class | n | needs | witness |
|---|---|---|---|
| get-or-default read: the `has ? read : 0` desugar's nodes | 43 | a scalar map read, `.get` or `.pop` (annotation or not) | `const m: {[i32]: f64} = Map(); const v = m[9]` |
| captured-union closure write | 19 | a closure and a union target | `let v: boolean \| f64 = true; const k = () => { v = 2.5 }` |
| push into an open list | 18 | an un-annotated `[]` | `const b = []; b.push(2.5)` |
| set into an open map | 8 | an un-annotated `Map()` | `const c = Map(); c.set("a", 2.5)` |
| operator or getter receiver | 8 | a user `[]`/getter over a scalar | `function "[]"(self: f64, i: i32): i32 { 99 }` then `xs[0]` |
| extern function value | 6 | the extern as a value, not a call | `extern function nowMillis(): i64; const v = nowMillis` |
| literal-union element widened | 5 | `for x in xs` over a mixed-width literal union | `(9000000000 \| 1)[]` summed into `i64` |
| boolean cast source | 4 | `as` from a boolean | `print(false as i64)` |
| a labelled block with no `break` | 3 | `const c = @B { 2.5 }` | its let init reads the tail, not the loop |
| nested else-if join | 2 | an inner join typed as a union | `if q != null { q } else if r != null { r } else { 2.5 }` |
| `??` hit of a literal union into a wide join | 1 | `N \| null ?? 5000000000` | `type N = 1 \| 2` |

## Shadow and floors (`run.sh`, sweep population, fixpoint seeds)

SHADOW_TABLE

## Step 5 against its done criterion

Not met. Step 5 stands at the 117 above, eleven classes of record work, each with a witness. The
474 `emitFnTagDispatch` arms and the 79 step-2 rows wait on step 2. The 27 site-owned rows and the
`never returns` floor are named and need nothing. Apart from those, step 5 is done once the 117
take the table.
