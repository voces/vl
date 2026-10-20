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

Step 1, the relocation recorder, has landed (§8), and so has step 2, symbolic value rows (§9).
Step 3a, a link pass inside one compile, is in review (§10).

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

A union box tag comes from one of three bands, all numbered across the whole program:

- a struct variant's tag is `uTags[vi]`, the count of variant signatures that sort below
  its own, so equal signatures share a tag;
- a scalar kind's tag is `uVariants.length + k` (`scalarTagOfKind`);
- above that sits a slot band, three residues interleaved, for a ref-list element type, a
  map's key kind and value, and a closure signature.

Atoms are numbered across the program in the order they are met. A closure slot is
`gImports + fe`. None of these is local to a module.

## 2. The artifact

An artifact is the module's bodies plus enough to place them:

- **Bodies**, unoptimised, in the module's own function order. Each body's index immediates
  are written against the module's own local numbering: its functions, the types it uses,
  and its globals and strings.
- **Symbol tables, one per space**, mapping each local index to a module-stable symbol.
  Functions and globals use the `name$m<id>` names already emitted. Types use a canonical
  shape key (§3), tags use the key of what decides them (§3), atoms use their literal text,
  and strings use their bytes.
- **Value relocations**: (body, offset, symbol) rows for the constants a decoder cannot see.
  Step 2 writes them as a `vl.reloc` custom section (§9): a symbol table of (space, key,
  value), then each row's module offset and symbol.
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
  set is never deduplicated or reordered**. A tag is not a (union, member position) pair: it
  is a rank in one of the program-wide bands of §1. A tag row therefore names what decides
  the rank: a struct variant's signature (`variantTagKey`), a scalar kind's code, or the
  slot band's element type, map key and value, or closure signature. The link collects every
  module's keys, ranks them as the whole-program build does, and writes each tag.
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
2. **Symbolic value rows.** (Landed, §9.) Name each row's value by its symbol: the
   tag's deciding key (§3), atom text, the closure function's name, the guarded global.
   Record global initialiser constants too; data segments carry no relocated value (§9).
   Gates: identity, the fixpoint, and the proof with every row resolved through its symbol
   rather than its number.
3. **A link pass inside one compile.** Emit the whole program, then rebuild it through a link
   step that reads only per-module bodies, symbol tables and rows. Gates: identity, the
   fixpoint, and linked output equal to direct output on the self-build and every case.
   The step is taken in two halves:
   - **3a.** (Landed, §10.) Functions, globals, pooled strings, atoms, closure slots and
     init guards are assigned at link from their symbols, and union tags are resolved from
     their keys against the program's band tables. The type, import, memory, tag and data
     sections pass through as program-level input.
   - **3b.** (In review, §11.) The type section and the tag band tables are built at link
     from per-module demands, so that no section passes through whole. This is where step
     4's local numbering starts to be possible.
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

**Named gaps, left for step 2** (all three are answered in §9):

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

## 9. Step 2: symbolic value rows

Each row now names a **symbol** as well as a value. `fbI32RelOf(space, subject, v)`
(emit_bytes.vl) notes the subject the symbol is named from, and `relSymKey`
(emit_reloc_keys.vl) renders the key when the section is written:

| space | key | named from |
| --- | --- | --- |
| union tag | `v:<signature>`, `k:<code>`, `rl:<elem>`, `map:<key kind>:<value>` / `map:mono`, `clo:<sig>` | the band of §1 the tag falls in |
| literal atom | `a:<text>` | the text interned as that id (`litAtomTextOf`) |
| closure slot | `f:<name>` then `#n` for the nth function of that name | the name section's name; clones of one declaration and namesake lambdas share a name, so the ordinal is needed |
| guard progress, guard global | `g:<quoted name><where>` | the guarded global (`initGuardGlobalText`) |
| guard reader | `r:<reader>` | `gInitReaders` |

A value no table explains would key as `?:<number>`. None does, in either population.

**Format, version 2.** `vl.reloc` holds a version byte, then the symbols (u8 space, key as
length-prefixed UTF-8, SLEB value), then per row its ULEB module offset and ULEB symbol
index. A row has no width: every relocated value is an `i32.const` LEB.

**Global initialiser constants** are recorded. A global's initialiser buffer keeps its
rows past body placement (`relHold`), the global section notes them with its payload parts
(`relSectionParts`), and `relPlaceSections` places them once the module rope is final.
The init-guard writes split into three spaces (progress, global, reader), since their
subjects differ.

**Data segments carry no relocated value, measured.** An array-literal data segment holds
only elements `arrLitElemIsConst` admits, a number or a boolean literal (`arrLitLeafIsNum`,
`arrLitLeafIsBool`), and a string segment holds only the string's bytes. Neither can hold
a tag, atom, slot or guard row. The cross re-link compares every data section between the
build and its twin byte for byte: 4 of 4 in tests/cases are equal.

