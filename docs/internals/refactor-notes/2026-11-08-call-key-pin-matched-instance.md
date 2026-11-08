# Step 2: a build nothing keys binds at the instance its pins are (2026-11-08)

Follows [a stored hole function has a key](2026-11-08-call-key-stored-hole-default.md) (#6857),
which left `monoHoleBinding` binding at 46 builds over 33 programs: functions with two or more
instances, or with keys held under an instance other than the one being walked.

## What landed

- **`elabHoleKeyAtPins`.** The end of `elabRun` now keeps every instance of each un-annotated
  function, under any parent (`elabHoleDeclKeys`). A build that has no call, value or lambda key
  takes the instance whose closed parameter types are its pins (`elabKeyBindsParams`). Where it
  matches several, they must bind the function's own holes alike (`elabKeysBindHolesAlike`), so a
  lambda whose instances differ only in a captured outer `T` still has one answer. Among those, it
  prefers the one the walked instance reaches. Two that bind a hole differently decline.
- **A hole parameter types from its hole name.** `elabCallKeyBinding` and `elabCallKeyDecline`
  read each parameter through `elabKeyParamNodeTy`: the type recorded at the key, else, for an
  un-annotated parameter, the type the key binds its hole name to (`elabKeyParamTy`, as
  `elabKeySig` reads it). A lambda that sits in an instance body has its keys under that instance,
  and its parameter node has no recorded type there. Before this change it declined as `untyped`.

## The `ckey` build classes, before and after

Population: the 23,698 programs of `scripts/sweep.vl -- list`, `scripts/id-shadow/run.sh --rows`.
Before is master at #6857 and after is this change. Both are fixpoint seeds. Counts are instance
builds, labelled path / hole / where / what, then the verdict.

| class | before | after |
|---|---|---|
| `spelled` hole-mono, root lambda | 31 | **11** |
| `spelled` hole-mono, root named | 4 | **1** |
| `lam` hole-mono, inside an instance | 11 | **0** |
| `lam` hole-key, inside an instance, agree | 51 | **138** |
| `lam` hole-none, inside an instance (no key) | 78 | **2** |
| `pins` hole-key (new path): root lambda agree / noinst | — | 11 / 9 |
| `pins` hole-key: root named agree / noinst, in-instance named noinst | — | 3 / 2, 1 |
| `spelled` hole-none, root named / in-instance named | 87 / 31 | 85 / 30 |
| registry `typedhit` agree / nokey | 349 / 75 | 366 / 58 |
| registry `hit` agree / nokey | 8,770 / 88 | 8,775 / 82 (+1 noinst) |

`hole-mono` is 46 → 12 builds. Every build that moved reads `agree` except 12 `noinst`. A
`noinst` build is one where `elabDemand` returns -1 for the binding. Those builds were there
before too, but the probe was -1 then, so the verdict read `nokey` and hid it.

## What is left

| builds | shape |
|---|---|
| 11 | root lambdas whose keys bind their own hole differently, or none matches the pins: a hole parameter that takes a function value (`hole-fn-into-pushed-lambda-bound-by-every-call`, `hole-lambda-on-hole-fn-list-capturing-hole-param`, D12940) |
| 1 | D15331, a named hole function called through a record field: a loud emit reject today |

`monoHoleBinding` therefore stays. Its residue is the pin of a hole that holds a function value,
whose pin is a bundle and not a signature.

## Item 3, not landed: the five both-phase classifiers

The 20 programs that call `fnSigKeyOf` during mono were probed at `monoArgTyNameCascade`'s
function-value rung. `elabCbArgSig` and `elabWalkTy` are -1 at every read. 19 of the 20 sit at the
root, and the read's context type is the template's open `(T) => T`. The pin's callers
(`monoPinHoleParam`, `monoPinAnnotatedParam`, `monoPinTyParamComposite`) already try the call
key's type first. They fall to the cascade only where the call key leaves that argument open. The
next step is why `elabCallParamTy` is open there, not a change to the cascade.

## Proof

- Fixpoint seed: 6,561,628 bytes against the base's 6,560,133 (+1,495, +0.023%).
- `scripts/sweep.vl` diff, base fixpoint against candidate fixpoint: 0 bytes-only movers, 0 output
  movers, 0 `runs → not-runs`, 0 new traps. Every program builds byte-identical, so the instance
  count is unchanged.
