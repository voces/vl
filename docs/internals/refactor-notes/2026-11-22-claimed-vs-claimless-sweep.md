# Claimed vs claimless discovery sweep (D17048), 2026-11-22

Coordinator ruling: a one-off discovery run after D17048's fix (#9567). It reruns once on the I8
cutover candidate as a required step, not per train. It is not a gate. Run by IR-V1.

**The question.** Does any program that runs under the claimless build (`CLAIMED = []`) fail to
validate, or print differently, under the default build? Each such program is a claim soundness
break. `ir-identity.sh --claimless` compares bytes only on its own cells and witnesses, and D17048's
shape was in none of them.

**The instrument** has three populations, each compared on validity and run output, not bytes.

* The full census (`scripts/silent-sweep/census/`): matrix, sab and blocks A–E, generated once.
  Each block is graded under both seeds by `gradecensus.vl` against its manifest. Then
  `delta.vl -- <block> <claimless.json> <claimed.json>` compares them. A hit is a cell that
  leaves `runs`, or a cell that moves into a silent class.
* The capability probes (`scripts/capability-probes/*.vl`), run under `vl run --batch` with
  both seeds. A hit is a program whose claimless run succeeds and whose claimed run fails, or
  prints a different `.out`.
* Both inventories' filed-`runs` witnesses, staged by `scripts/ir-i8-census/witnesses.vl`, run
  the same way as the probes.

**Control.** On master e48f0bff, before #9567, D17048's witness was invalid wasm under the
claimed build ("Invalid input WebAssembly code ... type mismatch" in `f`) and printed `a` under
claimless. The comparison counts it as a hit. On BN1 it prints `a` under both builds. The
witness: `type A = { kind: "a", x: i32 }`, `type B = { kind: "b", y: string }`, and
`function f(b: A | B): string { if b.kind == "a" { return b.kind }; return "other" }`, called on
`{ kind: "a", x: 1 }`.

**Limit.** A hit needs a population member with the shape. A zero says nothing about shapes
the three populations lack.

## Result on master 2934a520 (compiler = BN1)

The claimed seed is a fixpoint of 7,103,690 bytes. The claimless seed is 7,104,029 bytes, built
by that fixpoint with `ir-identity.sh`'s `claimless()` awk.

| population | programs | run claimless | hits |
| --- | --- | --- | --- |
| census matrix | 180 | 180 | 0 |
| census sab | 20 | 10 | 0 |
| census A | 150,224 | 119,891 | 0 |
| census B | 28,590 | 21,810 | 0 |
| census C | 43,200 | 35,325 | 0 |
| census D | 9,000 | 7,864 | 0 |
| census E | 19,224 | 18,756 | 0 |
| capability probes | 281 | 280 | 0 |
| witnesses, both inventories | 4,984 | 4,953 | 0 |

No census cell moved class in any block. sab's 4 `runs but wrong value` sabotage cells read the
same on both seeds, so the grader still fires that class. The witnesses include D17048's and
D17049's.

Wall time on a 4-core box, alone, at `JOBS=4`: about 20 minutes of census grading per seed
(block A is 60% of the cells), and about 5 minutes for the probes and witnesses on both seeds.
A VERIFY may run between populations, never during one: a paused grade fires `timeout` falsely.

## Rerunning it

Run from a checkout of the candidate, with `build/vl-compiler.wasm` holding the candidate's
fixpoint seed (`refresh-compiler.sh` until a second run is byte-identical) and the candidate's
own host at `scripts/vl-host/target/release/vl`. `O` is a scratch directory outside the tree.

