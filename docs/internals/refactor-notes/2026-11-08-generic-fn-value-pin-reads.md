# Step 2: a generic function value's pin reads the instance before the template (2026-11-08)

Follows [a build nothing keys binds at the instance its pins are](2026-11-08-call-key-pin-matched-instance.md)
(#6859), whose item 3 found `fnSigKeyOf` asked at a generic template's signature during mono in
20 programs. This note says where each of those reads comes from and closes the ones whose call
key already holds a closed signature.

## Where the 20 reads come from

A probe at `monoArgTyNameCascade`'s function-value rung printed the call key of each read: the
instance the call reaches, the hole's binding there, and that binding's function set with
`elabReachedOf` / `elabSoleInstOf` for each member.

| reads | pin | what the call key holds |
|---|---|---|
| 14 | `monoPinHoleParam` (12), `monoPinAnnotatedParam` (2) | the hole binds `Fn#id`, and the instance reaches **two** instances of `id` (`-2`). No closed signature exists: the value is a bundle. |
| 3 | `monoPinAnnotatedParam` | `elabCallParamTy` **closes** (`(i32) => i32`), but the cascade answered first. |
| 2 | `monoPreBindArg` | a nullable record parameter, not a function slot: the read is the argument's own name. |
| 1 | `monoPinAnnotatedParam` (D15105) | `same` is generic and nested in a generic; no instance of it is recorded at all. |

So `elabCallParamTy` is not open upstream for these reads. Where it closes, the pin asked the
cascade before asking it. Where it does not close, the program hands a generic function on and
calls it at two types.

## What landed

- **`monoPinAnnotatedParam` asks the elaboration first** (`monoElabFnPin`), then the cascade.
  The exception is a parameter that seeds a binding of another type parameter
  (`elabParamSeedsOtherTyParam`, as in `let b: F = a1` with `a1: G`). That binding is built at the
  template's rep, so the elaboration's type comes second there. Without the exception,
  `error-binding-of-one-typaram-seeded-from-another-generic` goes from a loud reject to invalid
  wasm.
- **`monoPinTyParamComposite` asks `monoArgFnTypeName` last.** It asked first, and a generic
  callee's slot then replaced that answer with the substituted annotation. The final pin is the
  same, and `cloRetTypeName` is no longer asked at the template.

## Measured

Population: the 23,698 programs of `scripts/sweep.vl -- list`. Base is #6859 merged onto master
`2da9f410` and candidate is this change. Both are fixpoint seeds.

| | before | after |
|---|---|---|
| census both-phase classifiers | 5 | 5 |
| `fnSigKeyOf` / `cloRetKindOf` pre-mono | 20 / 20 | 18 / 18 |
| `cloRetValKind` pre-mono (`fnSigKeyOf`, `cloRetTypeName`) | 24 (20, 4) | 20 (18, 2) |
| `blockTailIsClosure` / `exprIsClosureNoLocal` pre-mono | 25 / 25 | 23 / 23 |
| ckey `call/keyed/hole-key/root/named/call` agree / refines | 12,705 / 178 | 12,703 / 180 |
| ckey `hit value agree` | 5,114 | 5,116 |
| ckey `hole-mono` (root lambda / root named) | 11 / 1 | 11 / 1 |

Every program builds byte-identical, so the instance count is unchanged.

## What stands

The 14 bundle reads and the 11 root-lambda `hole-mono` builds are the same residue: a function
value whose instance reaches several instances of one generic. The pin for that is a bundle, not
a signature. `monoBundlePin` builds one only for a lambda. A named generic needs a bundle pin
before `fnSigKeyOf`'s pre-mono reads and `monoHoleBinding` can reach 0. D15105 (a nested generic
with no recorded instance) and D15331 are separate.
