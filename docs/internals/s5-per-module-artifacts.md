# S5: per-module compile artifacts

The plan for compiling a VL module once and reusing its code across every program that
imports it. The motivating consumer is heregeat. Its test files share no module compiles,
and `VL_COMPILE_CACHE=1` keys a build on the entry's whole closure, so one edit recompiles
every importer. The five needs this answers are in incremental-compilation-design.md §5,
*What a per-module compile artifact needs from codegen*.

This doc covers:

1. what a body encodes that the link must own, measured;
2. the artifact format;
3. table ownership at link;
4. generic instances;
5. `-O` after link;
6. the cache key;
7. the ordered steps and the gate on each.

Step 1, the relocation recorder, has landed. §8 holds its proof.

## 1. What a body encodes: the census

`scripts/s5-relocs.vl census` decodes every instruction in every code body. It counts each
index immediate by the space it names, and it counts the global and element initialisers
the same way. Measured 2026-10-19, before the rebase onto `3fbefe6d6`.

| population | instructions | function | type | field | global | table | data | memory |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| self-build | 2,507,674 | 74,519 body | 653,858 body · 23,608 init | 355,285 | 74,843 body · 901 init (18,956 pool) | 4 | 0 | 0 |
| tests/cases, every 20th (232 modules) | 420,024 | 11,279 | 72,030 · 4,569 | 37,734 | 4,384 · 38 | 285 | 1 | 20 |

The self-build has no data, elem or tag section. Every LEB in the sample is one byte. A
padded 5-byte LEB for every relocated site would add about 3 MB to the self-build, so
**the link re-encodes minimal LEBs**. It does not patch in place.

**Two kinds of index.** The spaces in the table are *decodable*: an opcode's immediate says
which space it names, so the link can find every one by reading the body. The precedent is
`typeOrderRun` (emit_type_order.vl). It already decodes each body, remaps type immediates and
re-encodes them as minimal LEBs, moving later offsets through `movedOffset`. Decodable sites
need no record.

The other kind is a program-dependent index that travels as a **value**, an `i32.const`
that a decoder cannot tell from an ordinary constant. `scripts/s5-relocs.vl consts A B`
finds them by diffing a compile against a perturbed twin. The twin is a scratch compiler
that adds 1000 to union tags, 2000 to closure table slots and 3000 to literal-atom ids. On
the self-build, 18,650 constants moved:

| population | union tag | literal atom | closure slot | init guard |
| --- | --- | --- | --- | --- |
| self-build | 12,634 | 6,014 | 2 | 0 |
| tests/cases sample, body · init | 1,689 · 35 | 342 · 1 | 24 · 242 | 0 |

Union tags are `uVariants.length + k`, the variant's rank across the whole program. Atoms
are numbered across the program in the order they are met. A closure slot is
`gImports + fe`. None of these is local to a module.

## 2. The artifact

An artifact is the module's bodies plus enough to place them:

- **Bodies**, unoptimised, in the module's own function order. Each body's index immediates
  are written against the module's own local numbering: its functions, the types it uses,
  and its globals and strings.
- **Symbol tables, one per space**, mapping each local index to a module-stable symbol.
  Functions and globals use the `name$m<id>` names already emitted. Types use a canonical
  shape key (§3), tags use a member-set key, atoms use their literal text, and strings use
  their bytes.
- **Value relocations**: (body, offset, space, local value) rows for the constants a decoder
  cannot see. This is what step 1 records, as a `vl.reloc` custom section of ULEB offset, u8
  space and SLEB value.
- **Initialisers**: each global's init expression and the module's share of the start
  function, as separate entries so the link can order them by import order.
- **Demands**: the generic instances the module calls but does not own (§4).

Decodable spaces carry no relocation rows. The link decodes the body, maps each immediate
through the module's symbol table to the program index, and re-encodes the LEB. This is
`typeOrderRun`'s pass, generalised from one space to all of them.

## 3. Table ownership at link

The link owns every table that spans modules. A module never fixes one of their indices.

- **Types.** A module lists the shapes it uses by canonical structure. The link interns them
  into one table, applies `buildStructTwins`'s same-shape sharing over the whole program,
  forms the single rec group, and runs `typeOrderRun`'s use-ordered reorder over the linked
  bodies. The reorder then sees exactly the input it sees today, so the type section can be
  byte-identical to a whole-program build.
