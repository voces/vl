# 2026-11-13 — lane H: a declared union's function member is grouped by its type

`collectDeclaredUnion` wraps a function-type member in parens when it joins the member set
(`udSet`), so `(i32)=>i32|string` does not read as one arrow. It asked the spelling:
`nameIsFuncTypeAtom(udMem) && peelGroupParens(udMem) == udMem`. That is two `ty-string-parse`
census sites over a canon render (`vs[usj]`, which canon rewrites).

It now asks the member's type, which #7810 banks (`declMemberTy`): the member is a `TyFunc` and
`udMem` is still its own spelling (not an alias member's expansion). Canon spells a function
member bare (a function alias and a grouped member both render as `(i32)=>i32`), so the
already-grouped arm of the old test never fired.

## Agreement

A probe build computed both predicates at the site and failed on any disagreement, with a
control arm firing on the `(i32)=>i32` member:

- Corpus (24,170 programs, `vl check --batch --codegen`): 0 disagreements; the control fired in
  3 programs.
- Hand spellings: a function alias member (`type F = (i32)=>i32; type U = F | string`), a grouped
  member (`((i32)=>i32) | string`), a nullable function member and a `() => string` alias beside
  `null`: all agree and run (`3`, `s`, `6`, `g`).

## Effect

- render-parse budget: emit_collect `ty-string-parse` 4 → 2 (total 18 → 16 on this base). The two
  rows leave `render-parse-origins.txt` and `render-parse-sites.md` by hand.
- `regress.vl`: no runs lost. Fixpoint seed; late-demands, plumb-shape-cost at baseline; seed
  size +1.9% (the base's drift; this change removes code).
