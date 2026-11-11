# Step 7 L2 §7: a list literal whose template build type is open keys by the one closed type its instances build at, 2026-11-11

The list mint's hint (`arrLitMintHintTy`) declines where the literal's build element type still
holds an inference hole or a type parameter. The measurement in #7190's lane found 321 programs
there. 303 of them have no per-instance record on the literal node, which is w321's lane. In 13, the
elaborator's per-frame stamps (`elabNodeReps`) hold one closed type across every frame. This PR
takes those. Base is master `ebbc4bc2`. Counts are **programs** over the sweep's 23,885.

## Changed

- `litRepTyOneClosed(ix)` (`emit_elab.vl`) is the one closed type that every elaborated frame
  stamps literal `ix` (or its copy source) at. It is -1 where no frame stamps it, a stamp is still
  open, or two stamps differ.
- `arrLitMintHintTy` uses that type's element where the build element type is open. The element
  still passes the hint's own test: a closure, or a list of `string` or `u8`.

## Measured

The probe was an `emitFail` where the new path finds a closed element type. It reached 14
programs.

- 1 passes the class test and keys by the type:
  `generics/generic-fn-value-at-enclosing-type-param.vl`, where `(()=>void)` becomes
  `(i32) => void`. It builds byte-identical wasm against the base seed, and its output is unchanged.
- 12 are records (`{fs: ((i32) => i32)[]}`, mostly `#anonN` rows) and keep the name's key. A record
  waits for w319's struct-row key, which carries the declaration.
- 1 is a nullable closure (`D3940`, `((string) => void) | null`) and keeps the name's key.

## Proof

- One refresh, at 6,621,171 bytes. `vl fmt -w` gave a byte-identical seed.
- `regress.vl` reports no runs lost. These pass: lint-self (with the comment, ladder, sentinel and
  scan budgets), dead-export, render-parse (unchanged), kind-ladder sets, seed-size, rep-fuzz
  (exact), `cases_wasm`, `vl_check_codegen`, `vl_scaling_shape` and `vl_probe_rollback`.
- The full population is graded by CI's Sweep job.
