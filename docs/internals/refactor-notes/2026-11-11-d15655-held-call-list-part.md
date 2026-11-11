# D15655: a binding of a call's fresh record is built where a list literal holding it is, 2026-11-11

Clause-2 close. Base is master `68fd81f7`.

## Mechanism

`const o = os0(); const ws = [xs[0], o]`, where `xs[0]` is built at `J`. Before this change the
part `o` was refused as a capability gap (`recListPartsApartRefuse`). A copy at the part would split
the record, because other reads reach `o`. Adopting `os0` at `J` with its function (D15240's
route) was tried and dropped. It rebuilds every other `os0()` call: a sibling `[xs[0], os0()]`
began refusing, and `[...xs, os0()]` trapped the checker in `recRefuseAtOwnRow`.

What shipped is `recHeldCallPartCopy` (check_bind_adopt.vl). It builds the binding itself at the
list's record, the way `recHeldLitPartStamp` does for a held literal:
- The initialising call is copied there as it is bound (`recCopyTyIx`, the D15652 copy). Nothing
  else has seen the record yet, so nothing is split.
- The binding is recorded as built there (`recBuildPush`).
- Each read of the binding handed on at its own storage is refused (`recHeldReadsOwnRefuse`,
  check_fit_rules.vl). This one matches by binding: `recHeldOwnRefuse` matches by fresh origin,
  which for a call names the function.

`recKeptWhat` now says "holds a call's fresh record" rather than "holds only literals" for such a
binding.

## Graded

These run:
- the part first or second
- a field read
- a write through `o` seen through the list
- inside a function
- an unwritten `let`
- a relay maker
- the generic `id({ f: 1 })`, which also closes D15375's remaining capability refusal

These still refuse:
- `o` handed on at `{f: i32}` (owed, fixture)
- a reassigned `let`
- `o` also delivered whole at `J` (`{f: i32} is not J …`). Master refuses this program too, at
  the list part.

Fixtures:
- `record-list-literal-held-call-part-runs.vl` and `record-list-literal-held-call-part-own-read-reject.vl`, both new
- the two former `*-call-part-reject.vl` fixtures, which now run and were renamed `*-call-parts-runs.vl`

Gates:
- fixpoint ×2 (6,612,956 bytes, seed-size +0.4%)
- lint-self clean (the sentinel ratchet is held at 0)
- rep-fuzz exact
- late demands 6
- dead-export, render-parse and pin-helper budgets
- cases_wasm 7424
- witnesses 4703 as filed
- scaling shape, probe rollback, fn-ret shadow
- distilled regress: no runs lost. The two `d15317_d380*` movers also move on master's seed.
