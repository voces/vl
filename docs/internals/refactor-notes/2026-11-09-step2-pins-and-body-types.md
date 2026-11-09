# Step 2: the pin key reads the elaboration, and a body read takes the instance's type

Base: master `b63d32e6` built to a fixpoint (6,570,731 bytes). Population for the shadow counts:
the 7,646 `tests/cases/**/*.vl` files, each built once (`VL_ID_SHADOW=1 vl build`). Counts are
instance builds, registry hits or operand reads, not programs. This follows #6928's census.

## 1. `monoKeyPinSeg`'s `pins` arm is on the elaboration key

A build that no call, lambda or value key names, but that `elabHoleKeyAtPins` answers, is now
registered under `"V" + instKeyCanon(origFe, pinKey, …)`, which is the value half's key. Before,
it was registered under mono's spelled key. The typed dedup compares it by that key too.

The `spelled` arm was graded. At each of its 124 builds the probe asked `elabDemand` for the
instance and compared it with `elabMemberKeyAtTys(pinTys, decl)`:

| `elabDemand` | `elabMemberKeyAtTys` | builds | what the build is |
|---|---|---|---|
| held instance | the same key | 45 | a generic read out of a container as a value, which no delivery keys |
| held instance | none | 2 | a lambda bundle at a hole parameter (a set); `z` at its stub signature |
| none | none | 77 | no instance at these pins (below) |

There was no wrong key, so the 45 now key at `pinKey` too: an un-annotated function by
`elabHoleKeyAtPins`, else a generic by `elabMemberKeyAtTys`.

| path, shadow `ckey` | builds before → after | hits before → after | typed hits before → after |
|---|---|---|---|
| `pins` | 20 → 65 | 14 → 100 | 3 → 3 |
| `spelled` | 124 → 79 | 70 → 32 | 50 → 2 |

The 79 `spelled` builds that stand have no elaboration instance, and that is the reason they stand:

- 42 lambdas that nothing instances, or a forwarded hole function's set (#6928 §1).
- 30 annotated, non-generic functions built again at a container's wider rep
  (`soundness/built-container-*`). This is a rep twin, step 7.
- 7 hole functions pinned at a rep the elaboration never instanced, such as a literal-union atom
  or a nullable.

## 2. Body retyping: `monoPinnedOperandTy` returns `ty(inst, node)`

Shadowed at its 5 call sites, the elaboration's type at the read, `elabNodeTy(ix, walkTop)`,
against the pin:

| site | agree | differ | none |
|---|---|---|---|
| `binleft` (`??`, operator dispatch) | 2,690 | 20 | 4 |
| `recv` (member rung) | 450 | 43 | 0 |
| `recvarg` (member rung on the argument type) | 478 | 15 | 0 |
| `deadnull` | 132 | 9 | 0 |
| `gate` (list/field read chain) | 48 | 0 | 0 |

The 87 `differ` reads, by cause:

- **narrowed**: the pin is the declared `X | null` or `A | B`, and the elaboration has the
  narrowed `X`. Examples: `nullable-pin-field-function-per-instance`, `empty-list-join-null-*`,
  `hole-param-is-complement`.
- **rep**: the pin `i32[]` is a hole-function list's id rep, and the elaboration's
  `((_) => _)[]` is open (`hole-fn-list-*`, 26 reads).
- **equivalent**: `null` against `never | null`, and a literal union `N` against its `i32` rep.
- **open pin**: the pin is a type variable `V`, and the elaboration has the closed record.

The function now returns the elaboration's type wherever that type is closed, and the pin
stands only where it is open or missing. That leaves the rep rows and the 4 `none` reads. All 4
`none` reads are root-frame builds of a generic held in a value slot, which are `spelled`
builds with no instance (§1), so there is no `ty(inst, node)` to read there. Nothing went dead:
the pin is still the fallback for those rows.

## 3. What mono still decides

| family | count | TYPE or REP | why it stands |
|---|---|---|---|
| argument row arms (`monoArgRowArmTy`) | 1 site | rep | the row a literal is built at (step 7) |
| closed-type spelling, union registration | 7 + 4 sites | rep | step 7 |
| `monoElabPin` spelling and delivery | 5 sites | rep | the type is already `elabCallParamTy` (step 7) |
| `monoKeyPinSeg`, `spelled` path | 79 builds | type | the elaboration has no instance at these pins (§1) |
| `monoKeyPinSeg`, typed dedup | 359 hits at #6928 | rep | the same reps make one instance (step 7) |
| body reads, pin fallback | 26 + 4 reads | rep + type | an open hole list's rep; 4 reads with no instance (§2) |
| instance no-answers | 14 | type + rep | named in #6927 and #6928 |
| late demands on refused programs | 2 | type | a reading the elaboration declines (#6928 §2) |

Every TYPE row left is a pin the elaboration has no answer for, named with its reason.
