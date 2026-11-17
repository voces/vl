# Storage per (KeyId, parameter): design, 2026-11-17

Lane STORE, after A1.3. DECISIONS 2026-11-17 ("STORE A1") makes this the design step that unlocks
class G and deletes `fnTagRedecide`; A1 keys an instance as (KeyId, storage). This note fixes the
shape before anything is built. It is for the coordinator's ruling and changes no code.

## The problem in one sentence

Storage is decided per set today (`fnTagged[s]`, one bit for the whole program), but what decides
it, the calls through a parameter at closed argument types, is per instance. The check can see only
the per-set approximation. The elaboration sees instances, so a second decider runs after it.

The residue that remains (`late-tags-baseline.txt` after #8943, 417 rows by first letter):
N 127, G 113, T 112, P 34, V 14, S 7, J 5, C 5. Every class except the producer gap N is a set whose
correct storage needs a fact keyed by instance:
- **G**: a generic member called at two instantiations through one holder. Each instance's calls
  need a different signature, so one bit per set is wrong in one of them.
- **S**: a written `let` a parameter seeds holds the join of the parameter's set and the writes.
  That set exists only once the parameter is bound (A1.3 note: the P-shaped move breaks 5 of 5
  programs).
- **T, remaining**: lambda members (61) and calls in lambda or generic bodies (8) or at open types
  (10). Each closes only under the enclosing instance's binding.

## What decides storage

A **storage row** is (`KeyId`, parameter position `i`) for each function-typed or function-holding
parameter of the key's declaration. Its value is one of:
- `RDirect(d)`: the parameter holds one known declaration, so calls through it are direct.
- `RSetId(s)`: it holds ids of set `s`, and each call through it dispatches on the id.
- `RClosure`: it holds closures.

The rule, per row:
1. **What reaches it.** Take the set the key's binding vector gives the parameter (A0: a set component
   is a type, `fnTagSetOfTy`), joined with every value the body writes to a binding the parameter
   seeds (`cwDeclWriteValues`). That join, made under the key, is S's missing fact.
2. **What is asked of it.** Take each call through the parameter, or through a path from it (field,
   element, the A1.3 path walk), with argument types substituted by the key. A call at open
   argument types under a closed key is a key-closure bug, not a storage case.
