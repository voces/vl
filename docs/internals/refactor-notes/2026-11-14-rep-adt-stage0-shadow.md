# Rep ADT stage 0: the `VKind` shadow and the tree-rebuild counter, 2026-11-14 (lane E)

This is stage 0 of [the Rep ADT design](2026-11-14-rep-adt-design.md) §3. Everything it adds is an
instrument, armed by `$VL_REP_SHADOW`, the existing rep-shadow switch. Unarmed, it changes no
emitted byte. It was measured at master `fe9585a72`.

## What it adds

**The rebuild counter** (`emit_rep.vl`):
- Every `repTreeDrop` now names its cause: `declRows`, `variants`, `variantBit`, `reset` or
  `sweep`.
- Every whole-tree rebuild in `rtSync` is counted in a bucket keyed by emit phase and cause, as
  `rtRebuild/<phase>/<cause>`. The nodes each build allocates are counted as
  `rtNodes/<phase>/<cause>`.
- A cause is the first axis that moved since the last build, in this order: `tyMutEpoch`, then
  `cUserTypesVer`, then the drop's own cause.
- The sweep's own rebuild is discarded, so the counts are the compile's.

**The `VKind` shadow** (`emit_vk_shadow.vl`):
- For every entry of the kind tables, it compares the kind the table holds with
  `repOfTy(type).rdKind` for the same type. The tables are:
  - locals, by declaration;
  - loop variables, at their list's element type;
  - results (`fRetKind` against `fRecRetTy`);
  - parameters (`vtKindOfParam`);
  - globals (`globalCellKind`).
- Each comparison lands in a `repAB/vkind <table> -> agree | noTy | uncovered | <legacy> tree=<kind>`
  bucket. A disagreement on a result or a parameter names its function.
- Struct field codes are left to stage 3, since they are not `VKind`.

Both surface through the existing report (`rep-shadow[...]: unsup <bucket> x<n>`). The host is
unchanged.

## Byte identity

- The master seed and this tree's seed compile this tree's `compiler/*.vl` to identical bytes:
  `refresh-compiler.sh` run twice, compared with `cmp`.
- That self-compile is the identity proof for the unarmed instrument over a 403k-line program.
- Seed size: 6,819,233 → 6,823,464 bytes, +4,231 (+0.06%).

## Readings: the self-build (`vl build compiler/entry.vl`)

| bucket | rebuilds | nodes built |
|---|---|---|
| `passes/first` | 1 | 2 |
| `passes/variantBit` | 51 | 938 |
| `passes/declRows` | 2 | 49 |
| `monomorphized/variantBit` | 6 | 2,639 |
| `arenaFinal/variantBit` | 1 | 29,391 |
| **`tyMutEpoch`, any phase** | **0** | 0 |
| **`cUserTypesVer`, any phase** | **0** | 0 |

That is 61 rebuilds and 33,019 nodes, of which the final tree holds 29,391. Rebuilding costs
3,628 extra nodes, which is 12% over one build.

| table | agree | other |
|---|---|---|
| local/let | 48,142 | 0 |
| local/loopVar | 3,490 | 26 `noTy` (a non-list iterable) |
| param | 31,976 | 0 |
| result | 16,953 | 15 `i32 tree=closure` |
| global | 6,159 | 0 |

The 15 result disagreements are all one shape. Each is a hook setter, such as `heldRepMintOn(f)`
(`emit_state.vl:1150`), whose tail expression assigns a function to a global. The recorded
result type is therefore that function type, while `fRetKind` holds the void result's `i32`. No
caller reads the value.

## Readings: the distilled corpus (`cells/` + `named/`)

These are the 8,583 programs that reach emit, out of 11,934 cells. The rest stop in the checker.

| table | agree | `noTy` | disagree |
|---|---|---|---|
| local/let | 72,643 | 619 | 6 `variant tree=struct` (5 programs) |
| local/loopVar | 239 | 2,378 (a string, map or range iterable) | 0 |
| param | 51,398 | 143 | 0 |
| result | 43,922 | 183 | 4 `i32 tree=closure` (`__lambda_0` ×2, `g` ×2); 6 `uncovered` (3 programs) |
| global | 16,187 | 1,035 | 0 |

