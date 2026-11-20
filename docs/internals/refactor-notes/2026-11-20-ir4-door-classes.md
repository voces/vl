# IR list-literal door: a valued `if` element, and the start's string accumulator (2026-11-20, lane IR4)

This is step 3 of the f32 sequence. It closes two general miss classes, which matter at every
arm, not only at f32.

First, a re-measure of every arm on master 718055f, tagging at the shadow hook (an earlier tag
named a nested literal's inner arm). It found no `context live` row left at the list-literal door:
none of the §10.2.1 guard's arms fires on an `ArrayLit` root. The substitution parameter (step 2)
is deferred until the door widens past list literals.

## `an if outside a body walk`

`fragmentBody` called `node` on each statement of a fragment. A valued `if` (an element
`[if c { x } else { 0.75 }]`) is opened by `body`'s frame walk (`ifOpen`, `ifClose`), and `node`
only misses it. `body` is now `bodyOnto(b, tail, out, p0)`, which leaves the top frame's stack
temps in the caller's `p0`. `body` still requires them consumed, and `fragmentBody` hands them to
the fragment's value.

## `string accumulator`

The door's start branch refused whenever the start's accumulator scan had marked any binding
(`startStrAccMarked`). That guard was copied from `buildStart`, which lowers after legacy has run.
At the door, legacy is writing the body, so the rows are that body's own. The IR already lowers an
append through `strInPlaceMode`, which rescans only when the rows are another body's. A rescan
would rewrite legacy's rows mid-emit, so the guard is now exactly that: `strAccRowsAre(fnIx)`, in
both the function and the start branch. A constant initializer holds no assignment and is exempt.
An append inside a literal still misses, by the IR's own `string append site`.

## Measured

Fixpoint seeds: master 8e301ffc3 against this branch merged onto it.

| at the door | master | this branch |
|---|---:|---:|
| corpus + cases matched | 32,006 | 32,097 (+91) |
| `string accumulator` | 88 | 0 |
| `an if outside a body walk` | 7 | 0 |
| self-compile matched | 13,560 | 13,572 (+12) |

Corpus + cases is 12,304 `distilled` cells plus 7,304 non-`@error` `tests/cases` files, and
38,817 literals reach the door on both sides. Of the 95 that left the two classes, 91 match. The
other 4 reach a later miss: `array union element rep` +2, `progress cell` +1, `rep null` +1. No
row reads `differ`.

| bar | result |
|---|---|
| `ir-identity.sh --names` | identical 9,037, differ 0; self-compile identical |
| `--cases` | identical 7,516, differ 0; witnesses same 59, differ 0 |
| mode 3 / claimed | identical; 18,140 (master 18,139) |
| L2 fuel | +0.005% on master (102,901,758,176 vs 102,896,403,510) |
| pin helpers | 905 (`emit_mono.vl` untouched) |
| `gate.sh --fast` | passed |

**Controls** (`tests/vl_ir_door_guard_test.ts`):
- A list literal holding a value `if` matches.
- A start-body literal beside a proven string accumulator matches.

Each fails on the previous seed, with the miss it closes.

**Lines: compiler +20 / −11, tests +40.**
