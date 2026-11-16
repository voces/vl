# A15.2 — struct keys for `Map` and `Set`: design note for a ruling

ROADMAP Next item 7, Track A A15.2. This note asks for a ruling. **No code is written until one
is given.** The questions come in two kinds. Q1–Q3 were ruled on 2026-09-01
(`docs/identity-design.md` §0 decision 5), and the note asks only for those rulings to be
reconfirmed. Q4–Q7 were never ruled. Each question lists its options and a recommendation.

## Today (measured on master `d30dbc538`)

- `{[K]: V}` and `Set<K>` take `string`, `i32` or `i64` keys. Any other key type is refused
  once, at the annotation: `A P-keyed Map isn't supported yet — `Map`/`Set` keys must be
  `string`, `i32` or `i64``. `f64`, `boolean`, `i32[]` and record keys all get this refusal.
  It is a capability refusal (clause 2): `==` accepts every one of those types.
- The refusal cascades. Every later `m[k]` adds `array index must be i32, got {x: i32, y: i32}`.
  That is filed as D16688.
- `==` is structural, and the key relation would inherit it unchanged:
  - `{x: 1} == {x: 1}` is `true`;
  - two `i32[]` with equal elements are `==`;
  - `{x: 0.0} == {x: -0.0}` is `true`;
  - a record holding NaN is not `==` to itself;
  - two same-shape union values are `==`;
  - `null == {x: 1}` is `false`.
- Some types are refused by `==` itself, so they can never be keys:
  - a map, whose insertion order makes value equality ambiguous;
  - a record with a function field (Go's rule).
- A map iterates in insertion order (`m["b"]`, then `m["a"]`, iterate `b, a`). No program can
  observe a hash.
- The rep is the i64 key's from D2505: a 32-bit tag per key, the shared pair index, and a probe
  that confirms a tag match against the stored key. A struct key fits it: the tag would be a hash
  of the key's fields, and the confirm would be the key type's `==`.

## Q1. Which keys are eligible? Ruled 2026-09-01; reconfirm

- **(a) Every type `==` accepts.** That is records (nested ones too), lists, `f64`/`f32`,
  `boolean`, nullables and unions of these. This is the ruling. Rust's field restriction (no
  floats, no lists) was refused.
- (b) Records of scalar and string fields only.
- (c) The (b) types, plus lists and nested records.

**Recommend (a), as ruled.** One relation: a key is found exactly when it is `==` to the stored
key. Rolling the work out in stages is a build-order choice, not a language one. Each stage
retires part of today's refusal, and a stage never refuses a type the design allows.

## Q2. What does "the same key" mean for floats? Ruled; reconfirm

- **(a) It means `==`.** The hash folds `-0.0` into `0.0`, so `0.0 == -0.0` finds its entry. A
  NaN anywhere in a key is inserted and never found (IEEE, and Go's behaviour). The `Map` header
  states this. This is the ruling.
- (b) Treat NaN as equal to itself for keys only, as JS `Map` and Java do. That gives two
  relations, and a key would no longer be found exactly when it is `==`.

**Recommend (a), as ruled.**

## Q3. What happens when a key is mutated after insertion? Ruled ("lost"); reconfirm or change

A record key is a reference. `p.x = 9` after `m[p] = v` leaves the entry stored under the old
hash.

- **(a) The entry is lost.** It is no longer found under either the old or the new value, and
  iteration still yields it. This is Go and Java behaviour, and the ruling. The map stores the
  reference: no copy, and `m.keys()` yields the very objects inserted.
- (b) The map snapshots the key at insertion. A deep copy is stored, so mutating the caller's
  record cannot affect the map. This costs an allocation per inserted record and a walk over
  nested lists. `m.keys()` then yields copies, so `===` against the inserted object is `false`.
- (c) Refuse it at compile time: a record that reaches a key position may never be written
  again. That needs alias tracking across calls, the same problem the narrowing-ends-at-call rule
  only approximates. Undecidable in general; any version would be conservative and refuse sound
  programs.

**Recommend (a), as ruled.** It is the one option with no hidden cost and no identity surprise.
The `Map` header says what it costs. (b) is the only alternative worth having. Choose it if the
owner wants keys to behave as values at the price of a copy per insert.

## Q4. A key value wider than `K` (width subtyping). Open

D4054 and D3431 take an existing record at its own type: under `{x: 1, y: 2}` passed where
`{x: i32}` is expected, the value's type stays `{x, y}`. Today
`const p: {x: i32} = {x: 1, y: 2}; p == {x: 1}` is `true`, which compares at the fields both
sides name. A map keyed `{x: i32}` can therefore be handed `{x: 1, y: 2}` and `{x: 1, y: 3}`.

- **(a) One storage, one layout** (D4054's contract). A map whose keys arrive at two layouts is
  refused, as a slot fed two layouts is. A literal key is built at `K`. An existing wider record
  makes `K` its own type, provided every key reaching the map shares it.
- (b) Convert at insertion: copy the key down to `K`'s fields. Then `{x: 1, y: 2}` and
  `{x: 1, y: 3}` are one key.
- (c) Store the wider record and compare at `K`'s fields (a view). One key again, but
  `m.keys()` yields a value carrying the `y` of whichever was inserted first.

**Recommend (a).** It is D4054's existing rule applied to one more storage, so it needs no new
sentence. (b) and (c) both make two different values one key without the program saying so.

## Q5. Can keys be compared or hashed by the user? Open, though it follows from D46

- **(a) No.** No `hash()`, no custom `==` (D46), no comparator argument. The hash is never
  observable, because iteration is in insertion order.
- (b) An optional `hash`/`eq` pair as a `Map` constructor argument.

**Recommend (a).** (b) brings back the custom `==` that D46 refused, through a side door. A
program wanting identity uses `IdentityMap` (A15 item 3). A program wanting a coarser key builds
that key, as with any value.

## Q6. Iteration order for struct keys. Open, and it should just follow

- **(a) Insertion order**, as for `string`, `i32` and `i64` keys.
- (b) Unspecified.

**Recommend (a).** It is what the other key types already promise, and (b) would make program
output depend on a hash no program can see.

## Q7. Union and nullable keys across arms. Open, and it follows from `==`

`{[A | B]: V}` with record arms, and `{[P | null]: V}`:

- **(a) Follow `==`.** Values in different arms are different keys. A `null` key is a single
  entry. Two same-shape aliases are one variant (shape discrimination), so they share keys.
- (b) Refuse union and nullable keys.

**Recommend (a).** The key relation is `==`; refusing the types where `==` already works would
be a clause-2 refusal by choice.

## What the build does once ruled (for scheduling, not for ruling)

1. Lower one `__hash_K__` and one `__eq_K__` per key type, from the same per-type walk `==`
   already emits, so hash and equality cannot disagree (decision 5).
2. Add a fourth key kind, `MAP_KEY_VAL`, beside `MAP_KEY_STR/I32/I64`. It reuses D2505's tag
   index, and its probe confirms through `__eq_K__`.
3. Wire every delivery position (index read, write, `has`, `delete`, `keys`, `Set.add`, iteration,
   map literal) and grade them on a position-matrix template, in both faces, before the refusal
   at `check_leaf_steps.vl` is narrowed. That is CLAUDE.md's capability-gap order.
4. Gate: a module with no struct-keyed map builds byte-identically, as D2505 required for `i64`.
