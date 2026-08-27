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

Master `1e81b0f3` (seed 1,453,931) vs the branch (seed 1,454,009):

| | `1e81b0f3` | branch |
|---|---|---|
| runs | 294 | **882** |
| check-clean invalid wasm | 660 | **72** |
| loud check reject | 132 | 132 |
| loud emit reject | 114 | 114 |

**588 cells move, every one `check-clean invalid wasm` → `runs`. 0 backward, 0 lateral, and
both loud columns are unchanged to the cell.**

**THE ALIAS AXIS IS INERT AFTER THE FIX, IN THE MESSAGE AS WELL AS THE CLASS.** Pair every
`claim>0` cell with its `claim=0` twin at the same (`annpat`, `rep`, `annpos`) — 800 pairs:

| | same class | same message | different |
|---|---|---|---|
| `1e81b0f3` | 212 | 164 | **588** |
| branch | **800** | **800** | **0** |

The `claim × annpat` table says the same thing a second way — after the fix the silent count
at `claim=1` and `claim=2` equals the `claim=0` count at every one of the five `annpat`
levels (3 / 2 / 8 / 3 / 8), where before it was (52 / 54 / 80 / 52 / 80).

## The residue, and what it is NOT

72 silent cells remain, **24 at each of `claim` 0, 1 and 2** — so they are not this row's:
they are the population a no-alias program already had. Their coordinates are
`rep ∈ {arm, f64lit, numlit}` only, concentrated at `annpat ∈ {inner, all}`, and the smallest
is 291 bytes with no alias in it at all:

```
type N = 1 | 2
type Circle = { r: N }
function rd() {
  const lv1: {[string]: Circle} = Map()
  lv1["k0"] = { r: 1 }
  const c = [lv1]
  …
}
```

**48 of the 72 changed MESSAGE without changing class** — from a module-level
`type mismatch: expected (ref $type), found (ref $type)` at the global cell to a function-body
`Invalid input WebAssembly code … expected (ref null $type), found (ref $type)`. Those 48 are
exactly the `claim=1` and `claim=2` cells, and their new message is character-for-character
their `claim=0` twin's: the alias stopped changing the failure, it did not stop the failure.
Recorded because "same class, different message" is one of the four disguises a count-only
reading misses.

## The CENSUS itself, re-graded on both legs

The full 250,238-cell census (`scripts/silent-sweep/census/`) was regenerated and graded
against `1e81b0f3` and against the branch. **It is the channel that sizes the family, and it
is not blind to it the way the corpus is.**

| block | cells | silent, `1e81b0f3` | silent, branch | loud check | loud emit |
|---|---|---|---|---|---|
| A | 150,224 | 12,277 | **9,814** | 49,715 both | 27,513 both |
| B | 28,590 | 3,023 | **2,564** | 9,621 both | 7,757 both |
| C | 43,200 | 3,765 | **3,115** | 7,200 both | 8,562 both |
| D | 9,000 | 155 | 155 | 832 both | 944 both |
| E | 19,224 | 1,911 | **1,539** | 890 both | 7,706 both |
| **all** | **250,238** | **21,131** | **17,187** | 68,258 both | 52,482 both |

**3,944 cells move. Every one `check-clean invalid wasm` → `runs`. 0 backward, 0 lateral —
both loud columns are identical to the cell in every block**, and `runs` rises by exactly
3,944 (108,367 → 112,311).

Every moved coordinate is at `cont=list_of_map`, at `annpat=outer`, at `claim ∈ {1, 2}`, and
they spread over every level of the other ten axes — 1,175 `store=local` to 493 `param`,
1,606 `escope=fn` to 423 `mod`, `declness` 1,545 / 1,387 / 992, all five `twin` levels, all
three `union` levels, all five `annpos`, six of seven `deliv`, all six `pval`, both `order`,
and fifteen `rep`s.

### The families, re-derived on `1e81b0f3` rather than read from the published run

`rescue.py`'s grouping was re-derived from this tree's own grading, so the family sizes are
this commit's and not `1559d80c`'s (they are the same numbers, and that is a reading rather
than an assumption):

| family (rescuing axes) | cells | → runs | → loud | still silent |
|---|---|---|---|---|
| **`claim`** | **2,254** | **2,254** | 0 | **0** |
| `cont` | 2,032 | 425 | 0 | 1,607 |
| `union` | 1,518 | 0 | 0 | 1,518 |
| `twin,union` | 1,436 | 0 | 0 | 1,436 |
| **`claim,cont`** | **1,296** | **976** | 0 | **320** |
| `cont,union` | 890 | 0 | 0 | 890 |

**The `claim` family closes entirely.** Of `claim,cont`, 976 close and **320 remain — and
they are not this row's**: the structural spelling with `type Box1` deleted reproduces them
identically on both compilers, class, message and byte offset. Filed as **D189**.

### The message channel over the census

**1,390 cells keep their class and change their message.** 1,388 are at `cont=list_of_map` —
cells where the union box was one of two problems and removing it exposed the other, the
diagnostic moving from a module-level `type mismatch: expected (ref $type), found (ref
$type)` at the global cell to a function-body `Invalid input WebAssembly code … expected
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
| the claim alone (`singleAliasMemberTyIx`) | 588 |
| the nominal-render leg alone (`transparentMemberEmitName`) | **0** |
| both | 588 — **set-identical to the claim alone** |

so this grid reports the leg as inert and it is not. The channel that sees it is the
alias-vs-inline twin table (17 positions × 8 map value kinds × 4 alias bodies × {alias,
inline} = 1,088 cells), where the claim alone is +446 / **−3** and the pair is +447 / **0**.
Use both.
