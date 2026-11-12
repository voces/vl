# Step 7 L2 §7: an instance's `is` over a type parameter takes the elaboration's check type; emit_mono's last `monoSubstAnn` is gone, 2026-11-12

`monoFoldLayoutAt`'s `IsExpr` arm (D951) re-spelled a test that names a type parameter with
`monoSubstAnn`: the variant text with each type parameter replaced by its `tvV` spelling. It was
emit_mono's last `monoSubstAnn` call.

The base is #7429, with a fixpoint seed on both sides. The population is the whole sweep: 23,984
programs.

## Probed

The probe ran in a scratch compiler (#7119's accumulator). The arm is reached in 57 programs.

| typed source | differs from the substituted spelling |
| --- | --- |
| the instance's typed binding (`monoInstBindTyOf`) | 16 (a different instance's types) |
| the call's exact bindings (`monoFoldSubN` / `monoFoldSubT`) | 16 |
| the elaboration's per-instance check type (`elabIsPatTyIn`), spelled by the rule | 6 |

The 6 differences are:

- a signature key against its type's spelling (`=>i>i` against `(i32)=>i32`, 3);
- a record list named by its row (`P[]` against `{x:i32}[]`, 2);
- `generics/unbound-type-param-reaching-is-stays-unbound.vl`, D4551's contract fixture.

In that fixture, `h<U>`'s instance binds `U` to the encloser's unbound `T` (`tvV` = `"T"`). The
substituted spelling is what refused the test. The typed sources had all defaulted `U` to `i32`,
so a plain swap would let the test run, and that is the contract broken.

The typed form of that fact: the instance holds no typed binding for `U`. `tvT` has no entry. Over
the 57 programs, a type parameter the test names lacks a typed binding only in that fixture.

## Changed

- The arm takes `elabIsPatTyIn(ix, elabWalkTop())`, spelled by `monoPinSpellShaped`.
- A type parameter the test names with no typed binding (`monoInstBindN` / `monoInstBindT`)
  refuses with the message that fixture expects.
- emit_mono's `monoSubstAnn` import is deleted, since nothing calls it. That leaves w310 free to
  delete `monoSubstAnn`.

## Proof

- **Byte sweep.** The #7429 fixpoint against the candidate fixpoint: same 23,984, bytes-only 0,
  output movers 0, runs → not-runs 0, new compiler traps 0. That includes the D4551 fixture's
  refusal message.
- **Locally:**
  - refresh to a fixpoint, lint-self, dead exports 0;
  - render-parse 13 / 55 (`--findings`);
  - `mono-tyaram-grid.sh`: 252 OK, 0 BAD;
  - `cases_wasm_*`, pin-helper and pin-spell shadow tests: 7,475 passed.