**Proof.** `proof ARMED PERTURBED` adds four checks to step 1's:

- every key names one value in its module (`0 name two values`);
- each key of the build is a key of the twin, and the reverse;
- every moved constant has a row, now in initialisers as well as bodies;
- **the cross re-link**: each global initialiser, code body and data section of the build,
  with every row's value replaced by the value the *twin* gives the same key, must equal the
  twin's region byte for byte. This resolves each row through its symbol, not its number.

The twin adds 1000 to struct and scalar tags, 2000 to closure slots, 3000 to atom ids,
4000 to guard progress values, 5000 to guard global rows and 6000 to guard reader rows,
and 1000 times the space to the init-failure pick's arm values.

| population | rows | tag | atom | slot | guard progress · global · reader | LEBs re-linked, 0 differ | moved body constants recorded | moved init constants recorded | regions cross re-linked, 0 differ |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| self-build | 18,708 | 12,707 | 5,999 | 2 | 0 · 0 · 0 | 1,212,587 | 18,664 of 18,664 | 44 of 44 | 22,293 (9,108 init, 13,185 body) |
| tests/cases, every module both compilers build (4,654 of 5,778) | 44,478 | 32,072 | 6,818 | 5,387 | 58 · 85 · 58 | 2,480,564 | 37,776 of 37,776 | 5,438 of 5,438 | 117,611 (35,437 init, 82,170 body, 4 data) |

1,264 recorded tags in tests/cases do not move under the twin: they are slot-band tags,
which the twin does not shift. They are re-linked through their keys all the same.

**Controls**, each run before the clean result was trusted:

- `proof-drop 97` drops every 97th row of the self-build: 193 rows dropped, 193 moved
  constants unrecorded, 192 body regions differ, exit 1;
- a build whose `relHold` returns at once: 42 of 44 initialiser constants unrecorded, 3
  global regions differ, exit 1.

**Cost**, against master's fixpoint at `966471462`:

| measure | master | candidate | change |
| --- | --- | --- | --- |
| seed size, bytes | 6,504,377 | 6,513,138 | +8,761 (+0.13%) |
| L2 fuel, each seed compiling its own source | 113,757,976,554 | 112,573,402,848 | −1.04% |
| L2 fuel, each seed compiling the candidate source | 112,573,379,250 | 112,573,402,848 | +0.00002% |

Both readings come from one scratch path; fuel depends on the path the source is read
from. The disarmed recorder costs nothing at run time. The −1.04% belongs to the candidate
source and has not been attributed to a file.

Disarmed, every entry point returns at once: difftree `--identity` reads 0 of 10,936
builds differing, and the candidate compiling master's source equals master's fixpoint.

## 10. Step 3a: a link pass inside one compile

Under `RELOC_ARMED`, `emitLinkSection` (`compiler/emit_link.vl`) runs once after the module is
finished. It cuts the module into one artifact per source module plus program-level input,
rebuilds the module through `link()` (`compiler/link.vl`), and compares the result with what
the emitter wrote, section by section and body by body. It writes the outcome as a `vl.link`
custom section, which `scripts/s5-relocs.vl link <dir> [<twin dir>]` reads.

An artifact holds its functions (body bytes plus references by symbol), its global cells and
definitions, its initialiser constants, its init guards, and its pooled and `is` strings.
`link()` reads only artifacts and the program input. It assigns:

- **function indices** from symbols: every artifact's functions in load order, then the
  program's tail (lifted lambdas, rewrite twins and instances that no source module owns, in
  emission order), then the runtime's;
- **global indices**: imports, pooled strings first met, cells, then definitions in the
  order a body first names them;
- **atoms, guard names and guard readers**, numbered first met over initialisers and bodies;
- **union tags**, from each tag's key against the program's band tables: a variant's rank
  among the variant keys, a scalar code above them, and a slot-band arm by its position.

The type, import, memory, tag, data and datacount sections still pass through whole, and so
do the band tables. Step 3b (§11) builds the type and tag sections and the band tables at
link from per-module demands.

| build | rows | sections differ | bodies differ | unconsumed rows | exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| self-build | 18,724 | 0 | 0 | 0 | 0 |
| self-build, skewed twin | 18,724 | 0 | 0 | 0 | 0 |
| tests/cases, 4,658 modules | 44,496 | 0 | 0 | 0 | 0 |
| tests/cases, skewed twin | 44,496 | 0 | 0 | 0 | 0 |

