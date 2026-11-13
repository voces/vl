# Step 7 L6 (lane G): `unionArmsAllSame` compares declarations, not renders, 2026-11-13

The base is master. `unionArmsAllSame` (emit_rep, `rtOfUnion`) decides whether a union's arms are
one type, which makes the rep tree build the union as that type. It used `tySame` plus equality
of the arms' `tyToNominalName` renders. The render half carries nominal identity: twin records
under two declared names (`Cat | Kot`) are structurally `tySame` and must stay two arms.

`tyEq` is no replacement. The probe (render test against `tySame` + `tyEq`, full corpus
population) disagreed in 4 families in 5 programs: it called `Cat | Kot`, `Cat | {m: i32}`,
`A | B` and `Boxed | Plain` one type, which would collapse a variant union into one struct; and it
split two `f64[]` arms the render calls one.

The test is now `tySame` plus the same declaration: the same declared struct position
(`cStructFirstPos`) and the same nominal brand (`nomNameOfTy`). Both are declaration identities
read off the arena index, not a render.

## Measurement

| test against the render test | disagreements | programs |
| --- | --- | --- |
| `tySame` + `tyEq` | 9 calls | 5 |
| `tySame` + declaration identity | 0 | 0 |

Three hand-written nested cases (`Cat[] | Kot[]`, `Cat | Kot`, `{c: Cat} | {c: Kot}`) agree and
run. emit_rep's two `tyToNominalName` render reads leave the render-parse baseline.

## Proof

- **Seed:** fixpoint.
- **Locally:** lint-self, regress, rep-fuzz, check-filed-witnesses `--strict`, late-demands,
  seed-size, and the comment, ladder, sentinel, scan and render-parse budgets.
- **The full sweep:** CI's `sweep` label.