- **Union tags.** A union's member set is its ABI, and box tags are positional. **A member
  set is never deduplicated or reordered**. The link assigns a tag to each (union key,
  member position) pair in the order the whole-program build would. A tag row in an artifact
  names its union key and member position, never a number.
- **Literal atoms.** These are keyed by literal text. The link numbers them in first-meeting
  order over the linked program.
- **Strings.** The string pool (`collectStrPool`) is placed by the link before user globals,
  as today. `computeGlobalPromotion` runs at link, because promotion reads every module's
  writes.
- **Functions and closure slots.** `gImports` depends on what the whole program prints or
  reads, so function indices and the `gImports + fe` closure slots are assigned at link.

## 4. Generic instances

An importer's call creates an instance of an imported generic (`monoInstantiate`). Today the
first instance takes the template's slot, later ones go at the tail, and `monoPruneTemplates`
stubs a template nobody instantiates. In the artifact world:

- An instance is keyed by the template's interface hash (iface_hash.vl) and its canonical type
  arguments.
- The instantiating module lists the key among its demands and does not emit the body.
- The link collects every module's demands, emits each distinct key once from the template
  owner's banked source, and places the instances where the whole-program build would. The
  first instance takes the template slot, the rest go at the tail, and templates with no
  demand are pruned.
- An instance body is cached under its own key, so a second program demanding the same
  instance reuses it.

The demand list is the codegen twin of the instantiations the check bank already records
(design §5, step 10).

## 5. `-O` after link

`opt_pipe.vl` and `opt_escape.vl` work over the whole module, and `opt_escape`'s
growth-budget decision is global. Artifacts are therefore unoptimised, and `-O` runs once
over the linked module. An unoptimised build (the `vl test` default) needs no optimiser
pass at all, which is what makes artifact reuse pay off for test runs.

## 6. The cache key

An artifact is keyed on:

- the module's own source hash;
- the interface hash of each import, as reached by this module (`ihReachOf`), which already
  covers the readings the check bank serves on;
- the whole-program facts the bodies read (design §5 need 4), each either computed from the
  key or moved to link;
- the compiler's own hash, as the whole-compile cache keys today.

An instance's key is (template interface hash, canonical type arguments, compiler hash).
`iface_hash` is reused unchanged. What is new is that codegen must not read anything the key
does not cover. Step 4 below proves that by building twice under different importers.

## 7. Ordered steps

Every step before the switch-over (step 6) produces a **byte-identical** seed and corpus. Its
gates are difftree `--identity` with 0 differ, plus the fixpoint. The switch-over is graded
on program behaviour instead.

1. **Record value relocations, resolve immediately.** (Landed, §8.) An armed compile emits
   `vl.reloc` rows for every value-borne index. The gates are identity, the fixpoint, and the
   proof that reapplying the rows plus decode re-links each module byte for byte. Seed and L2
   fuel are measured.
2. **Symbolic value rows.** Replace each row's value with its symbol: union key and member
   position, atom text, closure function symbol, guard global symbol. Record global
   initialiser constants and data-segment contents as well (the gaps in §8). Gates: identity,
   the fixpoint, and the proof with every row resolved through its symbol rather than its
   number.
3. **A link pass inside one compile.** Emit the whole program, then rebuild it through a link
   step that reads only per-module bodies, symbol tables and rows. Types, tags, atoms,
   strings, functions and globals are assigned at link. Gates: identity, the fixpoint, and
   linked output equal to direct output on the self-build and every case.
4. **Per-module emission.** Emit each module's bodies against local numbering, with
   instances as demands (§4), still inside one compile and still linked at once. Gates:
   identity and the fixpoint, plus a **key-coverage test**. One module compiled under two
   different importer sets must give the same artifact whenever its key is equal. This is
   where design §5 need 4, the whole-program facts, is settled fact by fact.
5. **`-O` after link.** Move the optimiser behind the link. Gates: identity on `-O` builds,
   the plumb-shape cost gate, and seed-size.