The self-build is 224 artifacts, 13,268 functions and 167,495 body references; tests/cases is
5,657 artifacts and 77,816 functions. Nothing is unresolved, defined twice, encoded with a
non-minimal LEB, or undecodable. The twin (`RELOC_SKEW = 1`) moves every relocated value at
its source; its artifacts equal the plain build's in all 4,659 pairs, so no artifact carries
a program-dependent value outside a row.

Two controls must red, and do:

- dropping every 97th row: self-build 2 sections and 428 bodies differ with 193 rows no
  reference consumed; tests/cases 39 modules differ (45 rows unconsumed);
- `relHold` returning 0 at once: self-build 992 bodies differ; tests/cases 70 modules differ.

Disarmed, every entry point returns at once: difftree `--identity` reads 0 of 10,940 builds
differing, and the candidate compiling master's source equals master's fixpoint.

Cost: seed 6,517,047 → 6,571,947 bytes (+0.84%). L2 guest fuel on master at #4186: the master
seed on its own source 108,435,078,638, on this source 109,250,016,253 (+0.75%), and the new
seed on this source 109,250,019,312 (+0.000003%), so the compiler is no slower on a given
program and the cost is its own larger source. Before #4186 mixed the write scan's key, the
same source read +2.32%, and ablations of it did not add up: linear probing over a clustered
key made a few added declarations cost out of proportion.

## 11. Step 3b: types and tag bands from demands

Under `RELOC_ARMED`, no section that names a type passes through whole any more. The split
cuts every type site (`typeSitesOf`, `emit_type_order.vl`) into a reference by key, and each
artifact records what it demands:

- **group types** (`LinkArt.tys`): every heap type of the recursion group that its pieces
  name, closed over the definitions those types name, each with its key, its rank in mint
  order and its definition with every type it names cut;
- **band entries** (`LinkArt.bands`): every variant, ref-list slot, map value slot and
  closure signature that one of its tag rows names, with its rank in its band;
- **signatures**: a function's own standalone signature travels on the function
  (`LinkFn.sig`). The runtime artifact carries the runtime's signatures and the tag
  section's entries.

The runtime artifact also takes every group type and band entry that no module names, so
each still holds its index. In the self-build, 39 ref-list and 16 map slots are named by no
tag row, and they still occupy band positions.

`link()` dedupes the demands by key. A key met twice with a different rank or definition
counts as defined twice. The link then:

- places the group in mint-rank order, and when it holds more than 64 types, reorders it by
  reference counts over the linked module (`typeOrderChoose`, the choice `typeOrderRun`
  makes, now shared);
- numbers the standalone signatures after the group: the functions' own in function order,
  then the runtime's;
- builds the variant, ref-list, map and closure bands by rank, and resolves every tag
  against them.

Only the import, memory and data sections pass through.

**What stays whole-program.** The mint rank and the value-atom band's top
(`uAtomBandTop`) are still read from the whole-program build. A probe of first-demand order
showed that the mint order cannot be recovered from the artifacts. Taken in first-demand
order over the self-build, the mint rank falls 69 times among 152 struct types, 12 times
among the 36 of each ref wrapper and 3 times among 8 variants. Step 4 has to settle both facts, for example by keying the rank on
canonical structure.

| build | rows | sections differ | bodies differ | unconsumed rows | exit |
| --- | ---: | ---: | ---: | ---: | ---: |
| self-build | 18,742 | 0 | 0 | 0 | 0 |
| self-build, skewed twin | 18,742 | 0 | 0 | 0 | 0 |
| tests/cases, 4,669 modules | 44,524 | 0 | 0 | 0 | 0 |
| tests/cases, skewed twin | 44,524 | 0 | 0 | 0 | 0 |

The artifacts equal the twin's in every pair: 1 in the self-build and 4,669 in tests/cases.
Nothing is unresolved, defined twice or undecodable.

Three new controls must red, and do (self-build):

- **dropping one group type's demand** (type index 5): 37,767 references
  unresolved, 4 sections and 7,832 bodies differ;
- **reversing the link's type-index assignment**: 4 sections and all 13,312 bodies differ;
- **dropping the demand for one band entry** (rank 1): the code section and 4,217 bodies
  differ, every tag above it one lower.

Disarmed, output is unchanged: difftree `--identity` reads 0 of 10,951 builds differing, and
the candidate compiling master's source equals master's fixpoint.

Cost: seed 6,580,170 → 6,607,976 bytes (+0.42%). L2 guest fuel at #4190:

- the master seed on its own source: 109,478,870,859;
- the master seed on this source: 109,862,407,810 (+0.35%);
- the new seed on this source: 109,863,131,568 (+0.0007%).

The compiler is no slower on a given program, and the cost is its own larger source.
