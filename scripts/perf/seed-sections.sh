#!/usr/bin/env bash
# Section sizes of the seed, and its growth over the last N days of master.
# The seed is JIT/deserialize input for every `vl` process in ci-native, so its
# size is a per-process cost, not just a download.
#   scripts/perf/seed-sections.sh [seed.wasm]
set -u
cd "$(dirname "$0")/../.."
SEED="${1:-build/vl-compiler.wasm}"
DIS=./node_modules/.bin/wasm-dis
echo "seed: $SEED  $(wc -c < "$SEED") bytes"
python3 - "$SEED" <<'PY'
import sys, struct
NAMES = {0:"custom",1:"type",2:"import",3:"function",4:"table",5:"memory",6:"global",
         7:"export",8:"start",9:"elem",10:"code",11:"data",12:"datacount",13:"tag"}
b = open(sys.argv[1], "rb").read()
i = 8
rows = []
def uleb(i):
    n = s = 0
    while True:
        c = b[i]; i += 1; n |= (c & 0x7f) << s; s += 7
        if not c & 0x80: return n, i
while i < len(b):
    sid = b[i]; sz, j = uleb(i + 1)
    nm = NAMES.get(sid, str(sid))
    if sid == 0:
        ln, k = uleb(j)
        nm = "custom:" + b[k:k + ln].decode("utf8", "replace")
    rows.append((sz, nm)); i = j + sz
tot = sum(r[0] for r in rows)
for sz, nm in sorted(rows, reverse=True):
    print(f"{sz:10d}  {100 * sz / tot:5.1f}%  {nm}")
print(f"{tot:10d}  100.0%  TOTAL (sections)")
PY
echo "--- function count / type count"
"$DIS" "$SEED" 2>/dev/null | grep -c "^ (func " || true