6. **Switch-over: the artifact cache.** The host stores artifacts and instances under §6's
   keys and links a build from them. Gates: every gate on master, with
   `VL_COMPILE_CACHE_VERIFY=1` comparing a cached link against a cold build. The hit rate is
   measured on heregeat's test files and the 60-module chains.

## 8. Step 1: the relocation recorder

`compiler/emit_reloc.vl` holds the recorder. `RELOC_ARMED` is `false` in source, so the shipped
compiler records nothing and its output is unchanged. A scratch build flips it, and that
build is never a seed.

The writer notes a row at each value-borne site with `fbI32Rel(space, v)` (emit_bytes.vl),
about 135 sites in wasmEmit.vl. A row is pending against the buffer that holds it. A buffer's
identity is found by an alias probe, because a list has none of its own. The rows travel with
the bytes:

- `wBytes` copies them;
- `wDropBack` trims them;
- body placement (`placeCodeEntry`) fixes them in the code payload;
- `rewriteCodeCount` and `writeCodeSection` rebase them;
- `typeOrderRun` moves them with the LEBs it re-encodes.

A folded const global's row is banked per global (`relFoldBank`) and noted again wherever
the fold is copied (`relFoldNote`).

**Proof.** `vl run scripts/s5-relocs.vl -- proof ARMED [PERTURBED]` takes a module or a
directory. For every row it checks that a decoded `i32.const` sits at that offset with that
value. It then rebuilds the module from a skeleton with every relocated LEB removed, from
the rows and the decoded sites alone, and compares the bytes. Given a perturbed twin, it
pairs constants and names every moved body constant that has no row. It exits 1 on a bad
row, a rebuild mismatch, or an unrecorded constant.

| population | rows (all name their constant) | tag | atom | slot | guard | re-linked LEBs, 0 modules differ | moved body constants recorded | moved init constants (step 2) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| self-build | 18,620 | 12,648 | 5,972 | 0 | 0 | 1,203,078 | 18,620 of 18,620 | 44 |
| tests/cases every 20th, 228 modules | 2,027 | 1,535 | 453 | 39 | 0 | 135,760 | 1,995 of 1,995 | 318 |
| tests/cases/globals, 57 modules | 106 | 34 | 9 | 0 | 63 | 10,001 | 106 of 106 | 13 |

Decoded index sites re-linked by decode, self-build:

| function | type | field | global | table |
| --- | --- | --- | --- | --- |
| 74,620 | 678,245 | 355,723 | 75,866 | 4 |

32 recorded tags in the case sample did not move under the perturbation. Each one is a real
`uVariants.length + k` scalar tag that the twin's `uTags` shift does not reach. They are
correct records, and the proof prints each with the opcodes before it.

The proof found two unrecorded writes, and both are fixed:

- a folded const global, witness `tests/cases/types/nul-litunion-global.vl`;
- the shared-field `is` across record arms (`yes[j]`), witness
  `tests/cases/unions/record-arms-same-field-over-generic.vl`.

**Named gaps, left for step 2:**

- **Global initialiser constants.** These are the 44, 318 and 13 moved init constants above,
  which step 1 does not record.
- **Data segments** (`arrLitDataPut`). Their contents can hold tags or atoms. The sample has
  one data index and no measured moved data byte, so the population is unmeasured.
- **The perturbation oracle.** It sees only the sites the twin perturbs: tags through `uTags`
  and `scalarTagOfKind`, slots at the closure-slot write, and atoms at `litAtomNext`. A
  value-borne index computed some other way would be invisible to it. The re-link proof
  still covers such a write, but only if the write is recorded.

**Cost**, against master's current seed at `3fbefe6d6`:

| measure | master | candidate | change |
| --- | --- | --- | --- |
| seed size, bytes | 6,461,279 | 6,466,066 | +4,787 (+0.074%) |
| L2 fuel (each seed compiling its own source) | 111,543,038,566 | 111,854,612,525 | +0.28% |
| master's seed on the candidate source | — | 111,853,770,050 | the disarmed recorder costs nothing at run time |

All of the fuel growth comes from compiling the recorder's own source. An earlier layout
cost +2.17%. It exported the placed-row tables as mutable module globals and read them in
two other modules, and that alone was most of the cost. They are now private, behind
accessors.
