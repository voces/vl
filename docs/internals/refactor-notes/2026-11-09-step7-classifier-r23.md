# Step 7: classifier round 23, the identifier cell reads its declaration, 2026-11-09

Round 23 starts from round 22 (#6998, master `deeca2a1`), where
`classifier-census.vl` reads 53 probed classifiers, all post-only. It uses round 22's method. A
scratch compiler wraps each classifier, runs it and a typed twin, and counts `SH <fn> = <tag>` or
`SH <fn> <legacy>/<typed> <tag>` under `$VL_CLS_CENSUS=1` over the 23,800-program sweep population
(`--keep`). The tag names the read's declaration: parameter, own, captured or module-scope `let`,
loop variable, function, or none.

**The census needs a host binary from Nov 8 or later.** A prebuilt `scripts/vl-host/target/release/vl`
from before fe659e02 (#6947) has no `$VL_CLS_CENSUS` support. It writes no `[cls]` rows, and the
census then reads every classifier as `uncalled`. That is the local `tests/vl_cls_census_test.ts`
failure on cloud boxes. `cargo build --release` in `scripts/vl-host` fixes it.

**Shadow** (post-mono, calls):

| classifier | typed twin | agree | disagree |
| --- | --- | --- | --- |
| `identCellVKind` | round 22's: the read's storage rep kind | 4,228,236 | 31,711 |
| `identCellVKind` | the declaration's storage class, then `letCellKind(d, owner)` | 4,220,947 | 18,395 |
| `identCellVKind` | + module-scope block `let`s at `letCellKind(d, -1)`, a `ForRange` variable's slot | 4,239,016 | 326 |
| `identCellVKind` | + the slot first, the D14910 decline, and no cell for a slotless `let` of the asking frame (shipped) | 4,239,068 | 0 |
| `identStoreVKind` | the same reader without the slotless gate (shipped) | 509,207 | 0 |
| `letCellSlot`'s `struct`/`variant` arm | `repSlotOfKind(k, letBindTy)` | 20 | 10 (stands) |
| `cloValueCallRetKind`'s `Member` arm | a callee typed as a function | 19,989 | 788 (stands) |

**Switched.** `identStoreVKind` is one reader over the read's declaration (`identDeclOf`):

* A parameter reads its annotation (`paramTypeNodeOfRead`), or its capture when another frame declares it.
* A `let` reads its slot in the frame being emitted, then `letCellKind` in the frame declaring it
  (`readDeclOwnerOf`), then the global's cell. Module scope declines a function body's `let`
  (D14910). A module-scope block `let` reads `letCellKind(d, -1)`.
* A loop variable reads its slot or its capture.
* Anything else is null, a function name included.

`identCellVKind` is `identStoreVKind`, except that a `let` of the asking frame with no slot yet
has no cell. The old order was parameter, slot, capture by NAME, global. It goes, and so does the
by-name capture lookup for a `let`. Both functions go to the census's `NOT_BLIND`.

**`letCellSlot` stands.** The arm is reached 30 times, all at `arenaFinal`. Its 10 misses are
bindings typed by a named record alias or intersection (`type AB = A & B`, `CD`, `Both`, `Isect`),
where `repStructRowOfTy` finds no row under the name and the initializer's row is the real one. The
missing fact is the named intersection's row. Its reader would need a mint on a miss, which the
rulings exclude.

**`cloValueCallRetKind` stands, and its legacy answer is the right one.** The 685 `null/X` calls are
record fields typed as a hole or generic function (`{f: (_) => _}`, `{f: (T) => T}`). In those, the
field holds no closure and the call lowers to the generic directly (D6342), so it is not a call
through a function value. `memberIsClosure` reads the row's field code, which is the rep fact. The
103 `X/null` calls are operator fields (`.[]`, `.+`, `.*`) and two methods, whose minted callee
`Member` has no function type recorded. The type is a function in every case and the rep is not,
so this is no latent bug. Its two callers ask only for `nulnone` and `map`, and no disagreement is
either one.

**Census** (`classifier-census.vl`):

| tree | probed | post-only | pre-only | both | uncalled | warnings |
| --- | --- | --- | --- | --- | --- | --- |
| master `deeca2a1` | 53 | 53 | 0 | 0 | 0 | 0 |
| this PR | 51 | 51 | 0 | 0 | 0 | 0 |

**Proof.** Both sides are fixpoint seeds. Master `deeca2a1` (round 22 merged) is 6,589,488 bytes and this PR is 6,589,685
(+197).
