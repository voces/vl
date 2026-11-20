# IR coverage step: the boxed-operand `??` node (`SCoalBox`), 2026-11-20

Lane F2. Step 2 of IR-REV's `SCoalBox` design for `coalesce niche identBox` (`ir-design-2026-11.md`
§10), on top of step 1's `coalBoxArmOf` (#9201). Measured on fixpoint seeds of this branch and of
step 1's head.

## What landed

- **Shared tails (legacy, byte-identical).** The five boxed arms now take one path,
  `emitCoalesceBoxArm`, which runs these tails in order:

  | tail | what it writes |
  | --- | --- |
  | `coalBoxSlot` | takes the stash slot before the box is written, as legacy takes it |
  | (each side) | the operand's box |
  | `coalBoxOpen` | the stash, the tag test and the `if`; a list element writes its present arm first |
  | (each side) | the default |
  | `coalBoxElse` | the `else`, then the stashed box, or the stash unboxed and widened |
  | (each side, binding arms only) | the re-read box |
  | `coalBoxEnd` | a binding's unbox and widen, then the `end` |

  Legacy writes the box, the default and the re-read itself.
- **The node.** `SCoalBox { cbL, cbArm, cbNull, cbOut, cbAt }`, a valued statement like a valued
  `if`. `cbL` is the box operand and `cbNull` the default body, which writes out `cbOut` on the null
  path. The lowering runs the shared tails around `cbNull`, and a binding arm re-reads `cbL`.
- **Builder.**
  - `coalNiche`'s `identBox` arm builds the node for `valBox`, `valScalar`, `elem`, `callBox` and
    `callScalar`. The other arms of the same decision are named misses (`coalesce box <arm>`).
  - A stashed arm needs a call operand, so an `as?` or `if` operand is the miss
    `coalesce box stash operand`.
  - A binding arm needs a plain variable operand (`coalesce box place`).
  - The default is built into `cbNull`, so it runs only on the null path.
- **Walkers.** The node is in every exhaustive `IrNode` match: leaves, text, family (`box`),
  assigns, the lowering, the verifier, the bounds walk and the lint's closed set. `ifBelowLead`
  counts it as a valued `if`. The verifier checks that it reads a box and writes its out, scopes
  `cbNull` and checks that `cbNull` ends by writing the out.
- **A box over a valued node.** `deliver` refuses with `box of a valued if` when its value ends in
  a box whose plan writes the tag ahead of the value and a valued node was built since the delivery
  began. Legacy writes the tag first; the IR has already written the valued node's value. The first
  census found 13 functions of this shape that failed to lower: a nested
  `q ?? (r ?? 5)` boxed into an `f64 | i32` result. They are now this named miss.

## Coverage

Measured on fixpoint seeds of this branch and master `9def19204`, which includes step 1.

| population | before | after |
| --- | ---: | ---: |
| corpus functions covered (45,678) | 39,264 | 39,312 |
| self-compile functions covered | 17,336 | 17,338 |

- **Shadow mode 1:** everything covered is verified and matched.
- **Mode-3 self-compile:** byte-identical to the shipped build.
- **Legacy bytes:**
  - `ir-identity.sh --names` against master's seed: identical 9,037, differ 0, self-compile
    identical.
  - A per-file A/B over every non-`@error` `tests/cases` program, built under master's seed and this
    branch's: same 7,231, fail under both 67, differ 0.
  - `--cases`: identical 7,516, differ 0.
- **Corpus blockers.** The 174 functions `coalesce niche identBox` held alone on master are now held
  by:

  | blocker | functions |
  | --- | ---: |
  | `coalesce box next`, the rest of the ladder (chiefly a record field `o.v ?? d`) | 92 |
  | `box of a valued if` | 13 |
  | `coalesce box stash operand` | 2 |

  The 134 that also need `member box` now read `coalesce box next + member box`.
- **Witness:** every built arm and a nested `??` in a default. The witness program prints correct
  values, and its call-counting defaults each run once, on their null path only.
- **Misses that remain in the witness:**
  - `return coercion`, for `i32 | null ?? f64`;
  - `method get`, because the IR does not build a list `.get` yet.
