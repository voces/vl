#!/usr/bin/env bash
# Is `vl check` LINEAR in file length? Four sizes of the same generated shape,
# each doubling. A ratio near 2 is linear; near 4 is quadratic in lines. Run on
# an idle box and read the RATIO — process start (~5 ms) is subtracted out by
# the doubling, and box load multiplies every arm alike.
#   scripts/perf/check-scaling.sh [reps]
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
R="${1:-3}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-scale.XXXXXX"); trap 'rm -rf "$T"' EXIT
echo "load: $(uptime | sed 's/.*average/avg/')"
printf '%-10s %7s %9s %7s\n' shape N best ratio
gen() { # shape n file
  : > "$3"; local i=0
  [ "$1" = calls ] && echo 'function g(a: i32, b: i32): i32 { a + b }' >> "$3"
  while [ "$i" -lt "$2" ]; do
    case "$1" in
      funcs)  echo "function f$i(a: i32, b: i32): i32 { const c = a + b; c * 2 }";;
      types)  echo "type T$i = { a$i: i32, b$i: string }";;
      calls)  echo "const v$i = g($i, $i)";;
    esac >> "$3"
    i=$((i + 1))
  done
  return 0
}
for shape in funcs types calls; do
  prev=""
  for n in 1000 2000 4000 8000; do
    gen "$shape" "$n" "$T/x.vl"
    best=999
    for _ in $(seq "$R"); do
      s=$(date +%s.%N); "$V" check "$T/x.vl" --compiler build/vl-compiler.wasm >/dev/null 2>&1
      e=$(date +%s.%N); best=$(echo "$e - $s; $best" | bc | sort -g | head -1)
    done
    r=""; [ -n "$prev" ] && r=$(echo "scale=2; $best / $prev" | bc)
    printf '%-10s %7d %9.3f %7s\n' "$shape" "$n" "$best" "${r:--}"
    prev="$best"
  done
done
echo "(2 = linear, 4 = quadratic)"
echo "load: $(uptime | sed 's/.*average/avg/')"
