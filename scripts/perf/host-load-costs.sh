#!/usr/bin/env bash
# PART C: what each HOST pays to get the seed executable, and the deep-`is`
# gate's own witness. The Rust host deserializes a 16 MB `.cwasm`; the Deno/JS
# host has no sidecar and hands V8 the 1.8 MB wasm on every process.
#   scripts/perf/host-load-costs.sh
set -u
cd "$(dirname "$0")/../.."
export VL_STD="$PWD/std"
V=./scripts/vl-host/target/release/vl
T=$(mktemp -d "${TMPDIR:-/tmp}/b7z-host.XXXXXX"); trap 'rm -rf "$T"' EXIT
echo "load: $(uptime | sed 's/.*average/avg/')"
echo "== rust host, warm sidecar (VL_PROFILE phases)"
printf 'print(1)\n' > "$T/t.vl"
VL_PROFILE=1 "$V" run "$T/t.vl" --compiler build/vl-compiler.wasm 2>&1 | grep profile
echo "== deno/V8 host: compile + instantiate the same seed, 3x"
cat > "$T/p.ts" <<'EOF'
const b = Deno.readFileSync(Deno.args[0]);
for (let k = 0; k < 3; k++) {
  let t = performance.now();
  const m = new WebAssembly.Module(b);
  const tc = performance.now() - t;
  t = performance.now();
  new WebAssembly.Instance(m, {});
  console.log(`compile ${tc.toFixed(0)} ms   instantiate ${(performance.now() - t).toFixed(0)} ms`);
}
EOF
deno run -A "$T/p.ts" build/vl-compiler.wasm
echo "== deep-\`is\` gate fires? (rc 0 means the walker was generated + spliced)"
cat > "$T/d.vl" <<'EOF'
type Json = null | boolean | f64 | string | Json[] | { [string]: Json }
type Cfg = { port: i32 }
const r: Json = null
if r is Cfg { print(r.port) } else { print(0) }
EOF
"$V" run "$T/d.vl" --compiler build/vl-compiler.wasm; echo "rc=$?"
echo "load: $(uptime | sed 's/.*average/avg/')"
