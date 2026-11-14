# L5 step 0: the phase-state ratchet, 2026-11-14 (lane Q)

Step 0 of `2026-11-14-phase-products-design.md` §3. It ports that note's census to
`scripts/phase-state-census.vl` and makes it a per-module ratchet with
`scripts/phase-state-baseline.txt`. It runs as the `phase state` row of `scripts/gate.sh` and the
`Phase state (ratchet)` step of `ci.yml`. It changes no compiler code, so the seed is unaffected.
The census takes about 2 s.

## What it counts, per compiler module

| metric | counted against | design note | this tool at `208e52d08` |
|---|---|---:|---:|
| `hidden` | the declaring module: a `let` that some function saves (`const L = G`) and then writes | 188 | **188** |
| `cross` | the declaring module: state written in one phase and read in another, or written by two phases | 544 | **593** |
| `surface` | each non-checker module: the checker symbols it imports | 1,166 distinct | **1,166 distinct** (2,790 imports summed over modules) |

`--check` fails when any module's count is above the baseline. A count that falls is printed, and
the PR that earned it runs `--write-baseline`. `--list` names every counted row, with the
function and line that made it count.

## The `cross` difference is a fix

The design note's Node census treated a function as running from its header to the next
column-0 `}`. A one-line function such as `export function relSkew(sp: i32): i32 { … }`
(`emit_reloc.vl:24`) closes on its own line, so that rule ran it on into the following module code:

- The Node census made `relSkew` a "setter" of `fold`, the table declared below it, and counted
  `fold` as written by 21 call sites in three phases.
- A write inside `arenaEpochBump` (`ast.vl:505`) was attributed to the one-line accessor above
  it. So `arenaEpochBump` was never seen as a setter, and its three callers outside `ast.vl`
  (`json_walk`, `parse_bank`, `parser`) were not counted as writes.

The VL port takes extents from `scripts/lib/ladder-walk.vl` (`functions`, which balances braces),
which is the same reading the kind-ladder tools use. Against the Node output, the VL count adds 69
tables and drops 20, a net of +49. Three rows were traced to function extents by hand
(`arenaEpoch`, `elabCapOn` and `fold`). The other 86 were not traced one by one. `hidden` and `surface` agree exactly with the note. The design note's 544 should read 593.
The coordinator folds that figure.

## Control

`tests/vl_phase_state_test.ts` builds a two-module miniature under `--root`: a checker function
that consumes a global, and an emit module that sets the global and imports the function. The
test asserts four things:

- `--list` names the global under `hidden` and `cross`, and counts both imports under `surface`.
- An empty baseline reds all three metrics with `0 -> n` rows.
- A written baseline passes.
- Adding a scoped (save, set, restore) global reds `hidden` again.

`tests/ci_proof_test.ts` and `scripts/ci-proof.sh` list the new gate row as covered by CI.
