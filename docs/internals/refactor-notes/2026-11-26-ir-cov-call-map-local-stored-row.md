# IR: a map local's reads follow the row it is stored at (2026-11-26, COV-CALL)

This is the first PR of the "place reads at storage" series (coordinator ruling 2026-11-26: maps,
then list elements, then records, one read-site family per PR).

**Mechanism.** Take a `Map()` local whose record value widens only through a later view (`const g:
{[string]: J} = m`). Legacy declares its cell from the cell plan's stored shape. The IR typed the
local at its checked type, so the first read missed with `convert map -> map`.

Each new reader uses plan facts that survive I8: `letMapShapeOfTy`, `mvValTyIxAt`, `letBindTy` and
the struct rows. None reads legacy's local slot state.

- `slotMapHeldTy`: the local is held at the map of its cell plan's value type, and `Map()` is built
  there (`letMapNewHeld`).
- `narrowedLocalRead`: a read of the local stands as stored (`slotMapHeldVar`).
- `mapGetStoredTy`: a bare `get` typed at a nullable record is held at `V | null`. `V` is the slot's
  stored value, or the record its struct row records, which extends `mapReadStoredRep` (now
  `storedRowRep` on a type).
- `storedPastNullTy`: a local bound to such a read and narrowed past `null` reads its inner row.
- `slotMapWalkValTy`: a `values()` walk declares its variable at the stored value type.

**Census delta.** `VL_IR_SHADOW=5` probe rows over the `map get rep` and `narrowed read` class
programs, plus the two witnesses, merge-base against branch:

| arm | `fnc` | `fnu` |
| --- | --- | --- |
| merge-base | 275 | 9 |
| branch | 279 | 5 |

- `convert map -> map`: 5 functions -> 0.
- `built-record-literal-boxed-at-later-row-positions`: `viaMapSet`, `viaPush` and `viaArgument`
  are now claimed.
- Its `viaField` now stops at `convert record -> record`: the record field store, which belongs to
  the series' records PR.
- The class programs' own rows do not move.

**Q58.** `tests/cases/maps/map-local-record-value-read-at-stored-row-positions.vl` covers six read
sites: an optional chain, a narrowed local, `??`, a values loop, a null test and an argument.

- Master, with `VL_IR_REQUIRE_CLAIM=1`: declines (`convert map -> map`).
- This branch: builds (rc 0) and prints legacy's output.
