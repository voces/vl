# Step 7 L6 (step S1): the membership and member-type seams take no name, 2026-11-12

The base is master after H1 (#7543).

## Changed

- **`isUNameAB(site, ty)` and `unionMemberTysOfAB(site, ty, out)`** drop the name. Their answer
  was the type's alone: the name was read only to tally the A/B harness (`unABProbe`) when
  armed. Their callers drop the name argument.
- **`isUNameABTyMayHit`** no longer answers true merely because the harness is armed.
- **Deleted:** an unused import.

## Census

The A/B harness (`$VL_REP_SHADOW=1`) was run over the cases and cells, giving per-site name-row
against type-row buckets for 65 sites. These two functions return the type's answer in every
bucket, so dropping the name moves nothing. The union-key licence test still passes; its
`keySweep` buckets do not read the name.

## Not cut: `unionRowKeyAB`

`unionRowKeyAB` still falls back to the name's row:
- **Where the type finds no row ("name-only"):** 2 calls at site 89.
- **Where the caller passes no type ("no-ty"):** 105 calls, at sites 88 and 89 (`assignGlobal`
  and `assignLocal`'s `unionRowIsLitUnion`), whose declared-type reads answer -1 for an
  un-annotated or inferred binding.

A candidate that dropped the fallback built every corpus program but miscompiled the
compiler's own `cli.vl` (`let fexit: CliExit = EXIT_OK` lowered as a box: invalid wasm in
`cliCheckCurFileRest`). Its census must include the self-compile, and those callers must pass
the binding's own type first. That is the next step.

## Proof

**Fixpoint:** the candidate compiles itself byte-identically.

**Local checks:**
- lint-self: clean.
- rep-fuzz: exact.
- regress: no runs lost.
- cases_wasm: 7,538 passed.
- emitter-state audit: passes.
- union-key licence test: passes.

**The full sweep:** CI's `sweep` label.
