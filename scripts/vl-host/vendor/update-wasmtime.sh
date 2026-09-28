#!/usr/bin/env bash
# Re-vendors the `wasmtime` crate at VERSION with VL's patch (vendor/wasmtime.patch) applied.
#
#   scripts/vl-host/vendor/update-wasmtime.sh 47.0.2      # rebuild vendor/wasmtime from the registry
#   scripts/vl-host/vendor/update-wasmtime.sh --diff      # rewrite wasmtime.patch from vendor/wasmtime
#
# The patch is the heap-growth policy `Config::gc_heap_grow_with_live_set` (plumb PL-065),
# kept until upstream grows a copying heap with its live set:
# docs/internals/perf/gc-heap-policy-2026-09.md §4. To upgrade wasmtime, bump `wasmtime` in
# Cargo.toml, run this with the new version, and fix any hunk that no longer applies.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
host="$(dirname "$here")"
version="${1:?usage: update-wasmtime.sh VERSION | --diff}"

pristine() {
  local v="$1" dir
  (cd "$host" && cargo fetch -q) || true
  dir="$(ls -d "${CARGO_HOME:-$HOME/.cargo}"/registry/src/*/"wasmtime-$v" 2>/dev/null | head -1)"
  [ -n "$dir" ] || { echo "wasmtime $v is not in the cargo registry (cargo fetch it first)" >&2; exit 1; }
  echo "$dir"
}

if [ "$version" = "--diff" ]; then
  v="$(sed -n 's/^version = "\(.*\)"$/\1/p' "$here/wasmtime/Cargo.toml" | head -1)"
  src="$(pristine "$v")"
  (cd "$here" && diff -ruN --exclude=.cargo-ok "$src" wasmtime |
    sed -e '/^diff /d' -e "s|^--- $src/\([^	]*\).*|--- a/\1|" -e "s|^+++ wasmtime/\([^	]*\).*|+++ b/\1|") \
    > "$here/wasmtime.patch" || true
  echo "wrote $here/wasmtime.patch against wasmtime $v"
  exit 0
fi

src="$(pristine "$version")"
rm -rf "$here/wasmtime"
cp -r "$src" "$here/wasmtime"
chmod -R u+w "$here/wasmtime"
rm -f "$here/wasmtime/.cargo-ok"
patch -d "$here/wasmtime" -p1 --no-backup-if-mismatch < "$here/wasmtime.patch"
echo "vendored wasmtime $version with wasmtime.patch applied"
