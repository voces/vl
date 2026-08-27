# The D181 grid — the CONTAINER-ALIAS axis crossed with `annpat`

The 1,200-cell grid that closed `silent-class-inventory.md` **D181** — the census's largest
single rescue family (2,254 silent coordinates whose ONLY one-step rescue is `claim=0`) — and
filed **D187** and **D188** out of its residue. Kept because the closing numbers in that
document are only a claim if the population cannot be re-run.

```sh
python3 scripts/silent-sweep/d181/gen181.py /tmp/d181cells

JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py \
    /tmp/d181cells <master.wasm> /tmp/g/base.json
JOBS=4 python3 scripts/silent-sweep/census/gradecensus.py \
    /tmp/d181cells <branch.wasm> /tmp/g/branch.json
```

`gradecensus.py` is reused verbatim, and the manifest this generator writes is the census's
own shape — so a cell here and a census cell at the same coordinate are graded by one
instrument, and the residues are comparable. `JOBS` defaults to **4** and nothing here raises
it (`vl check` peaks around 650 MB RSS).

**The programs come from `gencensus.py`'s own emitter.** A cell here at coordinate *X* is
character-for-character the census cell at *X*; a hand-written paraphrase would be a different
program, and the census author had three hand-trimmed witnesses move underneath them for
exactly that reason. **The expectation is the GENERATOR's, never the compiler's** — every
cell prints `7`, so a module that loads and answers wrong grades `runs but wrong value`.

## Why this grid exists

D181's family is 2,254 silent census coordinates, and across every one of them the census
holds **`annpat` constant at `outer`**. `annpat` says WHICH INTERMEDIATE LEVEL of a nested
container carries an annotation, and it is the third most mobile axis in the whole census
(0.265 outcome-change rate over 36,000 one-step sibling pairs). The census cannot cross it
with `claim`: **block D is the only block that varies `annpat`, and block D pins `claim=0` by
construction** ("nothing nominal declared"). So the one block that varies the alias axis holds
the annotation-pattern axis fixed, and the one block that varies the annotation-pattern axis
holds the alias axis fixed. This grid crosses them.

| axis | levels |
|---|---|
| `claim` | 0 / 1 / 2 container aliases of the same layout, each with one value of it |
| `annpat` | outer / none / inner / mid / all |
| `rep` | the 16 payload field types |
| `annpos` | none / binding / dest / retann / readsite |

`cont` is pinned at `list_of_map` **on purpose**: this grid exists to cross the two axes
above, not to re-measure the container axis the census already crosses fully (192/192 of
`rep × cont`, 2,205/2,520 of `cont × annpos × deliv × pval`). Everything else is the census's
CLEAN coordinate — `store=local`, `escope=fn`, `declness=byname` (`nodecl` for the two scalar
reps, which have no object shape to declare), `twin=none`, `union=nounion`, `deliv=direct`,
`pval=single`, `order=norm`.

## The result that closed the row

