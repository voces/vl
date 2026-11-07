# Instance identity for a non-function argument, measured

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### Instance identity for a non-function argument, measured (2026-11-07, master `7a471b8c7`)

**The spelling does not decide which instance a call reaches.** When the spelled key misses,
`monoTypedInstKey` re-keys the request. Each pin is keyed by `tyCanonKey` of the type the clone
resolved it to, a record pin by its row class (`#row`, D15262), and a `=>` pin by its closed
function type. An instance registered under that key serves the request only when
`elabInstSpelling` of the two elaborated instances agrees. So instance identity is `tyCanonKey`,
plus the row class, plus the elaboration gate. Mono's pin string still feeds the instance's
function name and its annotation text, but not dedupe.

**Where mono's spelling and the elaboration's disagree.** This is the scoping that motivated the
measurement: the call-param cascade's `monoArgTyName` against the elaboration's type, and
`monoSubstLetType`. All 720 rows are `tySame`.

| group | call-param (616) | let (104) | what it needs |
|---|---|---|---|
| closes with the registry-row name (`sNames[repRowOfTyStruct]`) | 252 | 33 | a row-name fact |
| fn sig keys (`=>i>i` against `(i32)=>i32`) | 166 | 9 | `monoFnTyPin` spelling |
| two declared names, one row (`Circle$m…` against `Dot$m…`) | 38 | 31 | a naming rule (today: first in collect order) |
| mono spells the shape, the fact names the row (`{r:i32}[][]` against `#anon1[][]`) | 47 | 13 | a naming policy (D12641) |
| alias or union names or order | 63 | 18 | alias canonicalization |
| `T\|null` against `T` | 17 | 0 | not row identity |
| the probe's renderer gap (empty nominal render) | 33 | 0 | unclassified |

None of the 720 rows splits an instance: the typed key already merges two spellings of one type.

**Probe 1, re-keying by `repCanonKey`.** Over 19,338 programs, 7,194 of which mint 20,199
instances, each minted instance was re-keyed with every pin head replaced by `repCanonKey` of its
type. That gives 65 groups holding more than one instance. 52 of them touch a function-holding
pin, which is #6619's. The other 13 groups (26 instances, 10 programs) are all ones the
elaboration keys apart. 10 already share a typed key and are refused by the gate. The other 3
merge only under `repCanonKey`, which folds a literal union to its base: `("a"|"b")[]` and
`("x"|"y")[]` both key `(string|string)[]`. **Merged instances: 0.**

**Probe 2, every typed-key lookup that finds an entry.**

- For non-function pins, 522 requests in 190 programs are served by an existing instance, 358 of
  them under a different pin spelling.
- 10 requests in 8 programs are refused, and each refusal is a real difference:
  - Set against Map;
  - `Rows<TValue>` against `Rows<Node>`, apart only in a brand parameter;
  - `{h: A | null}` against `{h: A}`;
  - `(1|2)?` against `i32?`;
  - `{x: string}` against `{x: i32 | string}`.
- Function-holding pins: 23 served, 122 refused (#6619).

**Why the key stays `tyCanonKey`.** The elaboration spells a binding as `elabCanonStr`, which
sorts union members and keeps literals, or as `tyToStructStr`; a record goes by its row class.
`tyCanonKey` is that equivalence. The two rep keys are coarser:

- `repCanonKey` folds a literal union to its base and softens a literal-union field. Its only new
  candidates are the 3 groups above, and the gate refuses all 3.
- `repRowKey` also keys every function type as its closure cell, which the elaboration keeps
  apart by signature.

Either switch would add candidates the gate can only refuse, and close nothing.

**A merge cannot make an annotation's text disagree with its type.** A typed hit mints no node. The
instance's parameter annotation is synthesized once, at mint, from one request's pin text and pin
type, so `synthTypeRefTy`'s text and `tyIx` come from the same pin. A merged caller's type has the
same `tyCanonKey`, or the same row class for a record, so the step-7 spelling scans resolve the
same row for it.

**What the pin string is still for: the name, not the identity.** `monoArgTyName`'s cascade now
serves only the instance's function name and its annotation text, which the step-7 scans read.
Which of its arms can go is graded by output, since names move bytes. An arm the scans need waits
on the naming rule.