That is 184,389 agreements and 16 disagreements.

| rebuild cause | rebuilds | programs | nodes |
|---|---|---|---|
| first | 8,583 | 8,583 | 16,508 |
| variants (`rvsSync`'s key: pass or `uVarTyIxResets` moved) | 20,179 | — | 123,840 |
| variantBit (`rvsAdd` set a new bit) | 12,733 | — | 64,288 |
| declRows | 2,656 | 2,107 | 5,242 |
| **tyMutEpoch** | **107** | **103** | 229, all in the `monomorphizing` phase |
| **cUserTypesVer** | **0** | 0 | 0 |

That is 44,258 rebuilds, a median of 5 per program and a maximum of 13, and 210,107 nodes.

Byte identity on the corpus: every 15th cell (795 programs) was built with the master seed and
with this seed, comparing exit code and module bytes. 575 of them build a module. Zero differ.

## What this decides

**Stage 2's gate.** The coordinator ruled the gate as all three rebuild axes at 0 during emit.
- `cUserTypesVer` is 0 everywhere.
- `tyMutEpoch` is 0 on the self-build. On the corpus it is 107, in 103 of 8,583 programs, all in the
  `monomorphizing` phase, inside `emitProgram`. Lane H's stage 4 seals the arena after checking,
  which removes it.
- **The variant-shape axis is not 0, and lane H's hash-consing does not remove it.** `rvsSync`
  drops the tree whenever a record shape gains a variant bit. The bits come from three sources
  (`emit_rep.vl:4069–4079`):
  - the checker's declared variant members (`cVariantMemberTyIxs`, bit 1);
  - pre-registered shapes (`rvsPreTys`, bit 4);
  - the emitter's own union-variant rows (`uVarTyIx`, bit 2).

  The third source makes a record's rep depend on emit-time registration, so the rep is not a
  function of its type. In the ADT, `RRecord.rArm` must come from the checker alone.

So stage 2 does not wait for lane H. It waits on one decision, made in stage 1: `rArm` is read from
the checker's union membership, and bit 2 of `rvsAdd` stops dropping the tree. On this
measurement the cost of not deciding it is small (12% extra nodes on the self-build). The real
cost is correctness: a rep read before a later variant registration is stale.

**Stage 2's movers.** Where the shadow disagrees, stage 2 moves a byte. The full list:
- the 15 compiler setters, and the corpus's 4 `i32 tree=closure` results (`d15199_run_function_field`,
  `d15220_run_coerced_holder`, `d511_coal_fn_{match,nomatch}_ret_none_direct`). The legacy table holds a
  void result, and the tree reads the tail's function type. The result value is unread, so the
  mover is expected to be none. That is to be confirmed when the site converts.
- `variant tree=struct` locals, 6 in 5 cells (`b000017`, `b000057`, `b000058`, `b000418` ×2, `b000498`). A record literal that the legacy path types as a
  union arm (the delivery decides), while the tree types it as a plain struct. This is the
  `rArm` decision above, from the other side.
- `uncovered` results, 6 in 3 named cells. The tree has no top kind for these results; the three
  `d947_price_*` cells return `boolean | null`, a record or `null`, and `string | null` through
  `std:test`. Stage 1 owes the tree an answer for them.

## Cost

| | |
|---|---|
| net compiler lines | +179 (`emit_rep.vl` +85, `emit_sections.vl` +6, the new `emit_vk_shadow.vl` +88) |
| pin-helper delta | 0 (baseline 908) |
| unarmed guest fuel (`plumb-shape-cost.vl`, `SEED=` the master seed vs this one) | main unit +3,121 (9,231,899,118 → 9,231,902,239, +0.00003%), tail +862; the row's +2.9% and +1.8% against its baseline are already on master |
| peak live heap (the same runs) | +2 KiB main, +1 KiB tail; peak RSS is not graded on this box (no GNU `time`) |
| seed size | +0.06% |

Stage 0 is the one stage that adds lines. They are an instrument, and they leave with stage 2,
when the legacy tables they compare against are gone.
