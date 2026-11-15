# Bucket (g): the ruling packet, 2026-11-15

Lane O, for the coordinator. This note is docs only, and it is not addressed to the owner.

- **Population:** the 28 rows that [the r1 bucket pass](2026-11-15-r1-clause2-bucket-pass.md) puts in bucket (g). D3689 and D3703 (`f64 is <integer literal>`) are among them.
- **Status today:** all 28 are open (`ls.vl -- --status open`). Today's only change to them was #8301's bucket marks.
- **How the answers were read:** each witness ran on master `660af42ff` under the compiler (vl) and under the oracle (`scripts/oracle/oracle.ts run`).
  - Where an option is what the oracle already models, its answer is the oracle's own output.
  - Elsewhere the answer is worked by hand from the option, and marked *(by hand)*.
- **How the questions were grouped:** by the ingredient each row's own ablation table names, not by message.

| outcome | rows |
| --- | --- |
| already ruled, so dropped | 2 |
| no design question: a diagnostic, cascade, measurement or instrument defect | 16 |
| design questions | 10 rows in 8 questions |

## 1. Already ruled

| row | witness | the ruling that covers it |
| --- | --- | --- |
| D3230 | `r.f() ?? "n"` with `f: (() => …) \| null` is refused | D3197, closed and re-graded 2026-11-14: a direct call of a nullable function is a refusal the design owes, and #3289 made the hole spelling refuse too. The row is only the direct spelling of that ruling. |
| D3482 | `const xs: f32[] = [16777217]` is refused | DECISIONS, the exact-constants rule (D1890): an integer constant at `f32` must be exact. The row stays open only for its wording (`cannot assign i32[] …` names neither the constant nor the destination), so it belongs with the diagnostics. |

## 2. No design question (16 rows)

These are defects in a sentence, a count or a tool. None asks what a program means.

