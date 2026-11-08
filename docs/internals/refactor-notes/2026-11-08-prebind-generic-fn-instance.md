# Step 2: the pre-bind reads a generic function's instance, and what the bundle reads are (2026-11-08)

Follows [a generic function value's pin reads the instance before the template](2026-11-08-generic-fn-value-pin-reads.md)
(#6863), which left 18 `fnSigKeyOf` reads during mono. Each read was probed for the pin that
reached `monoArgTyNameCascade`'s function-value rung, what `fnSigKeyOf` answered there, and what
the elaboration binds the hole to at that call.

## Where the 18 reads come from

| reads | files | pin | what the elaboration holds |
|---|---|---|---|
| 2 | 1 | `monoPreBindArg` | `g(dbl, 6)` into `f: ((x: T) => T) \| null`: `elabCallParamTy` closes to `((i32) => i32) \| null`. |
| 7 | 7 | `monoPinHoleParam` | `take(id)`, `a` stored in a list and called through it at two types. The hole's binding is the open `(T) => T`; `fnSigKeyOf` answers the template's i32 default `i>i`. |
| 4 | 2 | `monoPinHoleParam` | D14843: `run(add)` / `run(mul)`, an un-annotated hole function handed through a loop to `apply2`, which calls it at two types. The binding is `(_, _) => _`. |
| 5 | 5 | `monoPinAnnotatedParam` | D15154, D15105, the two `…-comes-back-in-returned-*` rejects and `error-binding-of-one-typaram-seeded-from-another-generic`. `elabCallParamTy` is open. |

Of the 16 non-pre-bind reads, 14 sit in programs that are loud emit rejects today. Two run:
D15010 and `listed-hole-fn-escaping-list`, which are the same program. There the instance of
`take` is pinned `=>i>i`, and each `xs[0](…)` is resolved statically to an instance of `id`.

## What landed

`monoPreBindArg` takes the call and the argument position. For a read naming a generic function,
it pins at the function type the call's instance closes the parameter to, or at the function
under a nullable, before the name cascade. The output is unchanged and both reads leave.

## What stands, and why it is not a pin change

None of the 16 has a closed per-instance signature. The elaboration leaves each hole open, and the
program calls the value at two instances. Under the ruling these are bundles. But in the 7
`take(id)` reads the value is stored into a list and called through an element. A lambda bundle
(`monoBundlePin`, `elabCallBundleSigs`) declines that read on purpose (`elabBodyReadsOtherThanCalled`).
Reaching 0 therefore needs a bundle rep for a function held in a list element and called through
it. That is the capability that D1666, D15011, D15483 and D15529 refuse today. It is not a
re-keying of an existing pin.

## Measured

Population: the 23,704 programs of `scripts/sweep.vl -- list`. Base is master `3d245de9` and
candidate is this change, both fixpoint seeds.

| | before | after |
|---|---|---|
| census both-phase classifiers | 5 | 5 |
| `fnSigKeyOf` / `cloRetKindOf` pre-mono | 18 / 18 | 16 / 16 |
| `cloRetValKind` pre-mono | 20 | 18 |
| `blockTailIsClosure` / `exprIsClosureNoLocal` pre-mono | 23 / 23 | 22 / 22 |
| ckey class table (47 classes; `hole-mono` root lambda / root named) | 11 / 1 | identical |
| pin-helper budget (`emit_mono.vl`) | 927 | 927 |
| fixpoint seed bytes | 6,570,293 | 6,570,581 (+288) |

`scripts/sweep.vl` diff, base fixpoint against candidate fixpoint: 23,704 same, 0 bytes-only
movers, 0 output movers, 0 `runs → not-runs`, 0 new traps. Every program builds byte-identical,
so the instance count is unchanged. `scripts/gate.sh`: all 23 rows pass.
