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

Steps 1 to 5 have landed (§8 to §13). In step 5, `-O` after link, the optimiser already ran
once, after the module was finished, and the step names what `-O` still changes in the
emitter. §14 puts those flags and the map-delete bit into each artifact's key, and leaves
the remaining step 6 work in one list. §15 and §16 move lifted functions and the root's
exports into the artifacts, and §16 measures what the tail and the runtime still hold.

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

The optimiser already works this way (§13). It reads only the emitted module's bytes, in a
fresh compiler instance. The emitter still makes a few choices differently under `-O`, so an
artifact built for an `-O` build is not the artifact a plain build uses. The key in §6
carries that flavour.

## 6. The cache key

An artifact is keyed on:

- the module's own source hash;
- the interface hash of each import, as reached by this module (`ihReachOf`), which already
  covers the readings the check bank serves on;
- the whole-program facts the bodies read (design §5 need 4), each either computed from the
  key or moved to link;
- the compiler's own hash, as the whole-compile cache keys today;
- the emitter flavour: whether the build is `-O`, and `--low-memory-unused` (§13);
- whether the program deletes from a map, which sets every map struct's layout (§14).

The last two, with the flavour, are `LinkFacts` (`link.vl`), written per artifact as
`O<n>.L<bytes>.D<0|1>` (`linkFactsKey`).

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
   - **3b.** (Landed, §11.) The type section and the tag band tables are built at link
     from per-module demands, so that no section passes through whole. This is where step
     4's local numbering starts to be possible.
4. **Per-module emission.** Emit each module's bodies against local numbering, with
   instances as demands (§4), still inside one compile and still linked at once. Gates:
   the fixpoint, plus a **key-coverage test**. One module compiled under two different
   importer sets must give the same artifact whenever its key is equal. This is where
   design §5 need 4, the whole-program facts, is settled fact by fact. (Landed, §12.)
   This step is the exception to byte identity. The canonical type order and the
   literal-type pool change normal builds, and are graded on behaviour instead. Types, tags,
   atoms, runtime helpers and lambdas are keyed per module, and invariance holds on three
   sets. A function's frame mints its scratch slots on first use (§12, "Function frames");
   the facts that stay program-wide are listed there.
5. **`-O` after link.** Move the optimiser behind the link. Gates: identity on `-O` builds,
   the plumb-shape cost gate, and seed-size. (Landed, §13.) The optimiser already ran
   once, over the finished module, in its own compiler instance that reads only bytes, so no
   pass moved. What `-O` still changes is two emitter decisions, the map-set helper and the
   pooled-string fill, plus `--low-memory-unused` addressing. Those stay flavour bits that
   step 6's key carries.
   - **5b. The program facts in the key.** (§14.) Each artifact names the facts it was
     emitted under (`LinkFacts`: the flavour, the low-memory bound, the map-delete bit), and
     the link re-derives them. The map-delete bit is now a per-module fact plus a link-time
     merge. Gates: identity, the fixpoint, and invariance by key.
   - **5c. Lifted functions in their module's artifact.** (§15.) The nested functions and
     lambdas that `collectFns` lifts leave the program tail. Each one sits in its module's
     artifact beside its frame's key, and the link rebuilds the lifting order from those
     keys. Gates: identity, the fixpoint, the link proof and invariance.
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

## 12. Step 4: per-module emission against local numbering

Step 3b left two whole-program facts: the mint rank of each group type and tag-band entry,
and the value-atom band's top. Step 4 replaces both with keys that a module reads from
itself. It also keys the last symbols that still carried a program-wide counter, and it
makes the string pool cover every literal an atom's conversion can print. Every proof
below grades the armed build. The new piece is **invariance**: a module compiled into two
different programs gives byte-identical artifacts.

**Decision: the type order is canonical, (a).** The emitter orders the first recursion
group by a canonical key (`typeOrderCanon`, `emit_type_order.vl`), and the link calls the
same function on the same keys. Option (b) would have sorted only at link, and it has a
problem: linked output must equal direct output, so the direct emitter would need that
order too, and then (b) is (a). So the rank is a sort key computed from keys alone, and
the emitter writes the same order. The cost is that normal builds change their type
order, which is the difftree family below.

A type's key is `"T" + h1 + "." + h2`. It is two independent 32-bit hashes over:

- a seed (`typeSeeds`, `emit_sections.vl`), which is a record's field names, a list's
  element name, a map's key kind and value name, or a closure environment's captures;
- the type's bytes, with every type it names cut;
- the same for each group type it reaches, breadth first in byte order.

Two types with equal keys get `#k` suffixes in mint order. The self-build has none: 266
distinct keys over 225 artifacts. Past 64 types, the reference-count reorder runs over the
key-sorted base, and a supertype still precedes its subtypes. Every group is now ordered,
not only groups past 64 types.

**Tag keys.**

- **Variants.** A variant is keyed by `variantKeyOf` (`emit_reloc_keys.vl`): its signature,
  `|`, and the canonical key of its first row's heap type. The variant band ranks by that
  string, so a variant's tag no longer depends on which variants the rest of the program
  holds. The rank table travels as `LinkProg.bands`.
- **Value atoms.** An atom code is keyed by `atomCodeName` (`emit_map_twins.vl`). A code
  below the map-twin codes is its own number. A map twin's code is `mt:` and the twin's
  type. An atom-leaf list's code is `al:` and its depth. The atom-leaf check runs first,
  because that code moves when a program's byte-array, `v128` or integer-map arms shift the
  codes below it. The link resolves these names against `LinkProg.atomNames`, which
  replaces `atomTop`.

**Function keys.** A shared runtime helper is keyed `rt:` plus its name-section name
(`runtimeFnNames`). Before, it was keyed by its position among the helpers, which depends
on which helpers the program uses. A lifted lambda is keyed `__lambda` plus its own anchor
(`fnLocSuffix`). Before, its synthesized name counted every lambda in the program.

**The string pool.** An atom's conversion to a string builds a synthetic `mkStr` node. That
node read a pooled global when some other module happened to spell the same literal, and
built inline otherwise, so a module's body depended on its neighbours. `collectStrPool` now
also pools the text of every string literal type in the arena. The conversion therefore
always reads the pool. Normal builds gain a pool global per such text.

At link, a text no module spells is the program's. It goes into the runtime artifact's
pool after every module's, so it keeps its index. A module's own pool counts only nodes
that existed when the pool was collected (`poolNodes`). A literal the emitter creates later
belongs to no module.

**Proof.** Armed build, skewed twin `RELOC_SKEW = 1`:

| build | artifacts | functions | rows | sections differ | bodies differ | unconsumed | twin artifacts differ |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| self-build | 225 | 13,329 | 18,745 | 0 | 0 | 0 | 0 of 1 |
| tests/cases, 4,358 programs | 5,111 | 73,980 | 43,399 | 0 | 0 | 0 | 0 of 4,358 |

Nothing is unresolved, defined twice, non-minimal or undecodable. The step-1/2 proof on the
self-build with its twin re-links 1,233,384 decoded sites with 0 modules differing. It
records all 18,701 perturbed body constants and all 44 initialiser constants, and gives 0 of
22,524 cross re-link regions differing. The 1,004 tests/cases programs that build no output
are the corpus's reject cases. The master seed builds none of them either.

**Invariance** (`s5-relocs.vl invariance`) compares every module's artifact across builds
that hold it:

| set | programs | shared modules | what the importers vary | pairs differ |
| --- | ---: | ---: | --- | ---: |
| a | 3 | 2 | which records, unions, closures, maps and literals the importers use, and import order | 0 |
| b | 2 | 1 | a second imported module with a `u8[]` and a `boolean[]`, around an atom-list read and a value-union map | 0 |
| c | 2 | 1 | a `u8[] \| f64[] \| string` union in the importer, which moves the atom-leaf list's code | 0 |

