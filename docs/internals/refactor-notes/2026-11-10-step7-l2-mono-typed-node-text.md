# Step 7 L2 §7: which typed annotation nodes still have their text read, 2026-11-10

`2026-11-10-step7-l2-mono-ann-typeref-nodes.md` (#7119) built ten of mono's annotation nodes from
the type they record. This note asks the general question behind that change: when
`synthTypeRefTy(name, pos, ty)` is given a type, does any reader still read `name`? The answer
splits mono's typed node sites into ones that can be cut and ones that cannot. This PR cuts nine
of them.

The base is master `2ba94289`, with a fixpoint seed on both sides. The population is the whole
sweep: 23,868 programs for the experiments and 23,873 for the final proof.

## The experiment

A scratch compiler, never refreshed into a seed, made `synthTypeRefTy` render its node's text
from `ty` whenever it was given one. The sweep lost 24 runs and gained 3 compiler traps. So the
text of a typed node is still read back somewhere. Example messages:

- `parameter `x` of a lambda is substituted at another type than the elaboration's`;
- `ref valtype with no interned shape`;
- `array value does not match any array member of the union`.

Each of mono's typed call sites was then swapped to `synthTypeRefOfTy` alone, or in a small
group, and swept:

| site (function) | sweep vs master |
| --- | --- |
| `monoLamSubstParams` ×2 (nominal parameter pin) | same |
| `monoPinListElems`, `monoPinNestedListElems` (`monoSigFnTyNameAt` text) | same |
| `monoPinSlotRecordList` (`sNames[row] + "[]"`) | same |
| `monoInstanceRet`, bundle-record arm | same |
| `monoMakeInstanceGo`, widened result | same |
| `monoLamPinRetAnn` | same |
| `monoSynthPinRef`, `#anon` row-list arm | same |
| `monoCloneLambdaPinned` | same |
| `monoSubstLetType` | same |
| `monoMakeInstanceParams` (6 sites, the pinned parameter text) | 3 runs → not-runs, 2 traps |
| `monoInstanceRet`, closing node | 2 runs → not-runs |
| `monoSubstAnnNode`'s substituted node | 10 runs → not-runs |
| `monoSynthPinRef`, closed-type arm (`monoPinSpellOf`) | 3 runs → not-runs, 3 traps |

A reach probe on the "same" rows (the probe accumulator of #7119) measured three things per site:
how many programs reach it, how often the text differs from `tyToEmitName(ty)`, and how often
the type is missing.

| site | reached in | text differs | type missing |
| --- | --- | --- | --- |
| `monoLamSubstParams` (parameter) | 133 | 10 | 0 |
| `monoLamSubstParams` (inferred parameter) | 601 | 3 | 0 |
| `monoPinListElems` | 61 | 3 | 0 |
| `monoPinNestedListElems` (function lists) | 10 | 0 | 0 |
| `monoPinSlotRecordList` | 11 | 1 | 0 |
| `monoInstanceRet` bundle arm | 47 | 2 | 0 |
| `monoMakeInstanceGo` widened | 29 | 0 | 0 |
| `monoLamPinRetAnn` | 749 | 13 | 0 |
| `monoSynthPinRef` `#anon` arm | 6 | 6 | 0 |
| `monoCloneLambdaPinned` | 2 | 0 | 0 |
| `monoSubstLetType` | 518 | 151 | **25** |

## Changed

Nine sites now build their node from the type: every "same" row except `monoSubstLetType`, whose
type is missing in 25 programs, and `monoCloneLambdaPinned`. The latter's caller still gates on
the spelling (`elem != "i32"`), which is the numeric literal union non-cut.

`monoSigFnTyNameAt` had no other caller and is deleted. It held one `tyToEmitName`. Two more
lines keep their spelling only for a check or a registry:

- `monoLamSubstParams`' `sp` stays for its `sp != tyNameOf(nt0)` check;
- `monoLamPinRetAnn`'s `rnm` stays for `monoRegisterValuePin` (L6).

## The binding spellings are not one render of the type

A second probe, at `monoMakeInstance`, classified each spelling against its type: `tvV[k]`
against `tvT[k]`, and `pinned[k]` against `pinTys[k]`. Counts are programs, and a program can
fall in several rows:

| spelling equals | `tvV` | `pinned` |
| --- | --- | --- |
| `monoPinAnnSpelling(t)` | 5,059 | 8,051 |
| `monoPinNominalSpelling(t)` only | 794 | 1,322 |
| `tyToEmitName(t)` only | 7 | 71 |
| none of the three | 304 | 1,316 |
| no type | 5 | 3 |

So `tvV` cannot be derived from `tvT` inside `monoMakeInstance` by one render. Its 217 uses
(`monoFoldTyParamLayout` 31, `monoBindOf` 14, `monoSubstAnn` 10, …) have to move to `tvT` reader
by reader. Until they have, each producer keeps its own spelling form.

## Proof

- **Byte sweep.** The master fixpoint against the candidate fixpoint, both at `2ba94289`: 23,873
  of 23,873 are the same, with 0 bytes-only movers, 0 output movers and 0 runs → not-runs.
- The render-parse ratchet goes from 39 to 38 renders (70 parses unchanged), with
  `--write-baseline` in this PR. The pin-helper budget goes from 918 to 916.
- **Locally:** refresh ×2 byte-identical, rep-fuzz, lint-self, seed-size, late-demands,
  dead-export, render-parse, pin-helper budget, cases_wasm 0–3, inventory refs/rows,
  `vl_scaling_shape`, `vl_probe_rollback`, plumb-shape-cost, self-compile-time, and
  `check-filed-witnesses --strict` on both inventories.
