#!/usr/bin/env bash
# The MONOMORPHIZATION type-parameter grid — every constructor a type parameter can sit
# behind, at every position that reaches a different emitter path, over three reps.
#
# WHAT IT IS FOR. `monoSubstAnn` rebuilds a type SPELLING per generic instance, and a
# rebuilt spelling is a second intern key (that function's own header says so). The failure
# it produces is not a diagnostic: the emitter resolves a type-parameter name through the
# NOMINAL path and emits a module that `vl check --codegen` accepts and wasmtime refuses.
# Four such holes were closed in #1473/#1475; the corpus contained NONE of them, because
# every corpus generic annotates the shape that hides the bug.
#
# THE SABOTAGE IS PART OF THE TOOL, not a footnote. A grid that reports 0 BAD proves
# nothing until it has been shown to report BAD on a compiler that has the bug. Pass a
# pre-#1475 seed as $2 and the six `par_gaarr_*` / `par_gaargarr_*` cells MUST come back
# BAD; if they do not, the grid has drifted away from the class it exists to cover. An
# earlier version of this grid reported a clean 0 BAD against that same seed — its
# alias-application cells used a SCALAR-bodied alias (`{ v: X }`) where the hole needs an
# ARRAY-bodied one (`{ v: X[] }`), so it was blind to the very bug it was written for.
#
# The constructor list GREW once, and should grow again the same way: the original twelve
# reported 0 BAD while `{[string]: T}` — a map whose VALUE is a type parameter — was
# check-clean invalid wasm and had been since long before the programme. A grid is only ever
# evidence about the cells it contains. When a new hole is found by hand, add its constructor
# here so the next run covers it.
#
# Usage:  scripts/mono-tyaram-grid.sh [OUTDIR] [COMPILER_WASM]
#   OUTDIR         defaults to a mktemp dir
#   COMPILER_WASM  defaults to build/vl-compiler.wasm; pass an older seed to sabotage
#
# Buckets: OK (compiles + runs), REJECT (a loud diagnostic — acceptable), BAD (invalid
# wasm or an out-of-bounds compiler crash). Only BAD is a defect.
set -euo pipefail
cd "$(dirname "$0")/.."
VL="${VL:-scripts/vl-host/target/release/vl}"
OUT="${1:-$(mktemp -d)}"
COMP="${2:-build/vl-compiler.wasm}"
[ -x "$VL" ] || { echo "missing vl binary: $VL" >&2; exit 1; }
mkdir -p "$OUT/cells"

