# Step 7 L2: mono's union pin name is canon'd by its type, 2026-11-12

`monoPinUnionName(rs)` spells a pin under the union registry's canon name (D1042). It decided
whether to canonicalise by parsing `rs`, and canonicalised only when either test held:

- `unionSetAtomsOf(rs)` split it into two atoms or more;
- `monoNameIsGroupedList(rs)` saw a list whose element is one parenthesised group.

This was the largest of the three `emit_mono` callers of the union registry's text split, which
lane G handed over: 5,353 calls in 2,099 programs.

The decision now reads the pin's type through `monoPinCanonKind(ty)`:

| answer | when |
| --- | --- |
| 1 | `ty` is a `TyUnion` of two members or more, or `unionTyArms` keys it two arms or more |
| 2 | `ty` is a list whose element is a union, a nullable or a function, the spellings that group in parentheses |
| 0 | otherwise, and for no type |

A union of twin maps (`LM | IM`, D15540) keys one arm. It is still canonicalised to its one map,
because it has two members. The first candidate counted keyed arms only. It refused
`maps/map-twin-union-is-its-one-map.vl` (`a map union member is not supported`), and that is why
the member count comes first.

`monoPinMintedUnion` now takes `nameTy`, the type its `name` spells. The parameter-pin caller
passes `pinTys[pj]`, which may differ from the gate type `ty` (the union parameter's own type).
The `let` caller passes the substituted type.

## Measured

Two scratch probes were built on cut 3's tree, never seeded. Each ran over the sweep population
(24,070 programs recorded) and counted decisions.

**First probe: the atom-count decision alone.** The spelling and the type disagree in hundreds of
decisions, for example a literal pin whose canon name is its alias. So the probe compared the
function's final result instead.

**Second probe: the final name, with the predicate above.**

| | decisions (programs) |
| --- | --- |
| same name | 16,011 (4,852) |
| different name | 2 (1): `literal-unions/one-literal-list-container-generic.vl`, whose module is byte-identical on both seeds |
| no type | 3 (2): the two generic-function-value cases, whose modules are byte-identical |
| `monoPinMintedUnion`'s grouped-list branch taken differently | 1 (1): `unions/list-read-over-string-list-and-literal-list.vl`, whose module is byte-identical |

Each program a probe flagged was built on both seeds and compared with `cmp`, eleven programs in
all. The first candidate's refusal is the only one that moved, and the member-count rule fixes it.

## Left

`monoPinMintedUnion`'s `pcAtoms` and `monoSubstLetType`'s `subAtoms` still split a spelling. A
third probe measured each against the same predicate:

- **`subAtoms`:** 1,186 decisions agree, and 1 differs (`generics/for-in-var-callee-result-stored-at-pin.vl`).
- **`pcAtoms`:** 215 agree, and 137 differ in 48 programs. These are literal-union elements.
  `canonEmitName` names such an element by its alias (`K`), and the text split counts a declared
  name as one atom.

So `pcAtoms`'s typed twin must also answer "the element's canon name is a declared alias". It is
the next cut, and it is where lane G's last `unionSetAtomsOf` callers in `emit_mono` go.

## Counts

- `unionSetAtomsOf` calls in `emit_mono.vl`: 3 → 2.
- Deleted: `monoNameIsGroupedList`, along with its `arrElemNameRaw` and `peelGroupParens` imports.
- Added: `monoPinCanonKind`.
- `emit_mono.vl` spelling reads, counting the text split: 18 → 16.
- pin-helper: 910, unchanged.
- render-parse: 13 / 30, unchanged.

## Proof

- **Locally:**
  - refresh to a fixpoint;
  - `lint-self.sh` clean;
  - kind-ladder 0;
  - late demands 8;
  - seed 6,723,052 bytes (+2.0%);
  - `mono-tyaram-grid.sh` 0 BAD;
  - `regress.vl`, no runs lost;
  - `check-filed-witnesses --strict`: 4,853 as filed.
- **The sweep** is CI's (`sweep` label).
