# AE-004: a vector stored in a record field

Status: the struct-field proposal landed 2026-11-15 (`FC_V128`). Measured outcome in
`refactor-notes/2026-11-15-lane-l-fc-v128.md`. Rows: [D16480](inventory/D16480.md) (perf),
[D16481](inventory/D16481.md) (clause 2), [D1981](inventory/D1981.md) (clause 2, the
struct-field face).

## The ask, and what the tree does

Aeomach's report is that at -O3 an `F32x4` held in a record field allocates on every write,
while a local does not. The witnesses mostly agree, with one correction: the bare spelling
does not compile at all.

- **A bare `F32x4` field is refused at check** (`v128NestCheck`, check_annot_resolve.vl; D1981).
  The emitter has no struct-field code for `v128` either: lifting the checker alone gives
  `emitProgram: struct field type has no struct-field rep`. I probed this with a seed I threw
  away.
- **`F32x4 | null` is the only record spelling that compiles**, and it is the general union box
  `(struct i32 (ref null (struct v128)))`. At -O and -O3 a write builds two `struct.new` per
  iteration; a read builds none (D16480).
- **A record literal holding a vector is refused** even when its annotation names
  `F32x4 | null` fields, so the workaround the refusal recommends needs a `null` literal and a
  write after it (D16481).
- **"Locals are scalarised"** holds only because an `F32x4` local is a wasm `v128` value: there
  is nothing to scalarise. A loop-carried *record* local (`{x, y, z: f32}`) still allocates
  every iteration at -O3, as the record field does. That record face is the roadmap's AE-004
  wording ("an unaliased record field reassigned in place"). It is a different and harder fix,
  covered in the last section.

## Where the decision is made

There is no scalarisation pass in VL. The allocation is a matter of representation:

1. The checker refuses any container whose type nests a `v128` (`tyNestsV128`). This covers an
   array element, a struct field, and a map key or value.
2. The emitter turns each field type into a field code (`nameFieldCodeTy` →
   `fieldCodeOfTyCovered`, emit_shape_intern.vl). `v128` has no code, so a nullable or union
   member goes through the union box (`FC_UNION`).
3. Binaryen's heap2local removes an allocation only when it never escapes. A box stored into a
   field escapes, so -O3 keeps both allocations.

## Proposal: lower an `F32x4` field as a `v128` struct field

WasmGC allows `v128` as a struct field type, so `{ p: F32x4 }` becomes
`(struct (field (mut v128)))`. A write is one `struct.set` and a read one `struct.get`, with no
box and no tag.

- **Emitter.** Add a new field code `FC_V128`, plus one arm at each per-code site: the value
  type byte (emit_bytes), the code-of-type ladder, field-shadow, atom kinds, eq rows, shape rows,
  anon fields, and the wasmEmit default/store arms. That is about ten sites, each already a
  one-line arm for `FC_F32`. `struct.new_default` zeroes a `v128` field, and that zero is the
  vector a `Buf` load of zeroed memory gives.
- **Checker.** `tyNestsV128` stops counting a struct field. Arrays and maps keep their refusal
  until they have a lowering of their own (a `v128` array is a GC `array v128`, a separate
  change).
- **Refusals inherited by design.** `==` between vectors and `print` of a vector are refused by
  design (no single answer for four lanes), so record `==` and record `print` over a vector
  field refuse with those sentences, not new ones. Before narrowing, a probe confirms each one
  names the contract.
- **Order** (CLAUDE.md §capability gap): build the lowering first, then wire every delivery
  position, then narrow the gate. Positions:
  - literal;
  - field write and compound write;
  - field read;
  - a record passed, returned, or held in a global;
  - spread and copy;
  - a record arm of a union;
  - a generic record instantiated at `F32x4`;
  - `--stable-layout`.

  A `v128-struct-field.matrix.vl` template grades all of these in both faces.
- **`F32x4 | null` fields** keep the union box. They could become a single `ref null (struct
  v128)` niche, but once a bare field lowers the nullable spelling is a choice, not a forced
  workaround, so this is deferred.

### Size and CPU estimate

20,000,000 iterations of `p = p + v`, built `-O3` and run as a prebuilt module. Median user
CPU of 10 runs, on a quiet box (load 2.6 on 4 cores):

| spelling | module | user CPU, median (min–max) | wall, median |
| --- | --- | --- | --- |
| `F32x4 \| null` field (today) | 390 B | 0.205 s (0.168–0.265) | 0.317 s |
| lanes in a `Buf` field (workaround) | 338 B | 0.053 s (0.049–0.054) | 0.053 s |
| `F32x4` local (lower bound) | 149 B | 0.019 s (0.015–0.032) | 0.019 s |
| `{x, y, z: f32}` record field reassigned | 192 B | 0.166 s (0.152–0.198) | 0.265 s |

A `v128` struct field does the `Buf` loop's work: one load, one add, one store, with no
bounds arithmetic. The projection is therefore at or below the `Buf` row: about **4× less user
CPU** on the boxed spelling, and wall time falls further because collector work disappears.
The two ranges do not overlap, so the median-of-10 bar is met with room to spare if the
lowering lands as designed. The witness module should shrink from 390 B to about 200 B, since
the tag tests and box types go. Peak RSS was not measured: `/usr/bin/time` is not on the box,
so the build PR reads it with `plumb-shape-cost.vl`.

The compiler cost is about +20 to +30 lines and no new functions. The seed's own size is
unaffected, because the compiler holds no vectors.

## AE-004's record face

Landed 2026-11-16 another way than the one below: the record type is never written, so a copy
cannot be told from the shared box and no alias analysis is needed. The `-O` inline-record step
already stored such a field's record in its parent, and it now takes apart a global
initializer too (D3679). Measured in `refactor-notes/2026-11-16-ae4-record-field-inplace.md`.
The text below is the analysis as it stood before.


Turning `r.f = { x: …, y: …, z: … }` into `struct.set`s on the record already in `r.f` is sound
only when nothing else holds that record. That needs an alias fact the compiler does not
record (the `= { … }` RHS is fresh, but the *old* `r.f` may have been read into a binding that
outlives the write). Proving it needs a whole-function escape analysis. Binaryen's heap2local
does not attempt it, and VL's L2 binding facts do not exist yet. The record row above is its
baseline: 0.166 s, with one allocation per iteration. A `{x, y, z: f32}` written as an
`F32x4` with a zero w is the supported fast spelling once this proposal lands.
