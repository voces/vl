#!/usr/bin/env bash
# The FIXED cost of a `Deno.test` case, and of a `deno test` PROCESS.
# The corpus oracle registers one test per corpus case (2,786 today), so if the
# per-case harness cost is milliseconds the step is mostly harness, not compiler.
# Three generated files: 0, 2786 empty cases, 2786 cases doing trivial work.
#   scripts/perf/deno-test-overhead.sh [n]
set -u
cd "$(dirname "$0")/../.."
N="${1:-2786}"
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-deno.XXXXXX"); trap 'rm -rf "$T"' EXIT
printf 'Deno.test("one", () => {});\n' > "$T/a_test.ts"
{ echo "for (let i = 0; i < $N; i++) Deno.test(\`t\${i}\`, () => {});"; } > "$T/b_test.ts"
{ echo "for (let i = 0; i < $N; i++) Deno.test(\`t\${i}\`, async () => { await Promise.resolve(i); });"
} > "$T/c_test.ts"
echo "load: $(uptime | sed 's/.*average/avg/')"
for f in a b c; do
  for _ in 1 2; do
    /usr/bin/time -f "$f\twall=%e\tuser=%U\tsys=%S" -o "$T/t" \
      deno test -A --no-check "$T/${f}_test.ts" > "$T/$f.log" 2>&1
    cat "$T/t"
  done
done
echo "(a = 1 test, b = $N sync tests, c = $N async tests)"
echo "load: $(uptime | sed 's/.*average/avg/')"
