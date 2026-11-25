# START-2: `rep unsup` (2026-11-25)

Census restricted to the class's seven programs, master 828fc058: `rep unsup of read` 5 → 0 (all
five start bodies claimed); `rep unsup of call` (`maps/union-arm-constructed-map-field.vl`) and
`rep unsup of index` (`closures/hole-fn-list-named-callback.vl`) stay open, both other shapes.

`irBOpenLocalReadRep` gave a local's read whose own type has no rep its variable's rep; a global's
read had none. It now takes the cell's (`globalRep`), and `globalReadTy` types it at that rep's
own type where the read's is open.

Found on master, not fixed here (checker soundness, to be filed as a clause-1 row): the global
`r` in `function ret(a) { return a.h }; const r = ret(u)`, `u: K | J` with `h: i32` / `h: string`,
has an unconstrained type (`const c: boolean = r` is check-clean). Every copy of it builds an
invalid module: `function back() { return r }`, `const c = r; print(c)` (top level or in a
function). Mono and the object literal refuse loudly at `show(wrap(r))` and `{ f: r }`. The sweep
keeps the positions that run.