python3 - "$OUT/cells" <<'PY'
import sys
d = sys.argv[1]
reps = {"i32": "1", "string": '"a"', "f64": "1.5"}
# name: (preamble, annotation, build-from-%V%, reduce-from-r)
ctors = {
 "bare":     ("",                                 "T",                   "%V%",         "1"),
 "arr":      ("",                                 "T[]",                 "[%V%]",       "r.length"),
 "arr2":     ("",                                 "T[][]",               "[[%V%]]",     "r.length"),
 "shape":    ("",                                 "{ a: T }",            "{ a: %V% }",  "1"),
 "inlarr":   ("",                                 "{ g: T[] }",          "{ g: [%V%] }","r.g.length"),
 "inlparen": ("",                                 "{ g: (T | null)[] }", "{ g: [%V%] }","r.g.length"),
 "nul":      ("",                                 "T | null",            "%V%",         "1"),
 "fn":       ("",                                 "(T) => T",            "(x: T) => x", "1"),
 "ga":       ("type BoxS<X> = { v: X }\n",        "BoxS<T>",             "{ v: %V% }",  "1"),
 "gaarr":    ("type BoxA<X> = { v: X[] }\n",      "BoxA<T>",             "{ v: [%V%] }","r.v.length"),
 "gaargarr": ("type BoxG<X> = { v: X }\n",        "BoxG<T[]>",           "{ v: [%V%] }","r.v.length"),
 "gapnul":   ("type BoxN<X> = { v: X | null }\n", "BoxN<T>",             "{ v: %V% }",  "1"),
 # Added after the widened sweep that found the map-value hole: every one of these is a
 # constructor the original twelve did not reach, and `mapval` is the cell that was BAD.
 "twoparam": ("type Pr<A, B> = { a: A, b: B }\n",  "Pr<T, i32>",          "{ a: %V%, b: 1 }",   "1"),
 "appofapp": ("type C<X> = { v: X }\n",            "C<C<T>>",             "{ v: { v: %V% } }",  "1"),
 "apparr":   ("type C<X> = { v: X }\n",            "C<T>[]",              "[{ v: %V% }]",       "r.length"),
 "arrapp":   ("type CA<X> = { v: X[] }\n",         "CA<T>",               "{ v: [%V%] }",       "r.v.length"),
 "mapval":   ("",                                   "{[string]: T}",       "Map()",              "1"),
 "unionpar": ("",                                   "T | i32",             "%V%",                "1"),
 "nulapp":   ("type CN<X> = { v: X }\n",           "CN<T> | null",        "{ v: %V% }",         "1"),
 "fnret":    ("",                                   "() => T",             "() => %V%",          "1"),
 "arrfn":    ("",                                   "((T) => T)[]",        "[(x: T) => x]",      "r.length"),
 "shapefn":  ("",                                   "{ f: (T) => T }",     "{ f: (x: T) => x }", "1"),
 "deepshape":("",                                   "{ a: { b: { c: T } } }","{ a: { b: { c: %V% } } }","1"),
 "arrnulapp":("type CX<X> = { v: X }\n",           "(CX<T> | null)[]",    "[{ v: %V% }]",       "r.length"),
 # Added after the deep-composition sweep. The map-value hole showed that a constructor the
 # grid does not spell is a constructor it cannot clear, and every one of these nests a map
 # or a union one level further than anything above.
 "maparr":   ("",                                   "{[string]: T}[]",     "[Map()]",            "r.length"),
 "arrmap":   ("",                                   "{[string]: T[]}",     "Map()",              "1"),
 "mapmap":   ("",                                   "{[string]: {[string]: T}}","Map()",         "1"),
 "arr2un":   ("",                                   "(T | null)[][]",      "[[%V%]]",            "r.length"),
 "mapapp":   ("type CM<X> = { v: X }\n",           "{[string]: CM<T>}",   "Map()",              "1"),
}
n = 0
for rname, lit in reps.items():
    for cname, (pre, ann, build, red) in ctors.items():
        bv = build.replace("%V%", "v")   # inside the generic the parameter is `v`
        bl = build.replace("%V%", lit)   # at the call site, a literal
        n += 1; open(f"{d}/ret_{cname}_{rname}.vl", "w").write(
            f"{pre}function f<T>(v: T): {ann} {{\n  {bv}\n}}\n\nconst r = f({lit})\nprint({red})\n")
        n += 1; open(f"{d}/loc_{cname}_{rname}.vl", "w").write(
            f"{pre}function f<T>(v: T): i32 {{\n  const r: {ann} = {bv}\n  1\n}}\n\nprint(f({lit}))\n")
        n += 1; open(f"{d}/par_{cname}_{rname}.vl", "w").write(
            f"{pre}function f<T>(v: {ann}): i32 {{\n  1\n}}\n\nprint(f({bl}))\n")
print(f"generated {n} cells", file=sys.stderr)
PY

: > "$OUT/results.txt"
for f in "$OUT"/cells/*.vl; do
  "$VL" check --codegen "$f" --compiler "$COMP" >/dev/null 2>&1 && c=0 || c=$?
  out="$("$VL" run "$f" --compiler "$COMP" 2>&1 || true)"
  if printf '%s' "$out" | grep -q "Invalid input WebAssembly\|index outside the bounds"; then k=BAD
  elif printf '%s' "$out" | grep -q "^Error:"; then k=REJECT
  else k=OK; fi
  printf '%s\t%s\tcheck=%s\n' "$k" "$(basename "$f" .vl)" "$c" >> "$OUT/results.txt"
done

sort -o "$OUT/results.txt" "$OUT/results.txt"
echo "== mono type-parameter grid ($COMP) =="
cut -f1 "$OUT/results.txt" | sort | uniq -c
if grep -q "^BAD" "$OUT/results.txt"; then
  echo "BAD cells (check-clean invalid wasm / compiler crash):"
  grep "^BAD" "$OUT/results.txt" | sed 's/^/  /'
  exit 1
fi
echo "no BAD cells ✅  (results: $OUT/results.txt)"
