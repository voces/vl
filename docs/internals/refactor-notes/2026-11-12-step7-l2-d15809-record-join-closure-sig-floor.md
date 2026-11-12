# Step 7 L2 §7: a record `if` that joins functions of two signatures into one closure field is refused (D15809 contained), 2026-11-12

D15809 (w308) is a check-clean program that traps with `indirect call type mismatch`:

```
const q = if two() > 5 { { f: half } } else { { f: inc0 } }
print(take(q))
print(take2(3, if two() > 5 { { f: dbl } } else { { f: inc0 } }))
```

The fix is on the tag side and is not local (w308's notes on the row), so this PR is the clause-1
floor: the trap becomes a refusal.

The base is master `01f723226`, with a fixpoint seed on both sides.

## The mechanism

- `q` is typed `{f: (_) => _}`.
- When its members also reach `take2`'s hole parameter inside a literal adopted at a closed
  closure record, the function set is not tagged. `q` is then built as a closure record.
- The closure struct carries no signature. Its `then` arm stores `half`'s `(f64) -> f64` thunk
  and its `else` arm stores `inc0`'s `(i32) -> i32` thunk.
- `take`'s `return_call_indirect` reads the field at one of those signatures, so the arm that
  ran with the other one traps.

## Changed

`emitIfExprRef` (`compiler/wasmEmit.vl`) refuses a record join whose arms are object literals
storing, in one field, function values with two different `$fnsig` indices. A field whose
function set is tagged is skipped, because it holds an id and dispatches by it.

## Graded

w308's ablation set, on this seed:

- **Trap → loud:** `d09`, `e9_a`, `e9_lit3`, `e9_sepfn`, `m9_sameT`.
- **Loud, still loud:** `m9_h2`, with this refusal in place of the earlier one.
- **Runs, unchanged:** `e9_b` (`4 4 1.25`), `e9_c` (`4 1.25`), `m9_both` (`4 4 1.25`), `t09a` (`4`).
- **Runs → loud, the priced spelling:** `e9_qhalf`. It printed `1.5 4 1.25` only because the
  join's `then` arm (`half`) is the one at the call's signature. The same join with the other
  arm taken traps.

## Not covered

- A `match` or block join that stores the same split. `emitIfExprRef` sees an `if` chain only.
- A split delivered through a call's returned record. w308 is measuring that family tag-side.