3. **Decide.**
   - `RSetId(s)` when every member's result at each such call is defined and the member results
     agree per call (`setMemberRetAt`, today's split test, applied per key).
   - Otherwise `RClosure` at the one signature the calls agree on.
   - Otherwise a refusal that names the contract (D16878's family).
   - `RDirect` when the set has one member.

The holder rules `ftPlan` applies today (escapes, holders, hand-backs, closed-type deliveries) do
not change. What changes is the unit they range over: a row's leaves are the nodes of its
declaration's body read under its key, not every node carrying the set.

A **set's** storage becomes derived: a set is tagged where some row stores it as `RSetId`. A value
crossing a call edge between rows that disagree is converted at the edge. `RSetId` → `RClosure` is
the existing delivery adapter (`fnCloCoerceNote`, `ftCloAt`). `RClosure` → `RSetId` is not
expressible, so a row is `RSetId` only if every caller's row for the argument is `RSetId` of a
subset or `RDirect`. That is a fixpoint over the call graph, monotone toward `RClosure`; it ends by
the finite rows.

## Check-time facts it needs

| fact | today's producer (after the elaboration) | check-time producer |
|---|---|---|
| the instances | `ekDecl`/`elabKeyOf` | `check_inst_keys.vl` closure (A0/A1.1); lambda members by `?#L<decl>.k` |
| the calls through a parameter per instance, member results | `mintFactNote` | arrow rows (`check_arrow.vl`) substituted by the key; `check_arrow_facts.vl` keyed by `KeyId` instead of by set |
| hand-backs | `mintRetNote` | `check_hand_back.vl` (already read on the fact retry, `ftRetParamsOf`) |
| a written binding's join per instance | `mintSeedNote`, `mintSeedBindsOf` | `cwDeclWriteValues` + the key's parameter set (new, STORE) |
| closure deliveries | `mintCloDeliveryNote` | `sbCloDelivered`, per key |
| stores into a holder | `mintStoreNote` | `ftStoredAt`'s literal reading under the key |
| partial sets, held parameters, forwarded fields | `mintSetPartialNote`, `mintParamHeldNote`, `mintFwdFieldSetNote` | set-binding rows (`check_set_bind.vl`) keyed by `KeyId` |

The first two rows cover 387 of the 416 programs g81 counted. The written-binding join is the only
new producer, and it replaces the elaboration's (`mintSeedNote`); it is not a second one. That is the
point the 2026-11-16 ruling against a check-time join turned on. This note asks to reverse that
ruling on that ground: the elaboration stops producing the join at stage B3.

## How it removes `fnTagRedecide` and `elabMintFacts` as a tag input

- `fnTagDecide` runs once, at the end of check, over storage rows. It writes a table
  `storageAt(KeyId, i)` and the derived per-set tag bits the emitter's rep code reads today.
- The elaboration keys an instance by (`KeyId`, storage vector), as §10 settled. Two instances with
  one `TyId` vector and different storage are two instances. That is G's fix, and it splits instances
  only where today's single bit is wrong for one of them.
- `elabPrepare`'s round loop (`ELAB_TAG_ROUNDS`, `fnTagRedecide` until settled, the two `emitFail`
  probes) goes. The elaboration runs once, from a decided table. `elabJoinDemandsTake` stays with
  its own owner; it is not a tag input.
- `mintFactNote` and the other `check_mint.vl` writers in `emit_elab.vl` lose their tag-decision
  reader. Each table either keeps a non-tag reader (to be listed per table at B3) or is deleted
  with its writer. Emit then holds no fact the check decides storage from.
- `ftLate` and every `ftLate ||` arm in `check_fn_tag.vl` go with it. A1.2 and A1.3 kept those arms
  only because the late re-decision clears and re-decides every set.

## Stages

- **B0, shadow (identical).** Build the storage rows at check from the A1.1 keys. Under
  `$VL_INST_KEYS`, diff each row's value against the storage the elaboration's instance actually
  used. Report: equal, check-only, elab-only, and the open reasons (key not closed, a lambda key the
  closure misses, a call path the arrow rows do not reach: N's producer gap). Nothing reads it.
- **B1, written-binding join at check (S).** The join under a key, shadowed against `mintSeedNote`
  table by table. No consumer yet.
- **B2, the decider reads rows where every key agrees.** A set whose rows all decide the same way is
  decided at check from them. This moves S, the remaining T and P, and the N sets B0 finds. Their
  late branches are narrowed per the 2026-11-16 amendment, and their rows leave the baseline.
- **B3, storage in the key (G).** The elaboration and mono key by (`KeyId`, storage vector);
  `fnTagRedecide`, the round loop, `ftLate` and the mint tables' tag readers are deleted in one PR.
  Graded by the size stop rule: wasm movers are named, and growth must be paid for by closed rows.

## Costs and risks, measured before each stage

- **Module size**: B3 splits instances only where storage differs. B0's report counts those keys per
  program before any consumer exists.
- **Check time**: the rows multiply the per-set work by keys per declaration. B0 measures L2 fuel with
  the shadow armed and unarmed; the gate is the usual +1%.
- **N (127 rows)** is a producer gap, not a storage question. A set the rows never reach has no row,
  so B3 cannot delete the late decider while N rows remain. B0 names each one's missing source.
  Closing those is producer work (set-binding and arrow rows), scheduled from B0's table, before B3.

## Ownership

STORE owns the rows, the decider and B0 to B3. L2 owns the vector and its substitution, which the rows
read. The arrow rows stay L2's; STORE reads them per key. H and L1 adopt (`KeyId`, storage) as the
instance identity at B3.

## Asked of the coordinator

1. Reverse the 2026-11-16 ruling against a check-time written-binding join, on the ground that B3
   deletes the elaboration's join, so there is one producer at every commit after B3. Between B1 and
   B3 it is a shadow only.
2. Approve the order B0 → B1 → B2 → B3, with N's producer gaps scheduled from B0's table before B3.
3. Approve the call-edge conversion rule: `RSetId` → `RClosure` at an edge where the rows disagree;
   never the reverse.