Each set's link also reads 0 modules differing.

**Controls.** Each control breaks one key, and an instrument must red:

| control | what it breaks | red on |
| --- | --- | --- |
| variant by row | a variant keyed by its row number | set a: 2 pairs differ, link 3 modules differ |
| atom by code | an atom keyed by its code | set c: 1 pair differs, link 2 modules differ |
| no link order | the link places the group unsorted | link: 3, 2 and 2 modules differ over sets a, b and c |
| no literal-type pool | literal type texts not pooled | set b: 1 pair differs |
| no atom-list rule | the atom-leaf list named by its raw code | set c: 1 pair differs |

The atom-by-code control is green on sets a and b, which is why set c exists.

**What stayed whole-program after step 4.** Invariance failed on a set of 8 scripts
(`s5-relocs.vl`, `goal-scoreboard.vl`, `seed-size.vl` and five more) while the link was green
there. The cause was the function frame: a body's locals vector reserved scratch slots on
program-wide facts. A two-program witness (`m3` under `r1` and `r2`) showed identical
references, with locals `0x25` against `0x28`. "Function frames" below takes those facts one at a time.
Also still program-level:

- the band rank table (`LinkProg.bands`, now a sort over keys, but carried whole);
- lifted lambdas and instances in `prog.tail` (the lifted ones moved to their artifacts in
  step 5c, §15; twins and instances remain);
- the runtime artifact;
- the literal-type texts no module spells.

**Disarmed, normal builds change**, as decision (a) and the pool require. The fixpoint holds
(6,620,623 bytes). difftree `--identity` against master's seed reads 9,547 of 10,951 builds
differing, 0 uncompared, and every difference is explained:

- 9,522 differ only in the module's bytes and size. Check output, build exit and stderr are
  equal.
- 25 also differ in stderr. Each is a check-clean invalid-wasm cell already filed (D2594,
  D2595, and the rv3310 sets). Its validator message names type indices and offsets, and only
  those numbers moved.
- The candidate compiling master's source differs from master's fixpoint for the same
  reason, 6,615,925 against 6,608,517 bytes.

Behaviour is unchanged. The `cases_wasm` suites pass 5,530 and fail 0. `regress.vl` loses 0
runs and moves 0 cells to silent. Its 21 "other movements" are those same cells, each
`check-clean invalid wasm` before and after.

Cost: seed 6,608,517 → 6,620,623 bytes (+0.18%). L2 guest fuel at #4192:

- the master seed on its own source: 109,035,608,207;
- the master seed on this source: 109,610,291,174 (+0.53%);
- the new seed on this source: 109,735,964,460 (+0.11%).

The compiler pays 0.11% on a given program, for keying and ordering every group rather than
only those past 64 types. The rest is its own larger source.

### Function frames

A scratch slot is now a lazy row (`scratchSlot`, `emit_union_casts.vl`). The function being
emitted mints it on first use and types it in `fbLazyListSlotRun` (`emit_bytes.vl`). So a
body's locals vector holds exactly the slots its own lowering asked for, and a program-wide
fact no longer adds locals to a function that never reads them. Nothing forces a frame on.

| fact | was | now |
| --- | --- | --- |
| `moduleHasUnionAs` | program arena scan | lazy `unionAsBoxSlot` |
| `moduleHasNumCast` | program arena scan | lazy `numCastStashSlot` |
| `moduleHasFcpSpill` | program arena scan | lazy `fcpSpillStashSlot` |
| `moduleHasIntMinMax` | program arena scan | lazy `intMinMaxStashSlot` |
| call-ref frame on `fnValUsed` | a slot in every function, plus the `blockHasCallRef` prediction scans | lazy `callRefNestSlot`; also closes [D3232](inventory/D3232.md), a call the scan missed |
| map value frames on `mvValName.length` | program-wide reservation | lazy `fnMvMapRefLocal`, `fnMvValsBkLocal`, `fnMvValStashLocal`, `fnMvValsOutLocal` |
| i32- and i64-keyed map frames on `mI32Used`, `mI64Used` | a 5-slot frame per map-using function | lazy `mapI32KeyLocal`, `mapI64KeyLocal` |
| `.map`/`.filter` closure slot | reserved with the frame | lazy `mfCallbackLocal` |
| `variantRebox`, `cloEq` | already asked per function (`fnUsesVariantRebox`, `fnUsesCloEq`) | unchanged |
| imports | keyed by program index | keyed by `<module>::<field>` (`emit_link.vl`) |
| a tail function's defs | noted against the last module | noted against the runtime artifact |

Left program-wide, each for a reason:

- **`gMapDeletes`** (`scanPrintUse`). A program that deletes from a map gives every map
  struct two more fields (`seqs`, `next`) and an extra initialiser. A map value crosses
  modules, so its layout is a program ABI and not a body fact. This accounts for
  `std:json`, `lib/corpus.vl` and `lib/census-read.vl` in the residue below. Since §14 it
  is a per-module fact merged at link and carried in every artifact's key.
- **Generic template slots** (`monoPruneTemplates`, `emit_mono.vl`). An uninstantiated
  generic's slot is stubbed to `() -> ()`, or filled by the program's first instance, so
  `std:array`'s `filled`, `sort`, `sorted` and `includes` artifacts depend on the program.
  This is §4's instances-as-demands work, and it lives in `emit_mono.vl`.
- **`envSlotShift` on `fnNestUsed`.** The hidden env parameter is the calling convention of
  every function value, part of a function's signature rather than its frame, and
  `fnNestUsed` is partly set in `emit_mono.vl`. It moves no artifact in this set.

**Invariance** on the 8-script set, armed: master 75 pairs differ, this change **7**. All 7 are the
first two residue rows: `std:json`, `lib/corpus.vl` and `lib/census-read.vl` between scripts
that do and do not delete from a map, and `std:array` between `s5-relocs.vl` and three scripts
that instantiate its generics. The control witness `m3` under `r1` (union `as!`, a numeric
`as!`, a closure, i32 and i64 maps, `min`, `fromCodePoints`) and `r2` (only `m3`) reads 1 pair
differ on master and 0 here, and both programs print the same output on both seeds.

**Behaviour**, disarmed. The fixpoint holds. `cases_wasm_0..3` pass 6,024 and fail 0.
`regress.vl` loses 0 runs and moves 0 floors to silent. Its 2 `-> silent` report rows
(`d2915_list_5_earlyR_bound`, `d2915_list_5_twoNames_bound`) are check-clean invalid wasm on
the master seed too, with the same validator message. difftree `--identity` against master's
seed reads 5,303 of 16,435 files differing, 0 uncompared:

- 5,291 differ only in the module's bytes and size. Check output, build exit and stderr are
  equal.
- 12 also differ in stderr. Each is a filed `rv3310_nested_fn` invalid-wasm cell whose
  validator message names a byte offset, and only the offset moved.

Cost: seed 5,916,276 → 5,676,451 bytes (−4.05%). Most of it is the deleted prediction scans
and reservations. L2 guest fuel:

- the master seed on its own source: 89,741,422,205;
- the master seed on this source: 89,547,985,463 (−0.22%);
- the new seed on this source: 88,775,239,636 (−0.86% with the source held fixed).

## 13. Step 5: `-O` after link

**The optimiser already ran after the module.** The host emits the whole module first. Then
`opt_pipeline` (`scripts/vl-host/src/main.rs`) loads a fresh compiler instance, stages the
bytes, and drives `optPipeStart` to its end. It does this once per build, only when a `-O`
or `-O3` rung is set, and `-O3` wins when both are given. A plain build never enters the
chain. The chain's import closure is the `opt_*` modules, `wasm_read`, `wasm_write`,
`wasm_names` and `listutil`, and only `entry.vl` re-exports it to the host. So the optimiser
reads no emitter state, and an artifact cannot have been through an optimiser pass. No pass
had to move.

