# Step 7 slot layer, family B, 8a: two same-shape declarations answer one struct row, 2026-11-11

This is the first slice of "one struct row per canonical record type", the struct class of
`2026-11-11-step7-famb-struct-index-of-expr-graded.md` (§ Rep is a struct, other row). Base is
master `658a3841` (#7174).

## The census: which rows share a canonical type

A probe compared every pair of struct rows at the end of `emitProgram`. A pair counted when the
rows' types were one canonical type (`tySame` on `sTyIx`). It sorted each row by where its name
came from:

- `decl`: a declared record;
- `anon`: a literal's `#anonN` row;
- `spell`: a spelled shape, `{v:i32}`.

It then compared the two rows' layouts: field count, names in order, field codes. The sweep
covered 23,902 programs. Counts are **programs**, and a program can count under several pairs:

| pair | same layout | layout differs |
| --- | --- | --- |
| decl, decl | 215 | 0 |
| spell, decl | 208 | 0 |
| spell, spell | 205 | 1 (field count) |
| anon, anon | 202 | 9 (field code) |
| decl, spell | 120 | 1 (field order) |
| anon, spell | 83 | 0 |
| spell, anon | 6 | 5 (field code) |

899 programs hold two rows of one canonical type, and in all but 16 of them every such pair has
one layout. Field order is already canonical (D622).

## What changed

- **`declTwinRowsCanon` (`emit_collect`)** runs after the declaration loop of `collectS`, and
  after D1050's re-lay. It maps each declared row onto the first earlier declared row whose
  type is the same canonical type and whose field rows are identical:
  - field names;
  - codes (`sFieldTypeAt`);
  - element names.
- **`structIndexByName` (`emit_atom_kinds`)** answers that row for the later declaration's name
  (`sNameCanon`).
- The later row is still minted. Its layout is the earlier one's, so nothing that walks rows
  sees a different shape.

## Measurement

- **The alias fires** in 408 programs. In 149 of them a reader asked for the twin's name.
- **A candidate and base sweep of the 23,902 programs are all the same**, module bytes included.
  Same-layout rows of one type are one WasmGC heap type after canonicalisation, so the row a
  name answers changes no instruction. The table now says what the module already did.
- **`structIndexOfExpr` against the rep read** (the famb 5 probe, re-run on the candidate):
  1,707 programs before, 1,710 after (`Call` same-type rows 41 to 44). The rep's struct read
  is not a by-name read. It takes the row of a whole spelled shape (`repStructRowByShape`, which
  indexes only `{…}`-spelled rows), else the type's own recorded row. So this slice does not
  move that class.

## What is left: famb 8

The rest of one row per canonical type is the other row populations:

- spelled-shape rows;
- `#anonN` rows (w311's 80 `#anonN` map-value rows, where `sTyIx` and `anonRowTyOfName`
  disagree, are the same family);
- `litIdRowOfSameTy` (#7171), which a general key subsumes.

Each mint (six sites: `collectS`, `#anon` literals in `emit_collect`, three in
`emit_shape_intern`, `#ref` rows in `emit_union_atoms`) answers the canonical row of its type
when one holds the same layout. The 16 programs whose layouts differ under one type are
measured first.

## Proof

- Refresh is at 6,616,321 bytes on base, and 6,620,508 bytes merged with master `d9031606` (#7182).
- `regress.vl`: no runs lost.
- `cases_wasm_*`: 7,436 passed.
- `vl_check_codegen` and `vl_scaling_shape`: passed.
- `lint-self` and its budgets: clean. The dead-export budget: ok.
- Seed size: +0.4% on its baseline.
- The `sweep` label re-proves the population. Expected movers: none.