```bash
set -u
O=${O:?scratch dir}; mkdir -p "$O"; export TMPDIR=$O/tmp VL_STD=$PWD/std; mkdir -p "$TMPDIR"
V=$PWD/scripts/vl-host/target/release/vl
cp build/vl-compiler.wasm "$O/claimed.wasm"
# The claimless compiler: ir-identity.sh's claimless() awk, built by the claimed seed.
rm -rf "$O/c0"; cp -r compiler "$O/c0"
awk '
  /^const CLAIMED: IrFamily\[\] = \[$/ { print "const CLAIMED: IrFamily[] = []"; skip = 1; hit = 1; next }
  skip && /^\]$/ { skip = 0; next }
  !skip { print }
  END { if (!hit) { print "CLAIMED not found" > "/dev/stderr"; exit 1 } }
' compiler/ir_build.vl > "$O/c0/ir_build.vl"
"$V" build "$O/c0/entry.vl" -o "$O/claimless.wasm" --compiler "$O/claimed.wasm" > /dev/null
rm -rf "$O/c0"
printf 'print(1)\n' > "$O/warm.vl"   # prewarm each seed's .cwasm before any fan-out
for seed in claimed claimless; do "$V" run "$O/warm.vl" --compiler "$O/$seed.wasm" > /dev/null; done

# 1. The census: generate once, grade per block under both seeds, delta per block.
C=$O/census; mkdir -p "$C"
"$V" run scripts/silent-sweep/census/mkmatrix.vl -- "$C/matrix" > /dev/null
"$V" run scripts/silent-sweep/census/sabcensus.vl -- "$C/sab" > /dev/null
for B in A B C D E; do "$V" run scripts/silent-sweep/census/gencensus.vl -- "$C/cells$B" --block $B > /dev/null; done
for d in matrix sab cellsA cellsB cellsC cellsD cellsE; do
  for seed in claimless claimed; do
    JOBS=4 "$V" run scripts/silent-sweep/census/gradecensus.vl -- "$C/$d" "$O/$seed.wasm" "$C/$d.$seed.json" > "$C/$d.$seed.log" 2>&1
  done
  "$V" run scripts/silent-sweep/census/delta.vl -- "$C/$d" "$C/$d.claimless.json" "$C/$d.claimed.json" > "$C/$d.delta"
  sed -n 1,6p "$C/$d.delta"   # the deciding lines: `runs` lost, moved INTO a silent class
done

# 2 and 3. The probes, then the witnesses, each under both seeds.
P=$O/progs; mkdir -p "$P/probes" "$P/wits"
cp scripts/capability-probes/*.vl "$P/probes/"
"$V" run scripts/ir-i8-census/witnesses.vl --compiler "$O/claimed.wasm" -- "$P/wit" docs/internals/inventory docs/internals/inventory-2 > "$P/wit.list"
while read -r f; do cp "$f" "$P/wits/$(printf '%s' "${f#"$P/wit/"}" | tr / _)"; done < "$P/wit.list"
for pop in probes wits; do
  for seed in claimless claimed; do
    mkdir -p "$P/$pop.$seed"
    ls "$P/$pop"/*.vl | xargs -n 200 sh -c 'v=$0; out=$1; seed=$2; shift 2; timeout 1200 "$v" run --batch --out-dir "$out" "$@" --compiler "$seed" > /dev/null 2>&1; true' "$V" "$P/$pop.$seed" "$O/$seed.wasm"
  done
  hits=0; runs=0
  for f in "$P/$pop"/*.vl; do
    b=$(basename "$f")
    [ -f "$P/$pop.claimless/$b.out" ] && [ ! -f "$P/$pop.claimless/$b.err" ] || continue
    runs=$((runs + 1))
    if [ -f "$P/$pop.claimed/$b.err" ] || ! cmp -s "$P/$pop.claimless/$b.out" "$P/$pop.claimed/$b.out"; then
      hits=$((hits + 1)); echo "HIT $pop $b"
    fi
  done
  echo "$pop: $hits hits of $runs that run claimless"
done
```

Before trusting a zero, run the control. Take a seed from before a known claim soundness break
(D17048's witness above, on a pre-#9567 seed), and check that the probe-and-witness comparison
reports it as a hit.
