# Step 7 L2 D6: a ref-list element's struct row is read off its tagged form, 2026-11-13

Lane F, D6 `nonNulBaseOf` callers, `rlElemStructRow`. Measured at master `739db770` (with
#7728's `monoTagMapRepTy`).

## What changed

`rlElemStructRow` finds a ref-list element's struct row by the element's recorded type, in five
rungs. The first three are unchanged:
1. arena identity;
2. the canon-key row;
3. the row the type is stored at.

The new rungs:

4. **The row of the tagged form**, through `tagRepTyFn`. It is installed from `emit_sections` as
   `monoTagMapRepTy(ty, [], [])`, the type `monoTagMapRepName` spells: one level deep, with each
   tagged function at its id type.
5. **The rows the element type cannot find** (`rlElemStructRowOfName`):
   - an untyped element whose name is a literal's `#anonN` handle (`anonPinRow`, the exact
     handle test from #7687);
   - by name, a function-holding record: the D16040 floor;
   - -1 for any other element. That is the answer the name lookup gave for every such program.

The name parse used to run at every call. It now runs only for a function-holding record that
no type rung finds.

## Decision table (probes, the whole sweep population)

| class | rung that now finds the row | programs |
| --- | --- | --- |
| tagged function sets (`{f: (_) => _}` stored at `{f: i32}`) | 4: tagged form, equal to the name's row | 8 |
| an untyped `#anon` literal row | 5: handle | 1 |
| D16040: a generic call's records listed at the call's untagged type | 5: name | 6 (7 with D16040's own witness) |

**Two refused versions.**
- A loud floor for every element the types could not find failed the self-compile. Callers ask
  about non-record elements too, and rely on -1.
- A loud floor for record elements without function fields lost 6 runs (D15285, D4875 and four
  `tests/cases`). The name lookup also answered -1 there, so they are declines, not floors.

## Measurement

Sweep with fixpoint seeds, master `739db770` → this: all 24,206 the same. A probe build marks the
name lookup: it is reached in 7 programs, all D16040's family, and finds a row in each.

## Left

D16040 itself: the mint should key the slot by the held rep (lane F, next cut). Then the name
rung, and `rlElemStructRow`'s last `nonNulBaseOf`, go.
