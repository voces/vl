# `br_table` for literal-union dispatch — measured, refuted

**Verdict: do not build it.** A `br_table` at the compiler's largest literal-union dispatch
site is a **regression** under that site's measured key distribution (+3.61 ns per dispatch,
≈ **+0.36%** of a `vl build`), and even under a perfectly branch-predictable key stream — the
only regime where a jump table wins at all — it is worth **−0.065%**. The mechanism is not the
finding. The finding is that **the whole literal-union dispatch axis has a ceiling of about
0.05–0.2% of `vl build`**, and no lowering — jump table, arm reordering, or a hypothetical
free dispatch — can beat that ceiling.

Filed 2026-08-23 against `docs/internals/perf-workstream.md` §4 candidate 3(A), on master
`877454fe`. Machine: i9-12900KF, `taskset -c 8`, WSL2, load average ~2 (other agents on the
box). Every number below is measured; every place arithmetic stands in for a measurement
says so.

---

## 1. The three facts that decide it

1. **A literal union's atom ids are not contiguous** — and it turns out not to matter, because
   table *density* is second-order (2.6%) next to the cost that dominates.
2. **The crossover is not an arm count.** It is the **branch predictability of the dispatch
   target**. A compare chain's individual branches are each strongly biased and predict
   almost perfectly; a `br_table`'s indirect jump mispredicts whenever the target varies.
   At an unpredictable target the chain wins at **every** arm count up to 67.
3. **The population is too small.** Every function in the self-compiled compiler carrying an
   `i32.eq` chain of ≥10 arms over a plain local sums to **1.71%** of self time, and the two
   longest chains in the whole tree — 67 arms and 49 arms — execute **zero times** during a
   `vl build`.

---

## 2. Are a union's members contiguous? No, and it is the wrong question

`internAtom` (`compiler/emit_classify.vl:17743`) is one **program-wide** `{[string]: i32}`
keyed on the raw literal **text**, minting `litAtomNext++` on first sight. Nothing anywhere
enumerates a union's declared members to seed it, so ids follow *emission order of literals*,
not membership.

The consequence is structural, not accidental: **two unions that share a member spelling share
its id**, so their ranges interleave. In `compiler/` that is not hypothetical — `"i32"` is a
member of `VKind`, `MfKind`, `PrimName` **and** `RtKind`.

Witness (`vl build`, then `wasm-dis`), two unions with two shared spellings:

```vl
type A = "x" | "y" | "z"
type B = "p" | "x" | "q" | "y" | "r"
```

`A`'s arms compare against 0, 1; `B`'s against **2, 0, 3, 1** — permuted, because `A`'s
literals were interned first. A program containing exactly one literal union *does* get
0, 1, 2, … in arm order, which is why a one-union witness would have said "contiguous".

Measured on the self-compiled compiler (`vl build compiler/entry.vl --names`, then `wasm-dis`,
grouping every `(i32.eq (local.get $L) (i32.const C))` by `$L` per function):

| dispatch | arms | id span | density |
| --- | ---: | ---: | ---: |
| `kindTag` (`TokKind`) | 67 | 68 | 99% |
| `lexClassOf` (`TokKind`) | 49 | 63 | 78% |
| `binPrec` (`TokKind`) | 34 | 48 | 71% |
| `fbValtype` (`VKind`) | 27 | 43 | 63% |
| `repKindOfSigTok` | 21 | 53 | 40% |
| `repTreeVKind` (`RtKind`) | 13 | 40 | 33% |
| `rtListVKind` (`RtKind`) | 11 | 41 | 27% |

**Density is second-order.** Measured directly: 11 arms at span 11 (100% dense) with an
unpredictable key → table `0.0966 s / 20M`; the *same 11 arms* at span 41 (27% dense) →
`0.0991 s / 20M`. **2.6% apart.** The table's size is not what costs; the indirect branch is,
and an indirect branch does not care how many entries the table has. So the whole
"pre-intern each union's members contiguously" design — which would have been defeated anyway
by the shared `"i32"` spelling — would have bought nothing.

---

## 3. The instrument

Two wasm functions that differ **only** in the dispatch: an `i32.eq`/`if`/`return` chain, and
a `block`-nest with one `br_table` over `(i32.sub key min)` (unsigned wrap sends any key below
`min` to the default arm, so no explicit bounds check is needed). Both are driven by an
identical loop that reads its key from a 4,096-entry `i32` array in linear memory indexed by
`i & 4095`, so the load, the mask and the call are common-mode and cancel. Run under
**wasmtime 47** — the same engine and major version `scripts/vl-host` embeds — min-of-9 after
two warm calls, 20M dispatches per timing.