**The linked module is the module `-O` reads.** Under the `-O` flavour, an armed compile
re-linked through `emitLinkSection` equals the direct output:

| set | artifacts | functions | value rows | differ |
| --- | --- | --- | --- | --- |
| self-build | 226 | 14,226 | 20,365 | 0 |
| `tests/cases`, 5,086 modules | 6,099 | 84,642 | 56,250 | 0 |

**What `-O` still changes in the emitter.** Before emission the host calls `setOptimized(1)`
and, with `--low-memory-unused`, `setLowMemoryUnused`. Five functions read the two flags:

| reader | flag | plain | `-O` |
| --- | --- | --- | --- |
| `assignSharedHelperIndices` (`emit_sections.vl`) | `gOptimized` | a map set calls `__map_set_<row>__` | the store is inline, where binaryen can scalarise the map |
| `strFillPlan` (`emit_sections.vl`) | `gOptimized` | long pooled strings fill from a passive segment | each is built inline |
| `emitMemAddr`, `emitLowMemAccessorCall`, `emitCallCoreUserFn` (`wasmEmit.vl`) | `gLowMemUnused` | the address is computed | its constant folds into the memarg |

Over the 4,315 single-file cases, the `-O` flavour changes 782 modules: 694 by the map-set
helper alone, 26 by the pooled-string fill as well, and 62 only in the type section, where
the map-set functype is reserved. Over the 5,086 armed case builds, 894 have at least one
artifact that differs between the plain and `-O` flavours, 1,444 of 6,099 artifacts in all.

These choices stay in the emitter. Moving them behind the link would change `-O` output,
which this step must keep byte for byte. So the flavour joins the artifact key (§6). The
whole-compile cache already keys both flags.

**The test.** `tests/vl_opt_after_link_test.ts` holds three claims:

- the optimiser's import closure is bytes only, and `entry.vl` is its only importer;
- the flavour readers are exactly the five above, so a new one fails until it is named here
  or moved behind the link;
- the host runs the chain 0 times for a plain build and once for `-O`, `-O3` and `-O -O3`,
  counted by the multi-value step's header under `$VL_MV_EXPLAIN`.

Two controls fail the first half: an `opt_scan.vl` import of `emit_state`, and an
`emit_link.vl` import of `opt_scan`.

**Gates.** No compiler source changed. The seed is byte-identical to master's, two
refreshes in a row give the same bytes, and so plain and `-O` builds are unchanged. Seed
5,676,488 bytes against the 5,914,725 baseline. The plumb-shape cost gate passes: main fuel
−3.1%, tail fuel −3.2%, RSS −2.2% against its baseline. L2 fuel moves 0.

**What step 6 needs.** §14 keys artifacts on the flavour and settles `gMapDeletes`. The
rest of the list is there.

## 14. The program facts in the key

**`gMapDeletes` is a per-module fact.** `scanPrintUse` used to set the global the moment
it met a `.delete` call. Now it notes the call site (`mapDeleteNote`, `emit_state.vl`) and
sets the global once, after the scan (`mapDeleteMerge`). Nothing reads the global during the
scan, so the order change is byte-identical. `emitLinkSection` attributes each noted site to
its module's artifact (`LinkArt.deletes`). The link takes the OR over every artifact and the
runtime (`linkFacts`, `link.vl`), so the bit the map layout reads is something the link can
recompute from the artifacts alone.

**The key carries the facts.** `LinkFacts` holds `optimized`, `lowMem` and `mapDeletes`.
Each artifact records the facts its bodies were emitted under, and `vl.link` (version 2)
writes them as `O<n>.L<bytes>.D<0|1>`: once for the program, then per artifact. The link
counts artifacts whose facts differ from the facts it re-derived (`LinkOut.factMiss`). A
cache that hands the link an artifact built under other facts is then a loud count, not a
wrong layout. `linkArtHash` folds `deletes`, and `linkProgHash` folds both flavour fields.
`elFacts` (`emit_link.vl`) is the only reader of the three globals in the link section.

**Every artifact carries the program's delete bit, not only those that touch a map.** This
over-keys on purpose: a module with no map value reads no map layout, but proving that per
module is a new body census. Refining the bit to the modules that touch a map is left to
step 6, which can measure the hit rate it costs.

**The test.** `tests/vl_opt_after_link_test.ts` gains two claims:

- `emit_link`'s readers of `gOptimized`, `gLowMemUnused` and `gMapDeletes` are exactly
  `elFacts`, so a new program fact needs a field in `LinkFacts`;
- `gMapDeletes` has two writers only, `mapDeleteMerge` and `mapDeleteReset`.

**Invariance**, by key, on the armed 8-script set. `s5-relocs.vl invariance` now groups
artifacts by path and facts key:

| | pairs that differ within a key | builds keyed apart | of them equal |
| --- | --- | --- | --- |
| master (path only) | 5 | — | — |
| this change | 2 | 21 | 18 |

The 3 pairs that moved are `std:json` twice and `std:array` once, each between a script that
deletes from a map and one that does not. Those pairs are now keyed apart. The 18 equal pairs
that are keyed apart are the over-keying's cost on this set. The 2 pairs left are `std:array`
generic slots (§12). Two plain builds plus their `-O` twins read 0 pairs differing and 21
keyed apart, 0 of them equal. So every artifact the flavour splits really does differ.

The link proof on all 8 builds reads 0 modules differing and 0 artifacts under other facts.

**Gates.** The seed is 5,678,918 bytes (master 5,677,060, +0.03%, from the larger source).
The fixpoint holds. difftree `--identity` against master reads 0 of 16,437 files differing,
0 uncompared, and the candidate compiling master's source equals master's fixpoint. The plumb-shape
cost gate passes: main fuel −3.1%, tail fuel −3.2%, RSS −2.2%. L2 guest fuel:

- the master seed on its own source: 88,377,079,896;
- the master seed on this source: 88,818,734,366 (+0.50%);
- the new seed on this source: 88,818,734,416 (+50 instructions).

**What step 6 still needs.**

- **Refining the delete bit** to the artifacts whose bodies touch a map layout, if the
  measured hit rate asks for it.
- **The generic template slots and instance demands** (`monoPruneTemplates`, §4, §12).
  These are the 2 pairs left, and they live in `emit_mono.vl`.
- **The rest of the program tail, the runtime artifact and the band tables.** The lifted
  functions left the tail in step 5c (§15). What is still program-level, and why it did not
  move under byte identity, is in §15's last part. Step 6 has to key or rebuild each of those
  per link.
- **The host store**: artifacts and instances under §6's keys, with
  `VL_COMPILE_CACHE_VERIFY=1` comparing a cached link against a cold build.

## 15. Step 5c: lifted functions in their module's artifact

Before this step, every function at or past `topFnNodes.length` went to `LinkProg.tail`, and
the tail's shared globals and type demands were noted against the runtime artifact. Those
functions are of four kinds. Classified by key shape over the 4,889 armed tests/cases builds
at #4484, 2,054 builds carry a tail:

- 3,502 lambdas;
- 2,265 nested named functions;
- 3,393 twins from the rewrite passes (`$voidtw`, `$extv`, `$eqc`);
- 310 generic instances.

The first two kinds are what `collectFns` lifts. They are a module's own source, so they now
move into its artifact.

