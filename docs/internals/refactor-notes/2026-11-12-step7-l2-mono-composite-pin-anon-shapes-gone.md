# Step 7 L2 §7: a composite parameter's pin no longer re-spells `#anon` bindings, 2026-11-12

After #7369, `pinC` in `monoPinTyParamComposite` is the naming rule's spelling of the
parameter's closed type. `monoSubstAnonShapes` still ran over it. That function re-substitutes
the annotation text through `monoSubstAnn` with each `#anon` binding in `tvV` spelled by its
fields, and its answer replaced `pinC` whenever it changed something.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). At `pinC`, it compared
`monoSubstAnonShapes`'s answer with what it was given.

- `pinC` is reached in 413 programs.
- The answer differs in 0 of them.
- At `monoSubstLetType`, its other caller, the same probe fires in 7 programs, so the probe can
  see a change.

The rule's spelling has no `tvV` handles in it to replace. A record whose row is an `#anon`
handle keeps that handle, the same name the pushed pin (`poSp`) gives it.

## Changed

- The `monoSubstAnonShapes` call at `pinC` is deleted.
- `monoPinTyParamComposite`'s `ann` parameter is no longer read, so it is deleted.

`monoSubstAnonShapes` has one caller left, `monoSubstLetType`. The same probe compared its 7
changes with a naming-rule mode that spells an `#anon`-row record by its fields:

- the rule agrees on 5;
- the other 2 differ only in member order (`{y:string}|i32` against `i32|{y:string}`).

That is the let-union registry keying a row by member order, which is w316's to fix. Once that
lands, `monoSubstLetType` takes the rule, and `monoSubstAnonShapes` goes with it.

## Proof

- **Byte sweep.** The #7369 fixpoint against the candidate fixpoint: same 23,962, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0.
- **Locally:**
  - refresh to a fixpoint, lint-self;
  - static budgets, with `--findings`: render-parse 19 / 57, dead exports 0;
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-spell shadow, pin-helper and render-parse budget tests: 7,464 passed.
