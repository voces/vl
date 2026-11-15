# L2: when a scheme closes, and where function storage is decided, measured, 2026-11-15

Lane G, with lane relate (M3)'s censuses. This feeds `l2-inferred-interfaces-design.md` §3.2 (the
close) and §10 (storage versus type identity). It changes no compiler code.

## When a scheme closes (§3.2)

M3 probed `holeBindAt` in scratch over 20,478 programs, on master `4b8e8d26` (L2 S1 merged). Each
ask was keyed by frame and by the owner's state:
- **frame:** instance re-check or generic;
- **owner state:** open (its loud body check has not ended), closed (`bodyChecked`), or nested
  (no registered top-level owner).

| frame, owner state | keys | repeat asks | asks that differ |
|---|---|---|---|
| generic, closed | 1,858 | 7,133 | 0 |
| generic, open | 152 | 459 | 0 |
| generic, nested | 143 | 546 | 0 |
| instance, closed | 387 | 2,108 | 0 |
| instance, nested | 20 | 21 | 0 |

- **Within a cell, the walk's answer is stable.** Every difference M3 first saw was an ask on an open
  owner against an ask on the same owner after it closed. The open ask reads a partial body.
- **S1 does not remove the open asks.** There were 151 open keys and 457 repeats before S1, and 152
  and 459 after. 151 of the 152 come from another function's check while only the quiet pre-pass
  has seen the owner, since `bodyChecked` is set only outside `inferQuiet`. So the scheme closes at
  the loud check, not at the pre-pass.
- **Nested owners**, by E, their nearest registered enclosing declaration:
  - E closed: 7 keys.
  - E open, asked from E's own body: 33 keys. These close with E.
  - E open, asked from another function: 1 key, in
    `tests/cases/closures/lambda-callee-param-later-callback-env.vl`. This is the one escape.
  - No enclosing declaration: 122 keys (105 generic, 17 instance), in 49 program-mode pairs. These
    are function values bound at module level, such as
    `closures/alias-of-written-let-called-with-hole-function.vl`. They close at their binding's
    statement.

## Function-valued holes and storage (§10)

- **The S0 printer's disagreements.** The 40 calls in its covered set where scheme and record
  disagree (`2026-11-15-g78-l2-s0-shadow-ifaces.md`) are one shape. The scheme substituted at the
  call gives `(_) => _`, and the recorded result is a bundle `{c0: (f64) => f64, c1: (i32) => i32}`:
  a hole function parameter called at two shapes (choice 4).
- **The body already records each shape as rows.** `function ap(g) { return g(1, 2) + g("ab",
  "c").length }` prints `hd1=2 hd8=4 arg=4` under `$VL_IFACES`: one `HD_RET` per call, one
  `HD_PARAM` per call argument, and the delivered arguments.
- **The bundle is minted at emit** (`elabBundleSigNote`, `emit_elab.vl`), keyed by instance and
  parameter at closed signatures. So the 40 belong to S3's solver, which instantiates the per-shape
  bounds, and S2 needs no new row for them.
- **`fnTagDecide` is not a body decision.** It runs over the whole program after the check
  (`check_pins.vl`) and again after elaboration (`fnTagRedecide`, `emit_sections.vl`). It decides
  whether a function set is held as an id or as a closure, which is storage.

The §10 resolution is pending lane S's written position.
