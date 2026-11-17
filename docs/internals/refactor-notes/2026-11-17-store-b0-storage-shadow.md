# B0: the storage shadow, 2026-11-17

Lane STORE, stage B0 of storage per (KeyId, parameter)
(`2026-11-17-store-storage-per-key-param-design.md`, rulings in DECISIONS 2026-11-17). It decides
nothing. It reports, per row, whether the facts a per-row decision reads exist at check.

## What it reports

`check_inst_keys.vl` (`ikStorageRows`), appended to `$VL_INST_KEYS`'s rows and built only when
asked:
- **One row per recorded call (`instVecAt`), parameter, and set the argument holds.** That covers the
  argument's own set and any set held in a list element, map value or record field. The argument
  node is read, not the binding vector, because the vector's closed signature loses the set's identity.
- **The row's key.** It is the call's binding with each hole parameter handed a set bound at that set,
  as the elaboration keys it by function identity (`Fn#…`). A binding counts as closed when every
  type variable in it sits inside a function set's type.
- **Facts.** These are the calls through the parameter, or through a field or element path from it,
  whose callee holds the row's set. Their argument types are substituted by the key, and each
  member's result there is the call's shape.
- **Open reasons:**
  - `key`: the binding stays open;
  - `unmatched`: the elaboration minted no instance of that key;
  - `written`: the parameter seeds a written binding (B1's input);
  - `nested`: called inside a function nested in its owner;
  - `args`: a call's argument types stay open under the key.
- **Per set:** the storage the elaboration gave it, its rows, its complete rows, its distinct call
  shapes over the complete rows (more than one is class G's signature), and the elaboration's instance
  rows that hold it.

No module-level state is added; the rows go on the A0 report's existing list. The arena walk
that indexes the calls through parameters runs once per armed compile (`asAllow` in `lint.vl`).

## Reading

`$VL_INST_KEYS=1 $VL_LATE_DEMANDS=1 vl check --codegen tests` (7,253 programs), master `54733d1ac`
with this change, fixpoint seed.

| | rows | programs |
|---|---|---|
| storage rows at check | 2,430 | 636 |
| complete | 2,012 | 550 |
| open: key | 131 | 54 |
| open: written | 89 | 37 |
| open: args | 85 | 22 |
| open: unmatched | 85 | 28 |
| open: nested | 28 | 10 |
| the elaboration's instance rows | 3,022 | 696 |
| sets with two or more call shapes | 128 | 100 |

The late tag rows of the same run (444), each joined to its file's `storage set` row by members:

| late row's set at check | rows | by class |
|---|---|---|
| complete, one shape | 219 | T 71, G 68, N 50, P 19, J 9, C 2 |
| complete, shapes differ | 42 | G 24, N 6, P 5, T 4, C 3 |
| no check row; the elaboration has one | 84 | T 45, N 23, P 8, G 5, V 3 |
| no check row at all | 28 | N 28 |
| open: written | 30 | G 14, N 9, S 7 |
| open: unmatched | 22 | N 19, G 3 |
| open: args | 10 | V 10 |
| open: key | 5 | N 4, T 1 |
| open: nested | 4 | P 2, G 1, V 1 |

What it says for the stages:
- **B1 (the written-binding join)** is S's whole residue: all 7 S rows are `open: written`, beside 23 G
  and N rows.
- **B2 (rows that agree)** has 219 late rows whose check rows are complete with one shape. Those are
  the candidates. Each still needs the decider's holder rules per row, so 219 is a ceiling, not a
  count of rows that move.
- **B3 (storage in the key)** is where the 42 rows with differing shapes go: G's 24, and 18 of the
  sets other classes name, whose keys ask different signatures.
- **N's producer gap:** 112 late rows have no check row. For 84 of them the elaboration has an
  instance row, so the set reaches a parameter through a call the check does not record (a call
  through a function value, a member call, a lambda). For 28 it has none, because the set never
  reaches a parameter at all. B0's per-set rows name the files, and they schedule that work.

## Grading (fixpoint seeds both sides, master `54733d1ac`)

- Unarmed: `vl check --codegen tests` output byte-identical; `@run` A/B 6,701 programs, 0 wasm movers.
- `tests/vl_inst_keys_test.ts`: armed, one storage summary with a complete row.
- L2 self-compile fuel: 95.731G against master's 95.579G measured alike (+0.16%).
- Phase-state census ok, no rise; `emit_mono.vl` functions 908; seed +0.9% on baseline; lint clean.