| kind | rows |
| --- | --- |
| a measurement or an instrument | D1666 (a count of the refusal sites), D2308 (`fuzzgen.vl`'s leaf set) |
| the refusal is owed, but its sentence or hint is wrong | D2540, D3470, D3471, D3819, D4053 |
| a cascade or a duplicate report after a correct first error | D2293, D3321, D3771, D3983, D3984, D4057, D4060, D4193, D4985 |

## 3. The design questions

Each question below lists its rows, the ingredient the ablation isolates, and two or three options. Every option has a one-line consequence and the answer for each witness under it.

### Q1. Does a `readonly` view of a wider element type observe writes to its source? (D3040, D3056)

- **The ingredient:** a written source list delivered to a `readonly` destination of a wider element type.
- **Today:** refused (`covarValueWriteState` / `covarWriteThrough`). The refusal dates from when that delivery made a snapshot copy. Since D3028 and D3041 the emitter builds a view that reads through its source, and the union twin (D3026) is already accepted.

| option | consequence | D3040 (`l.push(3)`, then `r.length`) | D3056 (`a[0] = {r: 7}`, then `b[0]`) |
| --- | --- | --- | --- |
| (a) yes: lift the refusal for a `readonly` destination only. A mutable destination stays refused (A9). | a readonly view is a live alias, as the union view already is | `3` (oracle) | `7` (oracle) |
| (b) no: keep the refusal | a written list never reaches a wider readonly view; the union twin is the outlier | refused | refused |

### Q2. What is `f64 is <integer literal>`? (D3689, D3703)

- **The ingredient:** an `f64` receiver tested against a single integer literal.
- **Today:** an emit refusal, pending the ruling (D14642). The union spelling `d is 1 | 2` prints `false` without reading `d`, and an `f32` receiver is refused at check.

| option | consequence | D3689 (`1.0 is 1`) | D3703 (`2.0 is 2`) |
| --- | --- | --- | --- |
| (a) refuse at check, as the `f32` receiver is, naming `d == 1.0` | float equality is not set membership (`-0.0`, NaN), so `is` never asks it | refused | refused |
| (b) compare by value | the literal adapts to its use, as in a join; `-0.0 is 0` is `true` | `true` *(by hand)* | `true` *(by hand)* |
| (c) a type test: an `f64` is never an integer literal type | matches the union spelling today | `false` (oracle) | `false` (oracle) |

### Q3. Can a generic `T[]` parameter take a union of two list types? (D2772)

- **The ingredient:** an argument typed `string[] | i32[]` meeting a `T[]` parameter.
- **Today:** the checker admits the call and the monomorphizer refuses it. The generic spelling (`h<T>`) is refused at the argument since #3207 (`… is two list types, not one list`).

| option | consequence | `glen(q)`, `q = h(true, "s")` |
| --- | --- | --- |
| (a) refuse at the argument, as #3207 does | one rule for both spellings; the message names the argument | refused |
| (b) distribute: the call takes `T` per member, at the member the value holds | a call over a union of lists works without a cast | `1` (oracle) |

### Q4. Does a method member in a record type take parameter names? (D3270)

- **The ingredient:** `{ area(scale: f64): f64 }`, where ruling A1 (2026-09-29) lets a function *type* name its parameters.
- **Today:** a parse error.

| option | consequence | `total(3.0)` |
| --- | --- | --- |
| (a) yes, as documentation, under A1's rule: all or none, outside identity | the member and the function-type spellings read alike | `6` *(by hand; the oracle does not parse it either)* |
| (b) no: a member's list takes types only | A1 stays scoped to function types | parse error |

### Q5. Does a `(` on the same line, after a complete expression, continue it as a call? (D3409)

- **The ingredient:** `print("a") (nf() ?? nf())` on one line.
- **Today:** a call of `print`'s `void` result, refused. Statements in a block need no separator, and the leading-`(` rule (DECISIONS, "`(` and `[` do NOT continue") is about a *new* line only.

| option | consequence | the witness |
| --- | --- | --- |
| (a) yes, as every C-family language does (status quo) | the refusal stands; at most, a hint names the two statements | refused (the oracle prints `a`, then faults at the call of `void`) |
| (b) no: a same-line `(` after a complete expression starts a new statement | the spelling runs; `f() (x)` can no longer call a returned function | `a`, `nf`, `nf`, `true` (oracle, on the newline-split spelling) |
| (c) two statements on one line need a `;` | removes the ambiguity at its source; existing one-line blocks change | parse error |

### Q6. Is a nested block an `if` arm's value? (D16382)

- **The ingredient:** `if true { { id } } else { 0 }`. The bare `if true { id } else { 0 }` runs.
- **Ruling A1 (2026-11-15) does not decide it:** A1 rules `{` after a function signature and after `=>`, and an arm's inner `{ id }` is in statement position, so it is a block.
- **Today:** refused, `this arm yields no value`.

| option | consequence | `f(3)` |
| --- | --- | --- |
| (a) a block in an arm's tail position yields its own tail | blocks nest as values; D3477's function-tail face stays A3's refusal | `3` (oracle) |
| (b) a nested block is a statement, so the arm has no value (status quo) | a value comes only from an expression tail | refused |

### Q7. May a narrowed record be delivered when no later write can reach it? (D14827, the owner's option (c))

- **The ingredient:** `x is A`, then `const y: A = x` and `useA(x)`, with nothing writing `x` afterwards.
- **Today:** ruling (c) (D4928 for lists, D4084 for records) refuses every such delivery and names the copy. DECISIONS calls the relaxation low priority.

| option | consequence | the witness's loop |
| --- | --- | --- |
| (a) keep ruling (c): never delivered | simple and sound; a correct program needs a field copy | refused (`… cannot be delivered as A. Copy it with '{ kind: x.kind, r: x.r }'`) |
| (b) deliver when no write can reach the value after the narrowing | the copy is needed only where a write follows; the checker needs a reachability fact | `useA circle`, `circle`, `B zz`, `useA round`, `round` (oracle) |

### Q8. What overwrites every field of an existing record in place? (D3642, sunpa SP-032)

- **The ingredient:** resetting a pooled record while its other holders see the reset.
- **Today:** record spread does not parse, so the witness is a parse error. Once spread lands it runs (`2`), but `p = { ...p, x }` allocates and rebinds, so `pool[0]` keeps the old record.
- **Related:** AE-004 (ROADMAP backlog) is the unaliased optimisation, which changes no meaning.
- **The distinguishing variant:** `const held = pool[0]`, reset `pool[0]`, then `print(held.x)`.

| option | consequence | `held.x` after the reset |
| --- | --- | --- |
| (a) no new surface: spread rebinds, and AE-004 makes the unaliased case in place | every alias keeps the old record, so SP-032's ask is unmet | the old `x` *(by hand)* |
| (b) a std `copyInto(dst, src)` for two records of one type | an explicit, greppable in-place write; no syntax | the new `x` *(by hand)* |
| (c) an assignment form that writes fields in place (spelling to be chosen) | in-place writes become ordinary syntax; it needs a spelling that cannot be read as a rebind | the new `x` *(by hand)* |

## Notes for the coordinator

- Q1 and Q2 are the two where the oracle already answers one option outright and the compiler refuses. Lifting either refusal is a small change once the answer is ruled.
- Q6 is close to A1 and may be the cheapest to settle alongside the return-rule flag day.
- Q8 is a capability question rather than a reading question. It is the only one whose witness changes outcome once a separate feature (record spread) lands.
