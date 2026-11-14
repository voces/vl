# D16008: a record `is` test's `else` arm over an un-annotated parameter reads its remainder

**Change.** `holeElseRemainderOk` now admits a record tested type when the test is of a hole by
name, so the `else` arm reads an `HD_GNOT` remainder (pin minus the record) instead of the whole
pin. Two things keep D16004's argument check intact, which the refuted first attempt broke:

* `gnotRecordBase` (`check_hole_pins.vl`): a field read off a record remainder demands its field
  of the base hole, exactly as before the change. `.length` is not redirected; its demand is
  re-asked at the pin against the remainder.
* `ifNoteGuardAlts` registers no guard alternative for a record remainder. Under `!(v is X)` the
  then-arm reads the remainder, and an open alternative accepts any argument
  (`error-hole-param-is-negated-guard-not-covered.vl` caught this).

A field path keeps the hole as its fact (D3420).

**Position matrix** (un-annotated / annotated control), argument `A | i32` unless stated:

| position | before | after | annotated |
| --- | --- | --- | --- |
| `print(h)` | refused | `5 7` | `5 7` |
| `h + 1`, forwarding caller, `!(h is A)` | refused | `6` | `6` |
| argument `needI(h)` | refused | `5` | `5` |
| return `h * 2` | refused | `10` | `10` |
| early return then `print(h)` | refused | `5` | `5` |
| `const k: i32 = h` | refused | `5` | `5` |
| `A \| string`: `h + "!"` / `h.length` | refused | `s!` / `3` | same |
| `A \| i32[]`: `h[0]` | refused | `3` | `3` |
| `A \| i32 \| string`: `print(h)` | refused | `5` | `5` |
| `A \| B`: `h.w` | `ww` | `ww` | `ww` |
| `A \| string`: `h * 2`, `needI(h)` | refused | refused, names the remainder | refused |
| `A \| B`: `print(h)`, `h.length` | refused | refused | refused |
| `A \| B \| null`: `h.w` | refused | refused | refused |
| pin `A` only, arm dead | refused | refused — D16006(b) | `p: A` refuses — D16006(a) |

The soundness net keeps its three refusals; D3420's field-path cell still runs.