**The artifact.** `LinkArt.lifted` holds a module's lifted functions in lifting order. Beside
each one, `LinkArt.liftedIn` holds its frame's function key. A function with no frame gets a
mark instead: `LIFT_INIT` for one in a top-level binding's initialiser, `LIFT_START` for one
in a top-level statement. Each lifted function's shared globals and type demands are noted
against its artifact, and `linkArtHash` folds both lists. `vl.link`'s per-artifact count
includes them.

**The order is rebuilt at link.** Plain rules do not reproduce the emitted order. Sorting
the whole tail by artifact fails on 23 builds. Putting each artifact's lifted functions in a
row, ahead of the instances, fails on 14. The reason is that `collectFns` lifts breadth-first
over the whole program. It visits every top-level function, then every lifted one, appending
each frame's children as it goes. When that runs dry, it appends every initialiser's lambdas,
then every statement's, and the walk resumes. `lkLifted` (`link.vl`) replays that walk from
the artifacts alone:

- the queue starts as every artifact's top-level functions, in load order;
- each function the queue reaches appends its children, in their module's order;
- once the queue is exhausted, the `LIFT_INIT` and then the `LIFT_START` functions of every
  artifact, in load order, are appended, and the walk resumes.

The lifted functions go after every artifact's top-level functions. The remaining tail
(twins and instances) follows them.

**Noted when lifting ends.** Later passes rewrite `fnParent`, and `emit_rewrite` repoints
`startStmts` at new arena nodes. So the split does not read either of them at emit time.
`linkLiftNote` (`emit_link.vl`) runs when the `collectFns` pass returns, in the pass
dispatcher. It records where lifting ended, each slot's frame, and which frameless lambdas
sit under a binding's initialiser. It does that last part by walking each initialiser down
to its first functions. `emit_collect.vl` is untouched. The hook does nothing when the build
is disarmed.

**Proof.** The armed builds are at #4486.

| set | builds | artifacts | functions | body references | sections differ | bodies differ | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 scripts, master | 8 | 92 | 2,151 | 77,281 | 0 | 0 | 0 |
| 8 scripts, this change | 8 | 92 | 2,151 | 77,281 | 0 | 0 | 0 |
| tests/cases, master | 4,890 | 5,851 | 84,941 | 900,852 | 0 | 0 | 0 |
| tests/cases, this change | 4,890 | 5,851 | 84,941 | 900,852 | 0 | 0 | 0 |

In every row, nothing is defined twice and no row is left unconsumed. Invariance gives the
same result on master and on this change:

- **The 8 scripts:** 22 keys held by two or more builds, and 0 pairs differ. 56 builds are
  keyed apart, and 49 of those are equal.
- **tests/cases:** 33 keys held, and 4,662 pairs differ. All 4,662 pairs fall under the empty
  path. That path is the main module of every single-file program, so those are different
  programs, not one module in two importers.

**The witness and the control.** `tests/cases/modules/lifted-order-across-modules/` holds
three modules. Lifting reaches `b`'s lambda before `a`'s inner one. In that case, a link
that lays each artifact's lifted functions out in a row misplaces them.

- **The control** replaces `lkLifted`'s result with that row. It is green over all 4,890
  tests/cases builds, because no other case separates the two orders. On the witness it reds
  with 4 sections and 6 bodies differing.
- **This change** reads 0 differing on the witness.
- **A second importer** (`entry2`) uses `a` and `b` in another order, beside other lambdas. It
  gives invariance 0 pairs differ over the two shared modules, lifted functions included.

**Gates.**

- **Identity:** difftree `--identity` reads 0 of 16,439 files differing, 0 uncompared. The
  candidate compiling master's source equals master's fixpoint.
- **Seed:** the fixpoint holds, at 5,688,822 bytes (master 5,683,995, +0.08%).
- **plumb-shape cost:** passes, with main fuel −3.0%, tail fuel −3.2% and RSS −2.1% against
  its baseline.
- **L2 guest fuel:**
  - the master fixpoint on its own source: 89,115,704,774;
  - the master fixpoint on this source: 89,105,505,871 (−0.01%);
  - the new seed on this source: 89,105,505,951 (+80 instructions).

**What stays program-level, and why it did not move here.**

- **Twins and instances** stay in `prog.tail`. Instances are the generic-demand work (§4),
  in `emit_mono.vl`. The rewrite passes mint twins in pass order over the whole program, so
  their placement is a replay of each pass, not of one walk.
- **The band rank table** (`LinkProg.bands`). Ref-list, map and closure tags rank by the
  order the emitter minted them in `rlElemName`, `mvValName`/`mvKeyKind` and
  `cloSigTagNames`. A variant sorts by `variantTagKey`, which carries a rep row index. Each
  of those is a program-wide count. A rank computed from keys alone would change every body
  that tests a tag, so it cannot land under byte identity. It belongs with step 6's
  switch-over, which is graded on behaviour, as step 4's canonical type order was.
- **The runtime artifact.** The runtime helpers are emitted per program, and so are the
  group types and band keys that no artifact names. All exports also sit there: each is a
  program output, keyed by the function it names. The literal-type texts no module spells sit
  there too. Step 6 either keys the runtime by the helper set it holds or rebuilds it at
  every link.

## 16. Step 6, first part: the root's exports in its artifact

**What the tail and the runtime hold.** A scratch build listed `LinkProg.tail` and the
runtime artifact by key in each of the 4,899 armed tests/cases builds at #4487. §15's
"3,393 twins" counted every key with a `$` in it, and most of those are generic instances.

