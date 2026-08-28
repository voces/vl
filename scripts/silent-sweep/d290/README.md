# The union-box read **CHANNEL** grid — the axis `d272` holds fixed

`gen290.py` builds 714 cells crossing `shape × cons × cont × annpat`. It exists for the
same reason `d272` does, one level in: `d272` put the READ axis on the map and refuted
D209's read-side candidate with it, but every one of its cells pins the literal payload
per field spelling, so it cannot separate

    the checker's atom IS a declared member of the box    (`{r: 7}` : `i32 | null`)
    the checker's atom is NOT a member at all             (`{r: 7}` : `i64 | null`)

and that distinction decides whether a read-site unbox picks the atom the STORE boxed or a
different one. Three sources can disagree at an adopted read — the declared member, the
payload the store actually boxed, and the checker's type — and `shape` makes *which pair
disagrees* an independent coordinate.

    python3 scripts/silent-sweep/d290/gen290.py /tmp/g290
    JOBS=6 python3 scripts/silent-sweep/d88/grade88.py /tmp/g290 <seed.wasm> /tmp/g290.json

Every cell prints exactly `7`, so `grade88.py` reads a wrong answer as `runs but wrong value`.

| axis | levels |
|---|---|
| `shape` | the (code-16 field union, literal payload) PAIR — `i32\|null`·7, `i32\|string`·7, `i32\|i64`·7, `string\|i32`·"7", `boolean\|i32`·true, `f64\|string`·7.0 (the checker's atom IS a member); `i64\|null`·7, `f64\|null`·7, `i64\|string`·7 (it is NOT); `string\|null`, `boolean\|null` (the two NICHE controls, not code-16 at all) and a declared arm union |
| `cons` | the CONSUMER of the read: `print` · `local` rebind · `tounion` · `tofld` (another code-16 field) · `arg` (a union PARAM) · `ret` (a union RETURN) · `elem` (a union-element list) · `eqlit` · `isnar` · `nullcmp` |
| `cont` | bare · list · mapval |
| `annpat` | none · bind |

**`cons` is widened from `d272`'s five deliberately.** D209's close moves `exprUnion`, and
`exprUnion` has 28 call sites; a grid with two box-wanting consumers measures two of them.

Graded on `f6fda728` (seed 1,463,129).

`runs-lost.txt` names the **60** cells any PARTIAL composition of the close's three rungs
takes from `runs` to check-clean invalid wasm, and marks the **8** that even the two-rung
composition the D209 row itself proposed (read site + `exprUnion`) loses. Re-grade THAT set
against any future change to this channel — ~60 invocations instead of 714. They are also in
`scripts/silent-sweep/distilled/named/`, so `scripts/gate.sh` checks them.
