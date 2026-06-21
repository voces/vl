#!/usr/bin/env bash
# Dogfood: lint the compiler's OWN VL source with `vl check` — `vl` polices the
# code it's compiled from (the kill-TS endgame). Gated at `info`, so a
# `prefer-const` opportunity, an unused binding/function, or any warning/error in
# our source fails CI.
#
# The compiler is a CONCATENATION (the sed-rename + cat assembly that
# refresh-compiler.sh / native-fixpoint.sh use), so we lint the WHOLE assembled
# program as one unit rather than per file: the driver and cli.vl reference
# globals from across the assembly and don't type-check standalone, and a
# whole-program pass keeps cross-file reassignments visible (so `prefer-const`
# doesn't false-positive on an exported global the driver rebinds). `std/` is
# linted as ordinary modules. `tests/` — the corpus of deliberately-malformed
# fixtures — is excluded by construction (never assembled, never passed in).
#
# A failure prints positions against the assembled file; to get source-file
# positions while developing, run `vl check <file.vl>` (or `vl check compiler/`).
#
# fmt IS gated here too (below): `vl fmt --check` over the source `.vl`
# (compiler/, std/, scripts/) — the directory walk only visits `.vl`, so the
# `.ts`/`.sh` alongside scripts/ are ignored. `tests/` is excluded by
# construction (the deliberately-malformed fixture corpus is never fmt-clean and
# is not source we ship). Unlike the lint above, fmt is PER-FILE (it needs no
# cross-file resolution), so the real source files are checked directly.
set -euo pipefail
cd "$(dirname "$0")/.."

VL="${VL:-scripts/vl-host/target/release/vl}"
[ -x "$VL" ] || { echo "missing vl binary: $VL (cd scripts/vl-host && cargo build --release)"; exit 1; }
[ -f build/vl-compiler.wasm ] || { echo "missing seed: build/vl-compiler.wasm (scripts/refresh-compiler.sh)"; exit 1; }

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# The compiler is a real module graph now — lint it through its entry, so the
# checker resolves `import`/`export` across the modules exactly as a build does.
echo "== self-lint: the compiler module graph =="
"$VL" check compiler/entry.vl --severity info

echo "== self-lint: std/ =="
"$VL" check std/ --severity info

# fmt gate: the source tree must be `vl fmt`-clean. `--check` exits non-zero on
# any drift (set -e fails the run), naming the offending file on stderr. tests/
# is NOT passed in.
echo "== fmt-check: compiler/ std/ scripts/ =="
"$VL" fmt --check compiler/
"$VL" fmt --check std/
"$VL" fmt --check scripts/

echo "self-lint + fmt-check clean ✅"