| item | entries | builds |
| --- | ---: | ---: |
| tail: generic instances (`name$n`) | 2,793 | — |
| tail: lambdas cloned into an instance (`#n`) | 672 | — |
| tail: other mono output (an instance's lambdas, `$cb` callback clones) | 256 | — |
| tail, those three together | 3,721 | 1,072 |
| tail: `$voidtw` twins | 3 | 2 |
| tail: `$extv` twins | 3 | 3 |
| tail: `$eqc` cores | 7 | 3 |
| runtime: helper functions (`rt:` or `rt#n`) | 32,697 | at least 4,885 |
| runtime: group types | 45,177 | 4,480 |
| runtime: band keys | 2,956 | 1,218 |
| runtime: literal-type texts no module spells | 442 | 290 |
| runtime: exports | 228 | 195 |

So 99.7% of the tail is `emit_mono.vl` output, which is the generic-demand work and out of
this step. The twins are 13 functions in 8 builds.

**The exports move.** Only the root module's declarations reach the wasm ABI
(`modAliasRootExports`, `modResolveRootReExports`). So the export section is the root's, and
its entries now sit in the root's artifact, except the memory export, which stays in the
runtime because `memUsed` is a program fact.

- `LinkArt.exports` on the root holds the function exports, in section order. A re-exported
  function keeps the key of the module that declares it.
- After those come the global exports. They are taken from `exportGlobalRows`, which the
  export section reads too. That list still holds a row named `memory` that the section
  drops when the program exports its memory, so the root's artifact does not change with
  whether the program uses memory.
- `lkExports` writes each artifact's exports in order, then the runtime's. It skips a global
  export whose name the runtime exports, which is the rule the emitter applies.

A module is root in one program and a dependency in another only if both programs build it.
None of the sets here does that. Such a module's artifact differs between the two, since a
dependency's exports reach no ABI.

**Proof.** The armed builds are at #4487. The tests/cases rows include the witness's two
builds.

| set | builds | artifacts | functions | body references | sections differ | bodies differ | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 scripts, master | 8 | 99 | 2,320 | 88,931 | 0 | 0 | 0 |
| 8 scripts, this change | 8 | 99 | 2,320 | 88,931 | 0 | 0 | 0 |
| tests/cases, master | 4,901 | 5,869 | 85,029 | 900,994 | 0 | 0 | 0 |
| tests/cases, this change | 4,901 | 5,869 | 85,029 | 900,994 | 0 | 0 | 0 |

The 8 scripts are s5-relocs, goal-scoreboard, seed-size, check-filed-witnesses,
emit-refusal-sites, sentinel-census, plumb-shape-cost and capability-matrix. §15's set was a
different eight, so its counts are not these. In every row nothing is defined twice and no
row is left unconsumed.

Invariance gives the same result on master and on this change:

- **The 8 scripts:** 23 keys held, 1 pair differs (`std:array` between capability-matrix and
  s5-relocs), 23 keyed apart and 18 of those equal.
- **tests/cases (4,899 builds):** 20 keys held, and 4,565 pairs differ, all under the empty
  path of a single-file program's main module.

**The witness and the control.** `tests/cases/modules/root-exports-memory-name/` has two
roots that share one dependency.

- `entry.vl` uses linear memory. It re-exports the dependency's `twice` and exports a
  function and two bindings, one of them named `memory`.
- `entry2.vl` uses no memory, so its `memory` binding is published as a wasm global.

The control publishes every artifact's exports with no skip. It reds on 2 of the 4,901
tests/cases builds, `entry.vl` and `extern/global-export-named-memory.vl`, each with section
7 differing. This change reads 0 differing on both. Invariance over the two roots: 1 key
held (`lib.vl`), 0 pairs differ.

**Gates.**

- **Identity:** difftree `--identity` reads 16,444 files, 11,435 built, 0 differ and 0
  uncompared: the candidate compiling master's source equals master's fixpoint.
- **Seed:** the fixpoint holds, at 5,691,699 bytes (master 5,689,403, +0.04%), rebased onto
  #4489.
- **plumb-shape cost:** passes, with main fuel −3.0%, tail fuel −3.2% and RSS −2.0% against
  its baseline.
- **L2 guest fuel**, one run each on this source: the master seed 88,990,940,067 and the new
  seed 88,990,938,309 (−1,758 instructions).

**What is left of step 6.**

- **The twins.** `$voidtw` follows the checker's seam order, `$extv` is minted at the first
  read of an extern over all top-level code and then every function body, and `$eqc` is a
  program fact (one core per cyclic record, minted only if some comparison anywhere has a
  recursive operand). Each needs a per-module copy deduplicated at link and a replay of its
  pass, and together they are 13 functions in 8 builds.
- **The runtime's group types**: 45,177 entries in 4,480 builds. These are the types the
  runtime helpers, the tail and the import, memory and data sections name, and
  every type no artifact names, which keeps its index. That split has not been measured.
- **The literal-type texts no module spells.** A text in a literal type is owned by a type,
  and the arena does not record which module a type came from.
- **The band rank table**, as §15 says: it is graded on behaviour at the switch-over.
- **The runtime helpers** are one set per program. The runtime is keyed by that set or
  rebuilt at every link.

## 17. Step 6, second part: the runtime helpers' keys

**The set stays program-level.** A scratch build listed every runtime function and its
callers in the 4,893 armed tests/cases builds at #4492: 32,733 functions.

| caller | functions |
| --- | ---: |
| none | 16,468 |
| the start function (`rt#0`) | 4,890 |
| at least one artifact | 4,207 |
| only other runtime functions | 7,121 |
| only the tail | 47 |

The 16,468 that nothing calls are the shared helpers a flag turns on, for example
`__utf8_cplen__` (3,464), `__utf8_enc__` (3,462), `__str_concat__` (3,151), `__str_hash__`
(3,059) and `__str_eq__` (2,578). A flag is set by a program fact, so the set cannot be rebuilt
from what the artifacts call. Link keeps it as one runtime per program.

**What moved: the keys.** An artifact names a runtime helper by key, and three helper families
carry a program-wide row number in their name: `__map_set_<row>__` and
`__map_compact_<row>__` number a map by the order the program's map value types were met, and
`__eq_<si>__` numbers a wide record compare by the order its heap types were minted. A module
shared by two programs could therefore name `__map_set_3__` in one and `__map_set_4__` in the
other for the same map. `elRtRowKeys` now keys each by what its row serves:

- a map row by its key kind and value type, the band table's key (`__map_set__@str`,
  `__map_set__@i32`, `__map_set__@<kind>:<value>`, `__map_set__@i64`);
- an eq row by its record's canonical type key (`typeOrderMintedKey`, since `sHeapIdx` holds
  minted indices). Two rows over one heap type keep their numbers.

The emitted module does not change: keys live in the `vl.link` section only.

**Proof.** The armed builds are at #4492. The tests/cases rows include the witness's two
builds.

| set | builds | artifacts | functions | body references | sections differ | bodies differ | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 scripts, master | 8 | 99 | 2,320 | 88,931 | 0 | 0 | 0 |
| 8 scripts, this change | 8 | 99 | 2,320 | 88,931 | 0 | 0 | 0 |
| tests/cases, master | 4,906 | 5,877 | 85,113 | 901,353 | 0 | 0 | 0 |
| tests/cases, this change | 4,906 | 5,877 | 85,113 | 901,353 | 0 | 0 | 0 |

The 8 scripts are §16's. In every row nothing is defined twice and no row is left unconsumed.

Invariance:

- **The 8 scripts:** the same as master and §16, 23 keys held and 1 pair differs
  (`std:array`, from its generic bodies).
- **tests/cases:** 4,681 pairs differ against master's 4,682. The one that left is
  `modules/runtime-helper-keys/store.vl`. The rest are the empty path of a single-file
  program's main module, or same-named files in unrelated directories.
- **Runtime references only**, over the 93 functions with a non-empty path that two or more
  builds hold: master names a different helper sequence in 10 of them, this change in 8. The
  8 call a different helper SET per program. For example `std:fmt`'s `bnBitLen` calls
  `__as_fail__` in 290 builds and `__sv_get_0__` in 2, and `std:json`'s `renderInto` calls
  `__map_resync__` in 2 of 19. Those are body differences, which a key cannot remove. The
  8 are `lib/census-read.vl`'s `grading` and `manifestCoords`, `lib/corpus.vl`'s `audit`,
  `dumpCells`, `prune` and `sourceNames`, `std:fmt`'s `bnBitLen`, and `std:json`'s
  `renderInto`.

**The witness and the control.** `tests/cases/modules/runtime-helper-keys/` has two roots
that share `store.vl`, which sets a map of records and compares two records wide enough
(more than 32 leaf fields) for an `__eq_<si>__` helper. `entry2.vl` loads `other.vl` first,
which has a map and a wide compare of its own, so every one of `store.vl`'s row numbers moves.
The control keeps the numbered names (`rows[nm]` replaced by `nm`). Both link with 0
differing. Invariance over the two roots: this change reads 0 pairs differing, and the
control reads 1 (`store.vl`).

**Gates.**

- **Identity:** difftree `--identity` reads 16,445 files, 11,436 built, 0 differ and 0
  uncompared.
- **Seed:** the fixpoint holds, at 5,693,390 bytes (master 5,691,815, +0.03%).
- **plumb-shape cost:** passes, with main fuel −3.0%, tail fuel −3.2% and RSS −2.0% against
  its baseline.
- **L2 guest fuel**, one run each on this source: the master seed 89,000,105,652 and the new
  seed 89,000,105,782 (+130 instructions).

**What is left of step 6.**

- **The runtime's order.** Link still takes the runtime functions in the program's order.
  Rebuilding that order from the artifacts is tied to the runtime's positional signatures
  (`LinkProg.runtime.sigs` and the `F:rt#n` type keys), so it moves with the group types.
- **The 8 functions above**, whose helper set depends on the program.
- §16's twins, group types, literal-type texts and band rank table are unchanged.

