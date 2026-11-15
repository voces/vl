# IR step I1a: lowering and dual emit, 2026-11-15

Lane I. This is step I1a of `ir-design-2026-11.md` §5.3: I1's lowering and the dual emit, in the scope agreed with the L1
design lane. Nothing is claimed. Measured on fixpoint seeds of this branch and of its master
base, with the native host built from the branch.

## What landed

- `compiler/ir_lower.vl`: the lowering for I1's node set, and `irDualEmit`.
  - Statements and right-hand sides lower as `_`-less matches. The opcode tables match over `RpPrim`.
  - Every byte goes through an `fb*` builder.
  - Two builders are new: `fbF64ConstBits` and `fbF32ConstBits`, because an immediate holds bits, not a lexeme.
- **Temps go back to the stack** (amendment 1). A temp's right-hand side is written at its one use. That holds only when the temps
  a node consumes, in post-order, are exactly the ones its body defined since the previous node,
  in definition order. The lowering checks this per node. A violation is a named mismatch
  (`non-stack temp: out of order / unconsumed / used twice`), never a `local.tee` or a reorder.
- **`&&` and `||`** are legacy's value-typed `if` (`0x7f`). The builder's slotless local is a stack
  value, which each arm produces and the one later read consumes, in order.
- **The emitter's state is left as found** (amendment 2).
  - The lowering writes into its own buffer, and the current target is restored.
  - `dfeCallee` is cut back to its length on entry.
  - Every frame a builder opens is closed, so only the function's own `end` moves `ctrlDepth`. That one level is given back.
  - The lowering banks its span rows in its own table, and the reloc table is untouched.
  - Reloc rows are not compared: `RELOC_ARMED` is a compile-time `false`, so no build writes any. If it is ever flipped, the dual emit must compare them too.
  - The mechanism is proved by the armed self-build, which is byte-identical to the seed.
- **The dual emit** compares the whole code entry (size prefix, locals vector and body) byte for byte,
  then legacy's kind-5 statement rows against the lowering's. A difference is classed by its
  region and the source statement that holds it.
  - `VL_IR_SHADOW=2` adds, for the first three examples of each class, both entries in hex and the printed IR.
- **Legacy shapes reproduced:**
  - `while`'s `block; loop; <cond>; i32.eqz; br_if 1; <body>; br 0; end; end`, and the
    literal-`true` loop with no test;
  - an inline `if true`;
  - `return` and the direct-call `return_call`;
  - a void body's tail call to a void callee that hands nothing back (`emitVoidTailCall`);
  - the `unreachable` pad of a valued body that does not end in `return`;
  - `0 - x` for integer negation, with a negated literal folding to its constant;
  - `i32.const 0; drop` for a bare value statement.
- **`SDrop{dpV}`** is a migration-only statement, as the design records it: a value evaluated and
  discarded, the way legacy writes a bare value statement. A dead-code pass deletes it once bytes
  may move (I8 or I10).
- **Builder changes:**
  - `PrimOp` carries signedness (`divu`, `remu`, `ltu`, `leu`, `gtu`, `geu`, beside `shru`), chosen from the operand's type. The verifier checks the choice against the type.
  - No type on master reaches the unsigned forms yet, so their lowering arms have no input.
  - The result rep follows legacy's own voidness (`fRetVoid`), and falls back on the recorded result type (`fRecRetTy`).
  - An `else if` link carries no span of its own, as in legacy's chain.
- **Globals** ask legacy's chokepoint: `userGlobalPlain(gi, write)` in `wasmEmit.vl` is true when legacy
  writes one `global.get`/`global.set` of `userGlobalIdx(gi)`. It is pure: every callee only
  reads, and the armed self-build is unchanged.
- **Failing controls:**
  - `irShadowCorrupt(3)` adds a byte to every lowering, which must turn every match into a byte mismatch;
  - `irShadowCorrupt(4)` drops a span row, which must turn every match into a span mismatch.

## Measurements

| reading | value |
|---|---|
| self-compile, armed: covered and verified | 1,501 of 17,454 functions |
| matched (entry bytes and statement spans) | 1,499 of 1,501 |
| mismatched | 2, both `global read with a guard or a fold` |
| distilled cells, every fifth (295 cells): covered | 252 of 907 functions, 252 matched |
| armed self-build vs the seed | byte-identical |
| this seed compiling master's tree | byte-identical to master's seed |
| L2 fuel, master seed on master | 89,537,488,546 |
| L2 fuel, this seed on master's tree (the seam with the shadow off) | 89,537,543,473 (+0.0001%) |
| L2 fuel, this seed on this tree, shadow off | 89,964,217,024 (+0.48%: the new source compiled) |
| L2 fuel, shadow on | 90,202,466,499 (+0.26% over off) |

## For I1b and later

- **I1b's claiming gate** is zero mismatches over the whole distilled set (`cells/` and `named/`) and the
  self-compile. The two global classes (a folded const's immediate, and an init guard) are its first work, or
  those functions stay unclaimed.
- **An I8 dependency:** `userGlobalPlain` is a legacy oracle. When legacy deletes, the decisions it reads
  (fold, promotion, guard, init bit) become facts the builder reads, or IR nodes of their own.
- **`SDrop`** goes with every use once bytes may move.
- **`irBodyLeaves` is conservative.** A tail `SSwitch` whose arms all exit, or an `SBlock` whose body leaves, counts as
  not leaving. Widen it when I4 builds switches.

## Before I1b claims

Each fact the lowering reproduces must become one decision that legacy and the IR both read. Two copies can drift, and a claimed function is no longer compared. The pairs:

| legacy | the lowering's copy |
|---|---|
| `emitUserGlobalGet` / `emitUserGlobalSet`'s chain | `userGlobalPlain`; to become one `userGlobalAccess(gi, write)` value that both match with no `_` |
| `emitVoidTailCall`'s test | `voidTailCallee` |
| `emitFallThroughPad` / `bodyEndsInReturn` | `endsInReturn` |
| the unary-minus ladder (`0 - x`, literal fold) | `primOp`'s `neg` arm |
| `emitUnionRetSink` / `emitTailCallRet` (`return_call` for a direct call) | `ret` |
| `emitWhileLoop`'s `condLitTrue` and `emitIfLinkStmt`'s inline `if true` | `ifNode`'s `isTrue` |

Also before claiming: zero mismatches over the whole distilled `cells/` and `named/`, through `regress.vl`'s harness. `localsVec`'s search is quadratic in locals; sort it before large functions arrive.

## Net lines

- Compiler: +1,206 / −50.
  - New module: `ir_lower.vl` 956.
  - `ir_build.vl` +139 / −29, `ir.vl` +26 / −5, `ir_verify.vl` +38 / −4, `wasmEmit.vl` +11, `emit_bytes.vl` +20, `emit_sections.vl` +4 / −1, `lint.vl` +12 / −11 (the closed-set mirror).
- Host: +14 / −5. Tests: +23.
- Pin helpers in `emit_mono.vl`: 908 → 908.
