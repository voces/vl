# A function-holding let's slot fact, from its calls

Moved verbatim from [architecture-target-2026-10.md](../architecture-target-2026-10.md) §3.4 on 2026-11-07; its `§` references are to that file.

#### A function-holding let's slot fact, from its calls (2026-11-07)

`monoLetWritesClosed` asks whether every write to an un-annotated `let` holding functions is
closed. Over 23,828 programs, 89 decisions in 73 programs. 75 had no slot fact, because the
closers decline a holder whose members are hole functions with open own types. Read pre-walk
(`nodeTyFrozenOf`), every row answers as it does post-walk.

| holder's function slots | decisions | outcome on #6673 |
|---|---|---|
| one closed call signature each | 5 | 1 takes a fact; 3 hold a member returning another result; 1 is outside the gate |
| a slot called at two or more signatures | 53 + 17 | parked, below |
| a nested slot never called | 1 | no fact |
| fact exists, mono said open | 6 | `monoLetWritesClosed` reads the fact: open to closed, output unchanged |

The three that decline (`q`, D15354 and D15355 `m2`) hold `inc0`, which returns `i32`, in a slot
called at `(i32) => f64`. Closing them needs an instance that widens the result, not a fact.
On master `q` runs; D15354 and D15355 refuse at emit after `vl check` passes (clause 2), and are
parked here as the result-widening gap, beside the 70 below. The
fifth, `r5`, holds the closed `m`, so the open-slot gate never admits it; its writes are closed
already.

**The fact.** `elabSlotBundleFacts` rebuilds a holder no closer closes from
`elabSlotDeliveries`, one leaf at a time, through lists, maps and records. A leaf takes the
signature its calls deliver when all of the following hold:

- every call agrees on it;
- the slot carries a tagged set;
- every member of the set returns the signature's result at its parameters
  (`elabResultAtParams`).

A bare function value and a nullable holder take no fact. `monoLetWritesClosed` returns true on a
closed fact and otherwise keeps its write derivation.

**The member check is not optional.** Calls name a signature; writes put functions in the slot.
`{ xs: [inc0] }` written `half` through a parameter and called once at `(i32) => f64` took that
signature. `inc0` then sat in an `f64` slot, and the program trapped check-clean, where master
refuses at emit. Two fixtures pin it (`closures/error-record-fn-list-field-*.vl`). D15190 is the
same program, and it graded `runs` without the check. A bare generic value is the other
exclusion. D9850's `const v = __deliver()` took its call signature and lost the instance
`monoRetGenWidePins` takes at the declared `| null` parameter.

**Parked: the 70 polymorphic slots (53 + 17), prerequisite A.** A slot called at two or more
signatures holds one function identity instanced at several. The missing fact is "slot holds
set S, instanced at these signatures". Witnesses are the d15117/d15119 family. They stay on
`monoLetWritesClosed`'s write derivation until argument-keyed instances (the note below) are
ruled on, beside D12234 and D15010.
