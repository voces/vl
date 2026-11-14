# Type hash-cons stage 1 (1a–1d): type parameters are identified by their declaration slot (lane H), 2026-11-14

Stage 1 of `2026-11-14-type-hashcons-design.md` §2.4, minus the substitution and the shadow
rename, which are 1e. Every declared type parameter row now carries `(tvKind, tvBinder, tvIdx)`:
the `FuncDecl` or `TypeDecl` node and the parameter's position. Two readers that used to rebuild
that identity from side tables now read it off the row.

| step | change | shadow over the generic population |
|---|---|---|
| 1a | `TyVar` gains `tvKind`/`tvBinder`/`tvIdx`. `mkTyVarSlot` is added, with the per-slot bound table `tvSlotSet`/`tvSlotBound`/`tvSlotPrintsAsBound` that lane I's row variable uses. | n/a: nothing reads it |
| 1b | The three parameter mint sites pass their slot: `fnDeclPushTyParams`, the annotation resolver (`resolveAnnotAt`/`resolveRetAnnotAt` take the binder), and the generic-alias banker. | n/a |
| 1c | `tySame`'s parameter arm compares slots. **Deleted:** `tyVarDeclOwner`, its setter and its reader. | 196 decisions, 0 disagreements, 0 unslotted rows |
| 1d | `tvNestDeclOf(row)` is the row's binder when that binder is a nested generic. `nestParentOf` moves to `check_types.vl`. **Deleted:** `tvNestOf`, `markNestRows` (which re-derived the table by name-matching parameter and return types), and three dead parameters. | 18,130 reads over 677 files, 0 disagreements |

The populations:
- **generic files:** every 8th of the 6,517 corpus and `tests/cases` files that declare type
  parameters, 814 in all;
- **nested-generic files:** all 101 with a nested generic declaration.

Holes are untouched. Their identity, and `tyVarOwner` (which holes read), are stage 2's.

Measured against the merge base's own fixpoint (`1ed15ff6`, built from `git archive`):

| reading | value |
|---|---|
| seed | fixpoint; 6,825,819 → 6,825,238 bytes (−581) |
| L2 identity | both seeds build the base's `compiler/entry.vl` byte-identically |
| corpus identity, per step | 1b: 596 of 596. 1c: 1,410 of 1,410 (sample plus generic files). 1d: 1,489 of 1,489 (plus all nested-generic files). Every file has the same module and the same diagnostics. |
| L2 guest fuel | 85,627,117,650 → 85,625,058,295 (−0.002%) |
| L2 peak RSS | 4,276,352 KB → 4,269,696 KB |
| plumb fuel | main 9,231,875,343, tail 6,688,466,076 (flat against stage 0) |
| net compiler lines | +28: 1a +74 (the slot fields and the bound table), 1b–1d −46 |
| pin helpers (`emit_mono.vl`) | 908 → 908 |
| byte movers | none |

Still to do in stage 1:
- **1e:** mono's substitution keyed by slot instead of name. That deletes `tyVarRenameRow`,
  `tyVarRenames`, its two memo stamps and `monoShadowRenameDecl`'s `__sh` alias.
