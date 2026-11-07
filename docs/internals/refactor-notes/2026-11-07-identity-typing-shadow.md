# Identity typing (A), as a shadow (2026-11-07)

Option (A) is §2.2 applied to every function value: each declaration and lambda gets a singleton
`Fn#d`. This note measures it as a shadow, `$VL_ID_SHADOW` (`compiler/emit_id_shadow.vl`),
built at `df635dbd`. Mode 1 records and prints rows; mode 2 also keys callback specialization by
the shadow. The shadow sits beside the checker and no pass reads it. Its rule:
- a lambda literal, or a read of a declaration, is `{d}`;
- a read of a `let` is the union over every value written to it (`wrDstDecl`);
- a value `if` or `match` is the union of its tails;
- anything else (a parameter, a field, a call result) is open.

Population: the 23,450 programs §3.4 uses. That is `tests/cases` (7,576), the distilled corpus
(11,779) and 4,095 inventory `Repro:` blocks (`scripts/id-shadow/witnesses.sh`). The sweep is
`scripts/id-shadow/run.sh`, and `tally.sh` prints the tables.

**(a) Function-valued reads, by kind.** These are the reads the checker types as non-callee
values. "Today" means the checked type already carries a set.

| kind | reads | singleton | set | open | today has a set |
|---|---|---|---|---|---|
| lambda literal | 9,744 | 9,744 | 0 | 0 | 3,901 |
| module-scope declaration | 9,378 | 9,378 | 0 | 0 | 7,535 |
| nested declaration | 1,214 | 1,214 | 0 | 0 | 1,131 |
| `let` binding | 3,166 | 1,413 | 1,193 | 560 | 2,498 |
| parameter | 1,241 | 0 | 0 | 1,241 | 29 |
| other | 298 | 0 | 0 | 298 | 24 |

VL has no methods, so there is no method row. "Today has a set" counts presence, not
correctness. `elabFnSetTy` is keyed by type index, so two values that share an open type share
one set. See (b).

**(b) At mono's 1,590 specialization decisions**, the shadow's singleton is mono's declaration in
all 1,590. 1,114 of those arguments are names, where that agreement is a real check. The other
476 are lambda literals, which agree by construction. Read at `elabIdentityTy(arg, frame)`, today
gives:
- 1,505: no set;
- 3: no type;
- 82: a singleton naming another function.

Of those 82, 0 name mono's declaration. In `generics/hole-call-generic-lambda-arg.vl`, all five
decisions read the same set `{9}`, held by the type index the argument shares with it. This
reading differs from slice 1's (70 naming mono's `@name`, which read the call's key first). Both
agree that today's sets do not carry this fact. None is tagged, so D15010 holds: 0 tagged sets
are specialized.

**(c) Joins of function values** (1,873 joins in 1,001 programs):
- 1,557 become finite sets: 1,474 of size 2, 71 of size 3, 3 of size 4, 1 of size 6 and 8 of
  size 8;
- 160 join one function with itself;
- 156 are open.

Of the 1,557 sets, 663 are on a type that is tagged today and 669 on one with an untagged set.
**224 sets are where today's type carries no set**: 94 lists, 74 `let`s and 56 if/match arms.
That is the new population the join and dispatch rule (§2.2, D3975) would first meet.

**(d) Risk check.** In mode 2, each specialized argument is keyed by the declaration the shadow
names, and declined where it names none. Instances: 25,038 in mode 1 and 25,038 in mode 2, so
the delta is 0. 0 programs grow and 0 fall. Mode 2's modules are byte-identical to mode 1's over
all 23,450 programs.

**Flags off.** With `$VL_ID_SHADOW` unset, the modules built by this head's seed and by master's
are byte-identical for 23,449 of 23,450 programs. Both seeds are fixpoints. The odd one out is
D12131's witness, which traps the checker under both seeds (exit 70, filed). Its banners differ
only in the seed's size and the function indices.

**Reading.** Identity is cheap to know and exact where mono needs it. Every specialized argument
has the singleton, and grouping by it moves no instance. The cost of (A) is not in
specialization. It is in the joins: 1,557 finite sets, 224 of them on values that carry no set
today and so have no tagged dispatch built for them.
