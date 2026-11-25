# `K | null ?? <const member>`: the atom-niche arm admits a `const` default (lane COV-UNION, 2026-11-25)

## The refusal

START-2's witness:

    type K = "zz" | "yy"
    const Z = "zz"
    function one(): "zz" { return "zz" }
    function name(k: K) { return "k=" + k }
    function coal(c: boolean) {
      const n: K | null = if c { null } else { one() }
      return name(n ?? Z)
    }
    print(coal(true))

`vl check` passes. `vl build` stops at `?? over this nullable value is not supported yet`. This is
a clause-2 refusal: `n ?? "zz"` and `n ?? d` (with `const d: K = Z`) both run.

`coalArmOf` reaches `niche`, and `coalNicheArmOf` asks `coalesceLitUnionDefaultIsAtom` whether
the default reps as the niche's atom. That predicate accepted a `null`, a member string literal, a
chain, or a value already at an atom rep. `Z` is a read of a `const` bound to a literal, which reps
as a string, so the predicate declined. `nulAtomStr` declined too, because the result is `K`, not
`string`. The box arms then ran out, ending at `none`.

The IR never saw `coal`: legacy stopped first, even under `VL_IR_STRICT=1`.

## The change (coordinator ruling, 2026-11-25)

The arm lives in `emit_classify`, a plan the IR also reads, so the fix is made there and the IR
claims the arm itself. No legacy-only arm is left at I8.

- **`coalesceLitUnionDefaultIsAtom`:** a read of an un-annotated `const` whose initializer is a
  member string literal is the niche's atom. That is the atom hook's `wideLit` arm, read off the
  declaration (`identDeclOf`), so `emit_classify` takes no new checker import and the
  phase-state census is unchanged. Legacy's niche cell writes the default through `emitExpr`,
  which takes the hook. The default node's own type carries the join, not the literal, so it
  cannot decide this.
- **IR (`coalNicheCell`):** a default the atom hook writes (`exprPrePathWhy` names it) is built
  with `deliver` at the niche's atom rep. That is the same delivery `const d: K = Z` uses (the
  hook's `wideLit`, `sole`, `chain` and `staged` arms). Every other default is still built with
  `irBExpr` and its rep checked.

## Measured

Grid: defaults `Z`, `"zz"` and `d`, each at a const binding, an argument, a return and a print
(12 programs).
- Master: the 4 `Z` cells refuse; the other 8 run and the IR claims them.
- This tree: all 12 run under `VL_IR_STRICT=1`, with blockers none, and print what the `"zz"`
  and `d` cells print.

Control: `n ?? W` with `const W = "qq"` (not a member) keeps the string arm. It prints the same
on both trees, and its IR blocker (`coalesce atom default`) is unchanged; that is the separate
non-member arm.

Q58 sweep: `tests/cases/literal-unions/coalesce-const-member-default-in-each-position.vl`.