Merged master `e04b1567` (seed 1,456,293) vs the branch (seed 1,456,371). **Every number in
this file is re-measured on the MERGED base**: this branch was cut at `1e81b0f3` and two
census-cluster landings (#1969 `88f21245`, #1968 `e04b1567`) came in underneath it, so
nothing here is carried over.

| | `e04b1567` | branch |
|---|---|---|
| runs | 296 | **888** |
| check-clean invalid wasm | 658 | **66** |
| loud check reject | 132 | 132 |
| loud emit reject | 114 | 114 |

**592 cells move, every one `check-clean invalid wasm` -> `runs`. 0 backward, 0 lateral, and
both loud columns are unchanged to the cell.**

**THE ALIAS AXIS IS INERT AFTER THE FIX, IN THE MESSAGE AS WELL AS THE CLASS.** Pair every
`claim>0` cell with its `claim=0` twin at the same (`annpat`, `rep`, `annpos`) — 800 pairs:

| | same class | same message | different |
|---|---|---|---|
| `e04b1567` | 208 | 164 | **592** |
| branch | **800** | **800** | **0** |

The `claim` x `annpat` table says the same thing a second way — after the fix the silent
count at `claim=1` and `claim=2` equals the `claim=0` count at every one of the five
`annpat` levels (2 / 2 / 8 / 2 / 8), where before it was (52 / 54 / 80 / 52 / 80).

**WHAT THE TWO LANDINGS UNDERNEATH THIS BRANCH OWN, PER COORDINATE.** "Did my count change"
is the wrong question — #1968's author found #1969 had closed 220 of its 1,518 with ZERO
coordinate overlap. Graded per cell on both bases and both legs:

| | cells |
|---|---|
| the landings close, with this fix ABSENT | **2** |
| this fix closes on `1e81b0f3` | 588 |
| this fix closes on `e04b1567` | **592** |
| …of which close ONLY on the merged base — a COMPOSITION | **4** |
| …lost to the landings | **0** |
| overlap between the landings' 2 and this fix's 592 | **0** |

So `letMapDestShape` (#1969, which closed 2,644 census cells and census rows D182 / D185 /
D186) and the closure-arm fix (#1968) own two cells of this grid and this fix owns 592, with
nothing in common — and four more cells run only with both, having been silent under either
alone. #1969's own residue note says the same thing from the other side: its pure-`cont`
remainder is 735/1,297 **at `cont=list_of_map` with a container ALIAS present**, which is
this grid.

## The residue, and what it is NOT

66 silent cells remain, **22 at each of `claim` 0, 1 and 2** — so they are not this row's:
they are the population a no-alias program already had. Their coordinates are
`rep` in {`arm`, `f64lit`, `numlit`} only, concentrated at `annpat` in {`inner`, `all`}, and
the smallest has no alias in it at all:

```
type N = 1 | 2
type Circle = { r: N }
function rd() {
  const lv1: {[string]: Circle} = Map()
  lv1["k0"] = { r: 1 }
  const c = [lv1]
  ...
}
```

**44 of the 66 changed MESSAGE without changing class** — from a module-level
`type mismatch: expected (ref $type), found (ref $type)` at the global cell to a function-body
`Invalid input WebAssembly code ... expected (ref null $type), found (ref $type)`. Those 44
are exactly the `claim=1` and `claim=2` cells, 22 each, and their new message is
character-for-character their `claim=0` twin's: the alias stopped changing the failure, it
did not stop the failure. Recorded because "same class, different message" is one of the four
disguises a count-only reading misses.

## The CENSUS itself, re-graded on both legs of the MERGED base

The full 250,238-cell census (`scripts/silent-sweep/census/`) was regenerated and graded
against `e04b1567` and against the branch. **It is the channel that sizes the family, and it
is not blind to it the way the corpus is.**

| block | cells | silent, `e04b1567` | silent, branch | loud check | loud emit |
|---|---|---|---|---|---|
| A | 150,224 | 8,983 | **6,520** | 49,715 both | 27,225 both |
| B | 28,590 | 2,115 | **1,604** | 9,621 both | 7,753 both |
| C | 43,200 | 2,596 | **1,616** | 7,200 both | 8,562 both |
| D | 9,000 | 67 | 67 | 832 both | 944 both |
| E | 19,224 | 1,422 | **894** | 890 both | 7,706 both |
| **all** | **250,238** | **15,183** | **10,701** | 68,258 both | 52,190 both |

**4,482 cells move. Every one `check-clean invalid wasm` -> `runs`. 0 backward, 0 lateral —
both loud columns are identical to the cell in every block**, and `runs` rises by exactly
4,482 (114,607 -> 119,089). `runs but wrong value` and `trap_loads` are **0** on both legs,
and `compiler trap` is 2 on both (D179, untouched) — which is the column to read if a fix in
this area were to make a module validate and then TRAP, the failure mode #1968 hit with two
`$fnsig`s over one `uVarHeap`. Nothing here does.

Over the 247,427 DISTINCT coordinates, **4,434 move, all `check-clean invalid wasm` ->
`runs`, 0 backward**. Every one is at `cont=list_of_map`, at `annpat=outer`, at
`claim` in {1, 2}, and they spread over every level of the other ten axes — `store` 1,381
`local` down to 569 `param`, `escope` 2,010 `fn` down to 434 `mod`, `declness` 1,867 / 1,545 /
1,022, all five `twin` levels, all three `union` levels, all five `annpos`, six of seven
`deliv`, all six `pval`, both `order`, and fifteen `rep`s.

### The families, RE-DERIVED on `e04b1567` rather than read from any published run

`rescue.py`'s grouping was re-derived from this tree's own grading of the merged base. **Do
not quote a census family size; measure it** — every agent that re-derived one this week found
it had moved (1,896 -> 1,518 -> 1,084 for `union`; 1,992 -> 2,032 -> 1,982 for `cont`).

| family (rescuing axes) | cells on `e04b1567` | -> runs | -> loud | still silent |
|---|---|---|---|---|
| **`claim`** | **2,254** | **2,254** | 0 | **0** |
| `cont` | 1,982 | 481 | 0 | 1,501 |
| **`claim,cont`** | **1,430** | **1,430** | 0 | **0** |
| `union` | 1,084 | 0 | 0 | 1,084 |
| `twin,union` | 668 | 0 | 0 | 668 |
| `cont,twin,union` | 476 | 0 | 0 | 476 |

**Both alias families close entirely.** The `claim` family is 2,254 on the merged base as it
was on `1e81b0f3` — a re-derivation that came back the same, which is a reading and not an
assumption. `claim,cont` GREW from 1,296 to 1,430 underneath this branch, because #1969
rescued `cont` siblings and a family keyed on the SET of rescuing axes gains members when
another axis starts rescuing; all 1,430 close here. The 320-cell residue this branch measured
inside `claim,cont` on `1e81b0f3` — filed as D189, a second claimant over a union arm with a
declared twin — is closed by #1969's `letMapDestShape`, and D189 is now the refutation pin for
that pair.

### The message channel over the census

**842 coordinates keep their class and change their message.** 840 are at `cont=list_of_map` —
cells where the union box was one of two problems and removing it exposed the other, the
diagnostic moving from a module-level `type mismatch: expected (ref $type), found (ref $type)`
at the global cell to a function-body `Invalid input WebAssembly code ... expected
(ref null $type), found (ref $type)`. **The other 2 are D179's compiler traps**, whose
"message" is a wasm backtrace of the COMPILER — its function indices shift because the seed
changed size, and both cells stay `compiler trap`. Recorded because a message diff that is an
artifact of the instrument reads exactly like one that is not.

## What this grid CANNOT see

`union` is pinned at `nounion`, so **the union-member position does not exist here** — and
that is the one position where the second candidate (the nominal-render leg, D187) does
anything at all. On this grid the two candidates ablate as:

| candidate | moved |
|---|---|
| the refactor alone (`arrSpineLeafTy` + `arrSpineIsMap` defined, uncalled) | **0** |
| the claim alone (`singleAliasMemberTyIx`) | 592 |
| the nominal-render leg alone (`transparentMemberEmitName`) | **0** |
| both | 592 — **set-identical to the claim alone** |

so this grid reports the leg as inert and it is not. The channel that sees it is the
alias-vs-inline twin table (17 positions × 8 map value kinds × 4 alias bodies × {alias,
inline} = 1,088 cells), where the claim alone is +446 / **−3** and the pair is +447 / **0**.
Use both.