The driver floor (loop + load + call, dispatch depth 1) is **0.0185 s / 20M**. Subtract it to
read a marginal cost.

> `perf-workstream.md` §8.3 forbids benchmarking the *compiler* with a synthetic corpus. This
> is a different instrument: it measures a property of the **machine** (branch prediction),
> and every conclusion drawn from it below is multiplied by a **counter taken on the real
> input**. It is never used to estimate compiler throughput on its own.

**Cranelift does not do switch-recognition on a wasm `i32.eq` chain.** Measured, not assumed:
the chain arm's time is linear in arm count (`0.0148 → 0.1360` from N=2 to N=67) while the
table arm's is flat (`0.0182 → 0.0185`). If cranelift were rewriting the chain into a jump
table the two would coincide. So emitting `br_table` really would change the machine code —
the experiment is meaningful, and the answer is that the chain is the better code.

---

## 4. The crossover is not an arm count

Dense (density 100%), 20M dispatches, seconds, min-of-9. **`uniform`** draws the key uniformly
from the arms (target unpredictable); **`last`** always hits the final arm (target perfectly
predictable, chain depth maximal — the friendliest case a jump table can be given).

| arms | chain `uniform` | table `uniform` | chain `last` | table `last` |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 0.0244 | 0.0288 | 0.0148 | 0.0182 |
| 3 | 0.0249 | 0.0473 | 0.0161 | 0.0185 |
| 4 | 0.0269 | 0.0582 | 0.0186 | 0.0186 |
| 6 | 0.0278 | 0.0929 | 0.0204 | 0.0185 |
| 8 | 0.0300 | 0.1001 | 0.0222 | 0.0185 |
| 11 | 0.0304 | 0.0966 | 0.0257 | 0.0185 |
| 16 | 0.0343 | 0.0958 | 0.0355 | 0.0185 |
| 24 | 0.0386 | 0.1058 | 0.0553 | 0.0185 |
| 32 | 0.0457 | 0.0986 | 0.0681 | 0.0185 |
| 48 | 0.0609 | 0.1006 | 0.1080 | 0.0185 |
| 67 | 0.0797 | 0.1076 | 0.1360 | 0.0185 |

Two readings, and the second is the one that matters:

- **Predictable target: the crossover is N ≈ 4**, and above it the table wins by a lot (7.4×
  at 67 arms). This is the number a naive reading of the item expects to find.
- **Unpredictable target: there is no crossover.** The chain wins at every arm count measured,
  by 1.4× at 67 arms and by 3.4× at 8. The reason is the asymmetry in what the two shapes ask
  of the predictor: each `i32.eq` branch in a chain is biased ~(N−1)/N not-taken and predicts
  near-perfectly regardless of N, while the table's single indirect jump is a fresh
  N-way guess every time. A 67-deep chain of correctly-predicted compares retires at ~0.09 ns
  per compare; one mispredicted indirect jump costs ~4 ns.

**So the shape of the key stream, not the number of arms, decides the sign of the change.**
Any implementation of 3(A) would need that as its gating heuristic, and the compiler does not
have it: the emitter knows the arm count statically and knows nothing about the distribution.

---

## 5. The compiler's own largest site

`repTreeVKind` (`compiler/emit_rep.vl`) is the largest literal-union dispatch in the tree: 12
`if`s over 13 `RtKind` atom ids, and the entry `perf-workstream.md` §4.2 names as the shape
3(A) exists to serve.

**Counter** (a scratch copy of `compiler/` + `std/`, per §8.2; the repo's `compiler/` was never
edited), over `vl build compiler/entry.vl`:

```
repTreeVKind = 1,849,728 calls    ifs reached = 15,522,770    mean depth = 8.39 of 10
kindTag      = 0 calls            lexClassOf  = 0 calls
```

The call count reproduces §3's **1,847,718** to within 0.1% from a different instrument on a
different command (`vl check --codegen`). **The 67-arm and 49-arm chains — the two shapes where
a jump table would win biggest — never execute during a build**: `kindTag` is an atom→string
widening used only to build `expected …` error text, and `lexClassOf` belongs to the
highlight/format path.

**Arm histogram**, same run — this is what decides the sign:

| arm | tag | hits | share |
| ---: | --- | ---: | ---: |
| 10 | `struct` | 881,016 | 47.63% |
| 11 | `list` | 587,265 | 31.75% |
| 1 | `i32`/`bool` | 284,293 | 15.37% |
| 5 | `str` | 75,616 | 4.09% |
| 9 | `map` | 12,777 | 0.69% |
| 6 | `atom` | 5,657 | 0.31% |
| 12 | `nul` | 1,910 | 0.10% |
| 8 | `box` | 1,194 | 0.06% |
| 2,3,4,7 | `i64`,`f64`,`f32`,`closure` | 0 | 0% |

Four live targets carrying 98.8%, and no fall-through at all.

**Now the exact shape, benchmarked**: the real arm order, the real atom ids
(`68,107 | 74 | 75 | 73 | 71 | 106 | 82 | 105 | 100 | 83 | 85 | 104`), the real span of 40, and
key streams from the histogram above. `real` is the measured distribution shuffled; `runsK`
is the same distribution emitted in runs of K (a proxy for how correlated the walk order makes
consecutive scrutinees); `last` is a single target.

| key stream | chain | table | Δ per dispatch | over 1,849,728 calls |
| --- | ---: | ---: | ---: | ---: |
| `uniform` over the 13 ids | 0.0327 | 0.1497 | **+5.85 ns** | +10.8 ms |
| `real` (measured weights, shuffled) | 0.0288 | 0.1011 | **+3.61 ns** | **+6.7 ms (+0.36%)** |
| `runs2` | 0.0295 | 0.0622 | +1.63 ns | +3.0 ms |
| `runs4` | 0.0347 | 0.0416 | +0.35 ns | +0.6 ms |
| `runs8` | 0.0336 | 0.0307 | −0.14 ns | −0.3 ms |
| `runs32` | 0.0309 | 0.0229 | −0.40 ns | −0.7 ms |
| `last` (single target) | 0.0316 | 0.0187 | **−0.65 ns** | **−1.2 ms (−0.065%)** |

Break-even is at runs of about **6**. Below that the jump table is a regression.
`vl build compiler/entry.vl` on this box measures **1.62–2.04 s user CPU, median 1.86 s**
(10 runs, `taskset -c 8`, elevated load); the percentages above use 1.85 s.

### 5.1 The ceiling, which is the real result

Take the dispatch away entirely. At the measured mean depth of 8.39 the chain costs
`0.0288 − 0.0185 = 0.0103 s / 20M` = **0.515 ns per dispatch**. So

> **making `repTreeVKind`'s dispatch instantaneous — by any mechanism — saves
> 0.515 ns × 1,849,728 = 0.95 ms, i.e. 0.052% of a `vl build`.**

That is a hard ceiling on the largest literal-union dispatch site in the compiler, and it is
below the noise floor of the A/B protocol that would have to certify it. It also cross-checks
the profile: `repTreeVKind` reads **0.73% self**, so the compare chain is **~7%** of its own
self time. The other ~93% is the bounds-checked `rtKind[ix]` load (a `struct.get` for the list
header, an `array.get`, and a `select` bounds check — all visible in the disassembly), the
`ix < 0` guard, and call/return.

**This is #1851's lesson on a second axis.** #1851 measured the *per-compare* axis at −0.17%.
This measures the *chain-length* axis at ≤0.05% on the biggest site. `perf-workstream.md`
ranked (A) above (B) on the reasoning that "the prize is N compares into one dispatch" — the
prize is real, and it is 0.05%.

---

## 6. The population, so nobody re-opens this on a different site

Guest profile of `vl build compiler/entry.vl` (`VL_PROFILE_GUEST`, 6 warm runs, 10,655 samples,
`$mNN` stripped) crossed with a static scan of the named wasm for `i32.eq`-against-constant
groups per function:

| longest chain in the function | functions | Σ self% |
| ---: | ---: | ---: |
| ≥3 arms | 237 | 11.92% |
| ≥6 arms | 137 | 8.70% |
| ≥10 arms | 39 | **1.71%** |
| ≥16 arms | 15 | **0.24%** |

The ≥10 bucket is the only one where a jump table could win even with a perfect key stream,
and it is 1.71% of self time **inclusive of everything else those functions do**. Its largest
member is `tyTopIndexOf` at 3.57%… which is not in the bucket: its 9-arm chain is over
**character codes**, and `perf-workstream.md` §4 has already ruled that it is a string parser,
not a dispatch. The largest true member is `repTreeVKind` at 0.73%, and §5.1 just spent it.

For scale on the whole axis, attributed mechanically rather than by hand — intersect the
chain scan with the **123** functions in `compiler/*.vl` whose signature mentions a named
literal-union type (`TokKind`, `VKind`, `MfKind`, `PrimName`, `LitKind`, `EqCmpKind`,
`RtKind`):

