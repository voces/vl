# The union-box READ grid — the axis every earlier grid held fixed

`gen272.py` builds 1,260 cells crossing the four axes below. It exists because a candidate
fix for **D209** read zero backward on 57,492 cells of every grid this repo had — census
block C (43,200), census block D (9,000), a 140-cell adoption grid, `d156`, `d88`, `d112` —
and on a byte-identical corpus `cmp`, and then lost **72 running programs** here, **36 of them
into a silent class**.

    python3 scripts/silent-sweep/d272/gen272.py /tmp/g272
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/g272 <seed.wasm> /tmp/g272.json

Every cell prints exactly `7`, so `grade88.py` reads a wrong answer as `runs but wrong value`.

| axis | levels |
|---|---|
| `fld` | the code-16 field's union spelling: `i32\|null`, `i64\|null`, `f64\|null`, `boolean\|null`, `string\|null`, `i32\|string`, a declared arm union, a litunion, `i32[]\|null` |
| `read` | **bare** (un-narrowed) · **isnar** (`is <atom>`) · **nullcmp** (`!= null`) · **tounion** (stored into a union-typed binding) · **tofld** (stored into ANOTHER code-16 field) |
| `cont` | bare, list, listlist, mapval, map_of_list, list_of_map, forin |
| `annpat` | none, bind, dest, destdeep |

**`read` is the axis that earns it.** The census's `rep` axis varies the field's TYPE and reads
it bare; the adoption grid varies the adoption and reads it bare. `tounion` and `tofld` are the
consumers that WANT the box, and they are the ones a read-site unbox breaks — the read site
cannot see its consumer. That is D272, filed as a refutation pin.

`runs-lost.txt` names the 72 cells, so a future D209 candidate re-grades **that set** in ~72
invocations instead of rebuilding the grid. Keep it current if the grid changes.
