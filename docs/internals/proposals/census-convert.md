# Proposal: one delivery conversion retires CENSUS's largest holdout family

Lane CENSUS, 2026-11-26.

**Population.** The 38 CENSUS rows of #10465's `holdouts.tsv`. Of these, 31 are file programs, which
I delta-debugged to a minimal witness: a line was removed only while `vl check` stayed clean and
the `VL_IR_REQUIRE_CLAIM=1` decline kept its class. The 7 inline-test rows were not minimized. The
witnesses are in `census-convert-witnesses/`, one per program, minimized on master 2a2bf4d6 (before
#10452). 27 reproduce. Four no longer decline on that compiler: `map receiver kind` (#10454),
`map read widen`, `rep unsup of read` and `field store value nulnone`.

**Grouping.** I grouped the witnesses by the ingredient that makes each decline, reading each 2-to-13
line witness. I did not run a separate removal for each ingredient. Each group's members share one
miss shape: the value is produced at rep A, the consumer asks for rep B, and the builder compares
`irBOpRep(v) != B` locally and misses. `irConvert` (`ir_build.vl`) already exists for this; its
comment calls it "the one conversion every delivery site calls". But only 10 sites call it, while
123 sites in `ir_build.vl` make the local comparison.

| family (the conversion that is missing) | holdout units | witnesses |
|---|--:|---|
| **record row:** a record at its storage row delivered at its type's row, or into a heapless type rep (`irConvert`: "a row copy is not yet a case") | 6 | object rep, map store value variant bare rep ×2, field read of a stored row, push many run rep, map get rep |
| **box shape:** a union box held at a smaller union, a box unboxed to its member or its `K \| null`, a scalar boxed into a boxed `T \| null` | 6 (5 after #10452) | map get union box rep ×2, map get box type, map read mv, map read box rep, float literal at an integer |
| **atom and string:** an atom delivered where a string is wanted (`atomAtStr`), a string literal at an atom or literal-set rep, a const join stored as its set | 5 | array spread conversion, object variant field strAtom, string literal rep, string atom, pre-path atom hook |
| null unit (`nulnone`) values in a heap position | 3 | object field nulnone, for in element nulnone, null-typed call sentinel rep |
| other: valued `if` without `else`, chunked list, a generic slot at two reps, optional-chain receiver, packed u8 field, store arm, trap message (#10466) | 7 | (separate mechanisms) |
| not minimized: the 7 inline-test rows (`-O` / low-memory accessors ×2, memory address wide ×2, expression if ×2, push stage) | 7 | — |

**The change.** I propose one general IR change, not a claim per class: every delivery goes
through `irConvert`, and `irConvert` gains the three missing conversion kinds. Together they cover
17 of the 27 units that reproduce.
1. **Route.** Replace each local "`irBOpRep(v) != rep` → miss" in `ir_build.vl` / `ir_build_ref.vl`
   with `irConvert(b, v, rep, ty, at)`. A site whose conversion has no case still misses, with
   `convert A -> B`, so the classes collapse into one family the scoreboard can read.
   `scripts/emit-refusal-sites.vl` gives the site list, and the change has no effect on any unit
   that already claims.
2. **`CONVERT_ROW`.** A record copied field-wise from its storage row to the destination row, using
   the same plan as `recCopied` and `recCopyRowAt`. A heapless destination rep takes the source's
   storage row (`storedRowRep`), the way map reads already do.
3. **`CONVERT_BOXNARROW`.**
   - A box to a smaller union's box is `AS_IS`: box tags are global, as #10452 found.
   - A box to its member, or to that member's `T | null`, is `RBoxNarrow`, which the local
     `boxNarrowArmOf` already builds.
   - A scalar into a boxed `T | null` is the existing `CONVERT_BOX`, which needs a destination
     type when the source is a literal typed at `T | null`.
4. **`CONVERT_ATOMSTR`.** An atom to a string is `atomAtStr`; a string literal at an atom rep is the
   member's id.

**Measure first.** Per the lane brief's rule, I would count this population before building. Step 1
alone, routing with no new kinds, should change no output. Its proof is CI's identity job plus one
census, with the `convert A -> B` rows counted per (A, B) pair over all owners. That table decides
the order of steps 2 to 4 and shows how much the change retires for the other lanes. The same miss
shape appears in COV-CALL's `convert …`, COV-IS's `box …` and COV-UNION's `… rep` classes, so this
change has one owner, per "one owner per mechanism".

**Not proposed here:** the null-unit family (3 units), the "other" group (7) and the 7 inline rows.
They are separate mechanisms.