| | functions | Σ self% |
| --- | ---: | ---: |
| litunion signature **and** a ≥3-arm chain | 51 | **2.24%** |
| …and a ≥6-arm chain | 29 | 2.05% |
| …and a ≥10-arm chain | 19 | 1.38% |

That 2.24% is an **over**-count in one direction that matters: `keywordKind` (0.14%),
`oneCharKind` (0.05%), `binPrec` (0.05%) and `twoCharKind` (0.03%) take or return a `TokKind`
but their chains are over **character codes**, not the atom. So ≤2.24% of self time is
everything the axis touches, and applying `repTreeVKind`'s measured chain-to-self ratio of 7%
gives **~0.16% for the entire literal-union dispatch axis**. That last figure is arithmetic on
one measured ratio, not a measurement — but it is the right order, and it is what "compounds
with candidate 2" is actually worth.

---

## 7. Found, not fixed

- **`kindTag` is a 67-arm `i32.eq` chain that is really a table lookup.** `function kindTag(k:
  TokKind): string { return k }` — an atom→string **widening**, lowered as a linear chain of
  compares against every member id. If an atom→string widening ever lands somewhere hot, its
  structure is an **array of string globals indexed by the atom id**, which is one load and no
  branch — strictly better than `br_table`, which still branches. It runs **0 times** in a
  build today, so this is a note, not a candidate.
- **The dense contiguous tag the item wanted does exist — it is the *value-union* tag, not the
  literal-union atom.** `match` over a value union lowers to `i32.eq` against
  `(struct.get <box> 0)` with tags **0, 1, 2, 3, …**, contiguous per union by construction
  (witness: a 5-member union compiles to `i32.eq … 0/1/2/3` + else). Extending the static scan
  to that shape moves the ≥10-arm bucket from 1.71% to **5.42% self**, of which **3.72%** is
  struct-tag dispatch (`capScan` 20 arms/0.63%, `cboxScan` 19/0.26%, `drwWalk` 18/0.23%,
  `blockHasVariantRebox` 17/0.21%, `liftFnsInExpr` 16/0.26%, `mfScan` 15/0.20%). Bigger, and
  the ids are already what §2 says atoms are not. **The same physics still refuses it**: these
  are AST walkers, so the scrutinee stream is the *uncorrelated* regime, where §4 measures the
  table losing by 3.6–5.9 ns per dispatch. Anyone re-opening `br_table` should re-open it
  there, and should bring a measured autocorrelation of the node-kind stream, not an arm count.
- **The emitter re-emits the tag load once per arm** in a value-union chain
  (`(struct.get $6 0 (local.get $0))` appears in every arm's condition) rather than loading it
  once into a local. **Unmeasured** — cranelift almost certainly CSEs it — but it is what the
  wasm says, and it is why the value-union chains are longer in bytes than they need to be.
- **The measurement points at arm ORDER, not arm structure.** `repTreeVKind`'s two most
  frequent answers are arms **10 and 11 of 12** (79.4% of all calls between them). Ordering the
  arms by measured frequency takes the mean depth from **8.39** to **1.80** — no lowering
  change, no new construct, a source edit in `emit_rep.vl`. It is also worth **~0.06%**
  (arithmetic: 6.6 compares × ~0.088 ns × 1.85M), which is the same ceiling §5.1 already
  established, reached from the other side. **Two independent mechanisms hitting the same
  ~0.05% is the strongest evidence in this document that the axis is exhausted, not that the
  mechanism was wrong.**

---

## 8. Reproduction

The dispatch microbenchmark is not in the tree — it is ~120 lines of generated `.wat` plus a
20-line wasmtime host, and it would be a crate in `scripts/` for a one-off question. To rebuild
it:

1. A generator emitting one module with `$chain` (N `if`/`i32.eq`/`return` arms) and `$table`
   (an N-deep `block` nest around `br_table … $default (i32.sub key min)`), plus two exported
   drivers that differ only in which they call and read keys from a `(data …)` segment.
   Assemble with `node_modules/.bin/wasm-as -all`.
2. A host: `wasmtime = "47"`, `Config::wasm_gc(true)`, `get_typed_func::<i32, i32>`, two warm
   calls then min-of-9. Both drivers must return the same checksum — they did at every point
   in this document.
3. Pin with `taskset -c 8`. Unpinned, the `runs4`/`runs8` rows straddle zero.

The counter is `perf-workstream.md` §8.2 verbatim, reporting through `emitFail` at the end of
`emitProgram`.
