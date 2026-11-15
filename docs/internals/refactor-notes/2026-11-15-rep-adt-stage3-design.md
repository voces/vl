# Rep ADT stage 3, design delta: field codes are derived, 2026-11-15 (lane E)

This note revises row 3 of [the Rep ADT design](2026-11-14-rep-adt-design.md) §5, using a census
of the tree after stage 2 ([stage 2's plan and readings](2026-11-15-rep-adt-stage2-plan.md)). It
is a design only. No compiler code lands until the coordinator has reviewed it.

## What row 3 said, and what the census changes

Row 3 said: a field stores a rep, not a code; the five parallel field columns collapse into one;
`pushFieldStorage` matches the rep; `FC_*` survives only for the object-literal stash. It estimated
about −700 lines.

The census of `compiler/*.vl` (worktree at master `258ea049`) changes three things:
- **The one column already exists.** `sFieldStoreTy` (`emit_state.vl:1915`) records each field row's
  storage type, with -1 where none is recorded. `armStageStoreTy` is its staging twin for union
  arms. Stage 3 does not add a column. It makes this one total and derives the others from it.
- **`objFieldTypes` is not a field-code column.** It is `TyObj`'s member list (`check_types.vl:94`),
  with 390 readers, and stage 3 does not touch it.
- **The `100 + code` stash is not in a field column.** It lives in `liBack`
  (`emit_if_arm_values.vl:97–99`), read in one place (`emit_bytes.vl:2278–2283`). It stays as it
  is: an integer stash keyed by the derived code.

## Ownership, agreed with lane S

- **Lane S owns** what the slot store closes a holder's slot types to, and when: `elabSlotTyAt`,
  `eplSlotSig` and `eplSlotBound`. Lane S guarantees those answers are final before emit starts,
  because `elabSlotFacts` and `elabSlotBundleFacts` run before mono. Slot-store part 2b does not
  touch field storage.
- **Lane E owns** the step from a record type to a field row's storage type, with the classify
  layer as its producer. Lane E also owns turning that type into a rep, and every `FC_*` producer
  and consumer.
- The slot store produces no per-field-row type and will not become that producer.

## The census

| population | functions | lines | `FC_*` references |
|---|---|---|---|
| producers: a code from a type, kind, rep or node | 18 | about 825 | 135 |
| consumers: a code to a valtype, kind or heap | 16 | about 274 | 202 (all consumers) |
| sidecar derivers: element name, closure signature, key kind, element type | 13 | about 220 | |
| code predicates and gates | about 25 | about 244 | |
| shared-field emission that branches on codes (`wasmEmit`, `emit_obj_lit_fits`) | about 13 | about 700, partly code-agnostic | 124 |
| declarations and imports | | | 270 |

**Producers.** About 380 of the producer lines are four anon ladders:
- `anonFieldCodeSyn` (124 lines);
- `anonFieldCode` (103);
- `anonNulListFieldCodeOfElem` (85);
- `anonNulFieldCodeOfTy` (62).

About 290 are type ladders: `fieldCodeOfTy` (95), `fieldCodeOfTyCovered` (90),
`fieldCodeOfListRep` (49) and `fieldCodeOfVKind` (40).

**Writers.** The struct columns have one shared writer per row, `pushFieldRow`
(`emit_collect.vl:6880`), plus 28 direct writer sites across the 6 parallel columns. The arm side
is 7 staging columns behind accessors that switch on `armsAdopted`.

## Stage 3, in steps

| step | change | byte-identical? | net (est.) |
|---|---|---|---|
| **3a. Shadow** | For every struct and arm row, armed under `$VL_REP_SHADOW`, compare the stored code with `fieldCodeOfRep(repOfTy(sFieldStoreTy[r]))`. Compare each sidecar the same way. Count the rows whose storage type is -1, by minter. | yes (off by default) | +60, removed at 3e |
| **3b. Total storage types** | Every row minter records the row's storage type. For anon rows from an object literal, that is the literal's checked type at its field. 3a lists which minters still write -1, and this step closes each one. | yes, if 3a shows full agreement on the rows that already have a type | +40 |
| **3c. The code is derived** | `sFieldTypes` becomes a reader, `fieldCodeAt(r) = fieldCodeOfRep(repOfTy(sFieldStoreTy[r]))`. One `match` over `RepNode` with no `_` arm replaces the 18 producers. The anon ladders go, and their rows read their storage type's rep. `promoteLitFieldToAtom` and `demoteLitFieldToString` become storage-type rewrites. | yes, for every row 3a shows agreeing; each disagreement is a named mover or a filed row before it merges | about −700 |
| **3d. Sidecars are projections** | `sFieldCloSig`, `sFieldElemTyIx`, `sFieldElemKeyKind` and `sFieldLitTyIx` become readers of the storage type's rep node: its `RClosure` signature, its list element, its map key, its atom set. `sFieldElemName` stays until stage 4, because it is a name key into `rlElemName` and heap identity by rep is stage 4's. | yes | about −150 |
| **3e. Consumers match the rep** | `pushFieldStorage`, `fieldCodeKind`, `fieldCodeVKind`, `listRepOfFieldCode` and the row predicates in `emit_atom_kinds.vl` read the field's rep node in place of its code. `FC_*` survives as `fieldCodeOfRep` for the `liBack` stash and the shared-field plans, which stage 5 collapses. The 3a shadow is deleted. | yes: the same valtypes in the same order | about −200 |

**Net estimate for stage 3: about −950 compiler lines, a range of −700 to −1,150.**
- The low end assumes 3a finds anon rows whose code is not a function of their type. Those rows
  would keep a ladder.
- The high end assumes the predicates and `pushFieldStorage` reduce to one `match`.
- 3a's shadow firms the figure before 3b starts.
- Shared-field emission is not counted. Its code branches move with stage 5's families.

Pin-helper delta: 0 expected.

## Risks, named in advance

- **A code that is not a function of its type.** The anon ladders read nodes, not only types: a
  literal's spelling, an arithmetic field, a self-contained nullable code. Any row where 3a shows the
  code is not `fieldCodeOfRep` of its storage type is the design's open question. The row is either
  a type the checker should record differently, or a reason the field keeps a code. Either way it
  is named before 3c merges, and nothing moves silently.
- **`nameFieldCodeTy` returns -1 for a type variable, or the result of an `emitFail`.** That is a
  template's open field. 3a counts whether a -1 code ever reaches a pushed row. If one does, the
  row's storage type is open, which is 2a's class one level up, and that minter is asked at the
  instance instead.
- **Arm rows before adoption.** The staging columns are read before `armsAdopted`. Derivation needs
  the arm row's storage type, so 3b writes `armStageStoreTy` with the same totality.
- **Instrument hygiene.** 3a's shadow is a committed, default-off instrument like stage 0's. It
  holds no byte marker, and its control is a row known to disagree, which 3a makes on purpose.

## Acceptance

- Each step: two refreshes byte-identical (fixpoint), and the corpus's 12,037 cells with 0 exit and
  0 module-byte movers against the predecessor, or each mover named.
- Also each step: `regress.vl` no runs lost, `rep-fuzz-check.sh`, the gate, plus net lines,
  pin-helper delta, L2 fuel and peak RSS.
- D16170 (closed 2026-11-14) is the regression pin. A `FC_STRUCT` that hid `X | null` against
  `Y | null` must stay distinguished once the code is derived. The rep nodes `RNullable{RRecord X}`
  and `RNullable{RRecord Y}` differ by construction.