## 18. Step 7, first part: the runtime signatures keyed by owner

**What a runtime signature is referenced by.** The type section holds the group types, then
the n user signatures (`F:<fnKey>`), then the runtime's signatures, which were keyed by
position (`F:rt#k`). A scratch probe over the 5,101 armed tests/cases builds at #4494 listed,
for each of the 47,543 runtime signatures, the first byte that names its index.

| referenced by | signatures |
| --- | ---: |
| a runtime function's type | 33,354 |
| a function import | 13,273 |
| nothing | 916 |

No module artifact references a runtime signature. The 916 are the map store types
`(ref, ref, i32) -> ()` a map row reserves whether or not a store is called. Content does not
key them: 9,079 signatures repeat another's definition in the same build.

**What moved: the keys.** `elRtSigOwners` keys each runtime signature by the function that
owns it: a function import by its import key, a runtime function by its function key, and a
reserved map store or record compare type by the row key §17 gave its helper
(`rt:__map_set__@<kind>:<value>`, `rt:__eq__@<type>`). A signature with no owner, or a second
one with the same owner, keeps its position as `F:sig#<k>`. `LinkArt.sigs` holds key and
definition (`LinkTy`), so link places a signature by its key. `vl.link` is version 3 and
records each runtime function's key and digest, which `s5-relocs.vl invariance` compares
across builds as its `== runtime` line. The emitted module does not change.

On the change, over 5,104 builds:

| owner | signatures |
| --- | ---: |
| a named runtime function (`F:rt:...`), with the reserved rows | 29,376 |
| a function import (`F:i:f:...`) | 13,278 |
| an unnamed runtime function (`F:rt#k`, the start function) | 4,914 |
| none, keyed by position (`F:sig#k`) | 0 |

No runtime function's type names a signature another owner holds.

**Proof.** The armed builds are at #4494. The tests/cases rows include the witness's builds.

| set | builds | artifacts | functions | body references | sections differ | bodies differ | unresolved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 8 scripts, master | 8 | 99 | 2,323 | 89,478 | 0 | 0 | 0 |
| 8 scripts, this change | 8 | 99 | 2,323 | 89,478 | 0 | 0 | 0 |
| tests/cases, master | 5,101 | 6,122 | 86,763 | 921,318 | 0 | 0 | 0 |
| tests/cases, this change | 5,104 | 6,127 | 86,789 | 921,366 | 0 | 0 | 0 |

In every row nothing is defined twice and no row is left unconsumed.

Invariance:

- **The 8 scripts:** 23 keys held and 1 pair differs (`std:array`), as on master.
- **tests/cases:** 4,905 pairs differ against master's 4,902. The 3 added are the witness's
  files; the key the witness adds (`text.vl`) is held equal.
- **Runtime functions** held by two or more builds: 190. Their bodies differ in 5,187 pairs on
  this change, against 27,946 when every signature keeps its position. Of the 5,187, 4,912 are
  the start function (`rt#0`), whose body is the program. The rest are helpers whose body
  depends on a program fact: `__as_fail__` (28), `__init_fail__` (21), the `__rv_*__` views
  (15 each) and the map stores (`__map_set__@0:Circle` 17). On the 8 scripts: 37 held, 7
  pairs differ (`rt#0` 6, `__as_fail__` 1).

**The witness and the control.** `tests/cases/modules/runtime-sig-keys/` has two roots that
share `text.vl`, which concatenates strings. `entry2.vl` prints a float first, so the float
print import moves every runtime signature after it. The control keys every signature by
position (`if true` in `elTyKeys`). Both link with 0 differing. Over the two roots, this
change reads 7 runtime functions shared and 1 pair differing (`rt#0`); the control reads 7
differing (`rt#0`, `__str_hash__`, `__str_eq__`, `__str_concat__`, `__utf8_dec__`,
`__utf8_enc__`, `__utf8_cplen__`).

**Gates.**

- **Identity:** difftree `--identity` reads 16,446 files, 11,437 built, 0 differ and 0
  uncompared.
- **Seed:** the fixpoint holds, at 5,695,645 bytes (master 5,693,406, +0.04%).
- **plumb-shape cost:** passes.
- **L2 guest fuel**, one run each on this source: the master seed 89,025,117,854 and the new
  seed 89,025,117,833 (−21 instructions).

**Why link cannot rebuild the runtime's order yet.** The runtime artifact carries its
signatures and functions as ordered lists, and two orders in them are not a function of
the keys:

- the map store types are reserved in row order, and the used and unused ones interleave,
  while map store functions are numbered in call order;
- the start function's signature comes first, and its body is the program.

So the order stays the runtime artifact's list order. That artifact is program-level, and no
module artifact references a runtime signature, so the keys above are enough for a module
artifact to stay the same across programs.

**The group types.** Over 4,580 builds, 45,590 group types are in the runtime's share. By the
first byte that names one:

| first named by | group types |
| --- | ---: |
| a module artifact, and also the runtime | 28,049 |
| nothing | 12,324 |
| a runtime function | 4,344 |
| the tail | 735 |
| a runtime signature | 138 |

The 12,324 that nothing names are rows a program fact reserves: closure signatures (9,042),
closure environments (937), union and value boxes (477, 382), records (326), i32 lists (293),
variants (256), and fewer of each other kind. Struct rows are deduplicated across the program,
so they belong to no single module.

**What is left of step 7.**

- **The unnamed reservations.** The 12,324 group types and the 916 map store types that no
  byte names hold indices. Dropping them changes the emitted module.
- **The start function** keeps `rt#0`; its body is the program.
- **The runtime's order**, rebuilt from the artifacts, which needs the two orders above keyed.
- **Runtime helpers whose body follows the program**, the 275 non-start pairs above, and §17's 8
  functions whose helper set depends on the program. §19 keys the map stores, the largest share
  of the 275.

## 19. Step 7, second part: the map stores keyed by their type

**Why a map store's body differed under one key.** §17 keyed `__map_set_<r>__` and
`__map_compact_<r>__` by the row's key kind and value spelling (`@0:Circle`). A spelling is not
a type across programs. `Circle` is a union arm in one program and a record in another, and
`{r: i32}` is its own row in one program and shares a merged row with `{r: string}` in another,
because a `??` join gives the two literals one heap type. The store's body sets the map struct
the row's value lives in, so one key held up to six bodies. Over the armed tests/cases builds
at #4498, 61 map store keys held by two or more builds differed in 173 pairs, and one compact
key in 1.

**What moved: the key.** `elRtRowKeys` appends the canonical key of the row's map struct
(`mvMapTypeIdx`, read through `typeOrderMintedKey`), so the row key is
`__map_set__@<kind>:<value>=<type key>`. Layout twins share one map struct, so they share the
type key and stay apart by spelling. The band table keeps its spelling key. The emitted
module does not change.

**Measured.** Over 5,108 armed tests/cases builds at #4498, with this step's witness:

| | master | this change |
| --- | ---: | ---: |
| runtime functions held by two or more | 190 | 172 |
| runtime pairs that differ | 5,192 | 5,018 |
| of them, map stores | 174 | 0 |
| map store helpers | 1,594 | 1,594 |
| distinct map store keys | 419 | 552 |
| of them held by two or more builds | 140 | 119 |

The 18 functions that leave the "held by two or more" count are spelling keys that split into
keys held by one build. Module invariance does not move: 57 keys held and 4,908 pairs differ in
both. The link proof over the same builds reads 6,139 artifacts, 87,015 functions and 926,502
body references, with 0 sections, 0 bodies and 0 unresolved differing.

The 5,018 left:

| helper | pairs | why |
| --- | ---: | --- |
| `rt#0` | 4,915 | the start function; its body is the program |
| `__as_fail__` | 28 | its domain table is the program's intern order |
| `__init_fail__` | 21 | it names the program's globals |
| `__rv_sync__`, `__rv_get__`, `__rv_len__` | 15 each | they dispatch over every view row |
| `__map_probe__`, `__map_probe_i32__` | 4, 2 | a library-only build has no print import, so the trap reason is left out |
| `__sv_sync_1__`, `__sv_get_1__`, `__sv_len_1__` | 1 each | a view row number |

**The witness and the control.** `tests/cases/modules/map-store-type-keys/` has two roots that
share `label.vl`. `entry.vl` stores `{r: 7}`; `entry2.vl` stores the same spelling and joins it
with `{r: "s"}` by `??`, so its `{r: i32}` row is the merged box row. The control is master's
key, which is this change without the type suffix. Over the three builds, the control reads 14
runtime functions shared and 2 pairs differing (`rt#0`, `__map_set__@0:{r:i32}`); this change
reads 13 shared and 1 differing (`rt#0`).

**Gates.**

- **Identity:** difftree `--identity` reads 16,448 files, 11,439 built, 0 differ and 0
  uncompared.
- **Seed:** the fixpoint holds, at 5,698,170 bytes (master 5,697,863, +0.005%).
- **L2 guest fuel**, one run each on this source: the master seed and the new seed both read
  89,043,470,487. The key is built only under `RELOC_ARMED`.

**What is left of step 7.** As §18 lists, without the map stores:

- the unnamed reservations (12,324 group types, 916 map store types);
- the start function and the runtime's order;
- `__as_fail__`, `__init_fail__`, the view helpers and the two map probes above, and §17's 8
  functions whose helper set depends on the program. `__as_fail__` can take a fixed domain
  table (the fallible domains are a closed set), which changes the emitted module.

## 20. Step 7, third part: `__as_fail__`'s domain rows are a fixed table

**Why `__as_fail__` differed, and why a key cannot fix it.** A failing `as!` calls
`__as_fail__(line, colRow)`, and `colRow & 7` is the row of the cast's target domain. The rows
were numbered in the order the program met the domains, so the helper's body branched over a
program-dependent table. The row also sits as an `i32.const` in the CALLER's body. A module
that casts to `u8` passed row 0 in one program and row 1 in another that met `i32` first, so
the user module's artifact differed too, not only the runtime helper.

**What moved: the table.** `AS_FAIL_DOMS` is a constant, the five numeric domains a cast can
fail into, `i32`, `i64`, `u8`, `f32`, `f64`, in that order. `emitNumCastTrapMsg` looks a
domain up and no longer appends; a domain outside the table is an `emitFail`. This changes
the emitted module: every module that uses `as!` (including through `std:fmt`) carries all
five branches, about 90 bytes more.

**Measured.** Over 4,751 armed tests/cases builds at #4500 (the `@run` files plus every
`modules/**/entry*.vl`; §19's 5,108 was a different population), with this step's witness:

| | master | this change |
| --- | ---: | ---: |
| module keys held by two or more | 37 | 37 |
| module pairs that differ | 4,545 | 4,544 |
| runtime functions held by two or more | 166 | 166 |
| runtime pairs that differ | 4,826 | 4,801 |
| of them, `__as_fail__` | 25 | 0 |

The module pair that leaves is the witness's shared `byte.vl`. The runtime pairs left are
`rt#0` 4,748, `__rv_sync__`/`__rv_get__`/`__rv_len__` 15 each, `__init_fail__` 5, and
`__sv_sync_1__`/`__sv_get_1__`/`__sv_len_1__` 1 each. The two map probes do not occur in this
population.

**The witness and the control.** `tests/cases/modules/as-fail-domain-rows/` has two roots
that share `byte.vl`, whose `as! u8` passes its row to `__as_fail__`. `entry.vl` meets `u8`
first; `entry2.vl` loads `other.vl`'s `as! i32` ahead of it. The control is master, which
numbers rows in meeting order: 1 module pair differs (`byte.vl`) and 2 runtime pairs differ
(`rt#0`, `__as_fail__`). This change reads 0 module pairs and 1 runtime pair (`rt#0`).

**Gates.**

- **Identity:** difftree `--identity` reads 16,450 files, 11,441 built, 670 differ and 0
  uncompared. All 670 differ only in module bytes, and each was run under both seeds with
  the same stdout and exit code.
- **regress.vl:** 0 runs → not-runs, 0 → silent, no cell changed class.
- **Seed:** the fixpoint holds, at 5,698,219 bytes (master 5,698,204, +15).
- **L2 guest fuel**, one run each on this source: 88,978,287,615 on the master seed and
  88,978,287,602 on the new one (−13).

**Why the other program-dependent helpers stay.** Their bodies are program data, not an
order:

- `__init_fail__` prints the names of the program's globals.
- `__rv_*__` and `__sv_*_1__` dispatch over the program's view rows and view types.
- `__map_probe__` and `__map_probe_i32__` leave the trap reason out when the build has no
  print import (`emitMapProbeTrapReason`). That is a whole-program fact like `gMapDeletes`,
  so it could become a link fact; no build in this population shows it.

**What is left of step 7.** The unnamed reservations, the start function and the runtime's
order (§18), the helpers just listed, and §17's 8 functions whose helper set depends on the
program. §21 moves the start function's body into the modules.

## 21. Step 7, fourth part: each module's initialisation is its own function

**Why `rt#0` differed.** The start function ran every top-level global initialiser and
statement of the program, so its body was the program: two programs that share a module
still held that module's initialisation in two different `rt#0` bodies.

**What moved: the top level.** `computeInitWindows` (emit_sections.vl) cuts the top-level
globals and statements, in the order the start runs them, into windows of one module each.
`computeInitFns` groups the windows that lower any code into one init function per module,
in load order (`gInitMods`). Each init function sits right after the start, takes the
start's `() -> ()` type, and is named `__start__@<module path>:1`. The start keeps the
pooled-string fill and then calls the inits in order.

