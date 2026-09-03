#!/usr/bin/env bash
# PART D: what `s = s + piece` in a loop costs today. Two programs building the
# SAME string: pairwise `+` in a loop, and std's hand-rolled code-point builder
# (`str.join`). Doubling N doubles the builder and QUADRUPLES the `+` loop if
# concat is O(len) per step, so the RATIO column is the complexity class — box
# load multiplies both arms and cancels. Run it on a quiet box anyway.
#   scripts/perf/string-build-bench.sh [outdir]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
OUT="${1:-${TMPDIR:-/tmp}/b7z-strbench}"; mkdir -p "$OUT"
gen_plus() { cat > "$OUT/plus$1.vl" <<EOF
let s = ""
let i = 0
while i < $1 { s = s + "0123456789abcdefghij"; i = i + 1 }
print(s.length)
EOF
}
gen_join() { cat > "$OUT/join$1.vl" <<EOF
import { join } from "std:str"
let parts: string[] = []
let i = 0
while i < $1 { parts.push("0123456789abcdefghij"); i = i + 1 }
print(join(parts, "").length)
EOF
}
echo "load: $(uptime | sed 's/.*average/avg/')"
printf '%-10s %8s %10s %8s\n' shape N best ratio
NS_plus="2000 4000 8000 16000 32000 64000"
NS_join="2000 4000 8000 16000"
for shape in plus join; do
  prev=""
  eval "ns=\$NS_$shape"
  for n in $ns; do
    "gen_$shape" "$n"
    best=999
    for _ in 1 2 3; do
      s=$(date +%s.%N); "$V" run "$OUT/$shape$n.vl" --compiler build/vl-compiler.wasm \
        > "$OUT/$shape$n.out" 2>&1; e=$(date +%s.%N)
      best=$(echo "$e - $s; $best" | bc | sort -g | head -1)
    done
    r=""; [ -n "$prev" ] && r=$(echo "scale=2; $best / $prev" | bc)
    printf '%-10s %8d %10.3f %8s\n' "$shape" "$n" "$best" "${r:--}"
    prev="$best"
  done
done
echo "(ratio = this N against half this N; 2 = linear, 4 = quadratic)"
echo "load: $(uptime | sed 's/.*average/avg/')"