- **Which builds change.** A single-file program keeps the one start function, so its bytes
  do not change. So does a program whose live windows do not come in load order (a module's
  code split by another's), which falls back to the monolithic start.
- **Program-wide passes stay program-wide.** The local and frame scan and the string
  accumulator scan (`strAccScanStart`) run once over the whole top level, before the first
  init. Promotion of a binding to a start local (P1, P4) is decided per window, so a
  promoted binding never crosses an init function. The narrowing an init leaves is carried
  into the next and restored after the last.
- **The artifact.** `emitLinkSection` keys init `k` as `init:<module path>` and puts it in
  that module's `LinkArt.init`. It removes the calls from `rt#0`'s body (`elDropInitCalls`,
  `elDropStartCalls` since §22). `link()` places the inits after the start, in artifact order, and writes the calls back
  into the start before its `end` (`lkWithCalls`). So `rt#0`'s artifact body is the pool
  fill alone.
- **Names.** With init functions the start is named `__start__`, with no file: the root's
  init already takes `__start__@<root>:1`, and two functions sharing a name are told apart by
  a disassembler by function index. A dependent's text then named its own init by that index,
  which moves when a dependency adds a private function; `tests/vl_iface_hash_test.ts` read
  this as three unsound hits (a private type, a lambda, a re-exporter's private helper).

**The interface hash.** Two of its mutation witnesses relied on lib's top level running
inside the root's start, and no longer do:

- **Top-level lets as exposed (mask 1024).** A private let's initialiser now lowers in its
  own module's init, so no dependent's function holds it. With the ingredient dropped,
  `private let initialiser edit` stays sound, and so do a private let whose initialiser calls
  a function writing an exported nullable global the root narrows, and a private let whose
  string literal the root also uses. That holds when the start is counted as the root's
  function too. The hash keeps the ingredient, because a program whose windows fall back to
  the monolithic start still runs a private initialiser in the root's start; the suite lists
  no mutant for it.
- **Mentions in cut bodies (mask 16).** Its old witness, `annotated body writes a global`,
  showed the root's start promoting `counter` to a local while no function wrote it.
  Promotion is decided per window now, and `counter` is declared in lib's window, so it is
  never promoted in the root's. The witness is now `annotated body writes a narrowed global`,
  which the root's checker sees.

**Measured.** Over 4,762 armed tests/cases builds at d78220c61 (the `@run` files plus every
`modules/**/entry*.vl`), with this step's witness:

| | master | this change |
| --- | ---: | ---: |
| module keys held by two or more | 37 | 37 |
| module pairs that differ | 4,554 | 4,554 |
| runtime functions held by two or more | 166 | 166 |
| runtime pairs that differ | 4,811 | 4,811 |
| of them, `rt#0` | 4,758 | 4,758 |
| link proof: functions | 83,534 | 84,364 |
| link proof: sections or bodies that differ, unresolved | 0, 0 | 0, 0 |

The 830 new functions are the init functions; the module keys whose artifacts gained one
differ in no new pair. Over the whole population `rt#0` still differs in every pair,
because nearly every build is a single-file program whose start is unchanged. Over the 120
`modules/**` builds alone, `rt#0` pairs go **118 → 27**: the 27 left differ in the pooled
strings their start fills. The module pairs there stay 230 → 230.

**The witness and the control.** `tests/cases/modules/start-init-per-module/` has two roots
that share `table.vl`, whose top level builds a list and prints a sum. `entry2.vl` loads
`other.vl` first, whose initialisation must run ahead of `table.vl`'s; neither root uses a
pooled string. The control is master: 0 module pairs and 1 runtime pair (`rt#0`) differ.
This change reads 0 and 0.

**Gates.**

- **Identity:** difftree `--identity` against a master fixpoint built from d78220c61 reads
  16,461 files, 11,451 built, 964 differ and 0 uncompared; the fixpoint differs, since the
  compiler is a multi-module program. Each of the 964 was run under both seeds: stdout,
  stderr and exit code agree once wasm offsets are left out. A trap in a module's top level
  now shows one more wasm backtrace frame, the start calling the init; the `vl source frames`
  lines are the same. `--allow-diff` is needed.
- **regress.vl:** 0 runs → not-runs, 0 → silent, no cell changed class.
- **Seed:** the fixpoint holds, at 5,714,756 bytes (master's fixpoint 5,703,837, +0.19%);
  `seed-size.vl --check` passes against its baseline.
- **L2 guest fuel**, one run each on this source: 89,179,964,033 on master's seed and
  89,198,915,296 on the new one (+0.02%).
- **plumb-shape cost:** passes, with main fuel −3.0%, tail fuel −3.2% and RSS −2.0% against
  its baseline.

**What is left of the start function.**

- **The pool fill** stayed in `rt#0`, so a start still followed the program's string pool.
  §22 moves it to the link, keyed by the pool's content.
- **The narrowing carried between inits** is a program fact: an init's body can depend on
  what an earlier module's init narrowed. This step did not measure how often it does.
- **Single-file programs** keep the monolithic start. A cache gains nothing from splitting
  them, since their only module is the root.

## 22. Step 7, fifth part: the pooled-string fill is keyed by the pool at link

**What moved.** After §21 the start function of a multi-module program held two things: the
calls to each module's init, which link writes back, and the pooled-string fill, which the
emitter wrote into `rt#0`'s body. The fill reads which pool globals are filled from a
segment and at which offsets, so `rt#0`'s split body differed whenever two programs' pools
differed, which was all 27 of the `modules/**` pairs left by §21.

**The mechanism.** The link decides the fill from the pool's content, not the emitter.

- `linkFillPlan(bytes, optimized)` (`compiler/link.vl`) is the old `strFillPlan` decision,
  moved: an entry is filled when it saves more than the widening it costs, the plan fills
  nothing under `-O` or when the total save is 64 bytes or fewer, and a run restarts every
  32 entries. It returns each filled entry's offset into the segment, or -1. The emitter's
  `strFillPlan` calls the same function, so a direct build and a linked one agree.
- A pool global `s:<lex>` is always emitted into its artifact in the FIXED form (its bytes as
  `i32.const`s and `array.new_fixed`), whatever its program decided (`elDefEntry`,
  `compiler/emit_link.vl`). Its bytes are a function of the literal alone.
- `link()` runs `lkPoolPlan` over the pool in its linked order, rewrites a filled entry to the
  filled form (`linkPoolFilled`, a length and `array.new_default`), and builds the fill
  calls into `rt:__str_fill__` and the segment from the same plan (`lkFillCalls`).
- `rt#0`'s split body is `0x00 0x0b` when every reference in it is a pool global, the fill
  helper or an init (`elDropStartCalls`). Link writes the fill calls, then the init calls,
  before its `end` (`lkWithCalls`).
- A single-file program keeps its monolithic start, with the fill inside it, so `link()`
  adds no second fill when the start already calls `rt:__str_fill__` (`lkOwnFill`).

**Why not per module.** The alternative was each module filling its own literals in its init.
That needs a segment offset per module, which is again a program fact, and two modules sharing
a literal would each fill it, since a pool global is defined once per program. Keying the fill
at link keeps one segment and one helper, and leaves every artifact's bytes a function of its
own source.

**Measured.** Armed, at e4a5b289e, master against this change:

| | master | this change |
| --- | ---: | ---: |
| `modules/**` builds: `rt#0` pairs that differ | 27 | 1 |
| `modules/**` builds: module pairs that differ | 235 | 233 |
| all 4,795 tests/cases builds: module keys held by two or more | 37 | 37 |
| module pairs that differ | 4,582 | 4,572 |
| runtime functions held by two or more | 166 | 166 |
| runtime pairs that differ | 4,845 | 4,845 |
| of them, `rt#0` | 4,792 | 4,792 |

The one `rt#0` pair left in `modules/**` is `modules/solo/entry.vl`, a single-file program
whose start is its top level. The link proof reads 0 sections or bodies differing and 0
unresolved on the `modules/**` builds (2,734 functions), the 4,673 `@run` builds (82,597
functions) and the armed self-build (14,440 functions), which fills in several runs.

**The witness and the control.** `tests/cases/modules/start-pool-fill-per-module/` has two
roots sharing `notes.vl`, whose pooled literal is too short for a program to fill on its own.
`entry.vl` adds a long literal, so its program fills both; `entry2.vl` adds none, so its
program fills neither. On master 1 module pair (`notes.vl`, whose literal was filled in one
program only) and 1 runtime pair (`rt#0`) differ. This change reads 0 and 0.

**Gates.**

- **Identity:** difftree `--identity` against master's fixpoint at a6d1916a2 reads 16,497
  files, 11,639 built, 0 differ and 0 uncompared, and the candidate compiling master's source
  gives master's fixpoint. Disarmed output does not change, because the emitter calls the same
  plan. `--allow-diff` is not needed.
- **regress.vl:** 0 runs → not-runs, 0 → silent, no cell changed class.
- **Seed:** the fixpoint holds, at 5,729,491 bytes (master's fixpoint 5,723,732, +0.10%);
  `seed-size.vl --check` passes against its baseline.
- **L2 guest fuel**, one run each on this source: 89,433,919,101 on master's seed and
  89,433,919,513 on the new one (+412 units).

**What is left.** The fill segment, `rt:__str_fill__` and whether a start exists at all are
still program facts, decided at link. Single-file programs keep their own fill.
