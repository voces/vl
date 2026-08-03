// THE VIEW BOUNDS CHECK, PINNED AS A SHAPE — webcraft P1.4.
//
// P1.4 asks that the canonical view loop either HOIST the per-access bound or
// rely on the memory trap, and that whichever it does be STATED so kernel code
// can be written to the fast pattern deliberately. The answer
// (`docs/internals/buffer-design.md` §M) is that it does NEITHER: the check is
// emitted per access and survives every optimizer rung, including
// `--closed-world -O3 --gufa -O3`, even when the loop guard immediately above it
// is the byte-identical comparison.
//
// That answer cannot be pinned by TIMING. On the one-view shapes the checks cost
// nothing measurable — they are perfectly predicted and fit in spare issue slots
// — so a rung that silently started eliminating them, or one that silently
// stopped, would read the same on a stopwatch. What distinguishes "hoisted" from
// "predicted perfectly" is the DISASSEMBLY, so that is what this file counts.
//
// Per kernel source in `bench/buffer-view-bounds/` (4 shapes x 3 spellings),
// built at each of the three rungs, over the flat `wasm-tools print` dump:
//
//   trap    `unreachable` instructions lexically inside at least one `loop`
//   call    `call` / `call_ref` / `return_call` inside at least one `loop`
//   sget    `struct.get` inside at least one `loop` — the view descriptor's own
//           `base` / `length` fields, re-read per access when GUFA cannot fold
//           them. This is the column that explains the SPEED, and it is pinned
//           because §M's whole cost model rests on it.
//
// All three are MODULE-WIDE within loops, which is the honest upper bound and
// the same unit `selfhost_native_release_test.ts` uses for allocation sites: at
// the unoptimized rung the accessors are separate functions, so the loop body
// holds the CALLS and the callee holds the traps; optimized, everything
// reachable is inlined into the loop and the traps appear there. Reading the
// columns together is what makes the transition legible.
//
// "Inside a loop" is loop MEMBERSHIP, not innermost-loop membership, so a value
// the driver reads once per TRIP counts too — that is what the `sget` on the
// `hoist` rows is (three field reads per trip in `axpy-hoist`, none per element).
// The per-ELEMENT reads are the ones §M quotes, and they are read off the
// disassembly directly.
//
// The three spellings are what make each row mean something:
//   view   the fenced canonical (`v[i]`) — one call per access, the check inside
//   buf    the unfenced twin (`Buf.loadF32`) — the same call, NO check
//   hoist  the stated fast pattern — base + count out of the loop, bare intrinsic
//
// A moved cell is a finding either way and must be re-justified here and in
// §M: fewer traps at `-O3` means an optimizer learned to discharge the check
// (which would let §M's statement soften), more means a spelling grew one.
//
// GATING: needs the built binary, the seed, `wasm-opt` (without it `vl build -O3`
// writes the UNOPTIMIZED module and still exits 0 — every rung would read the
// same) and `wasm-tools` on PATH. A missing prerequisite self-ignores rather than
// fails, so read the suite's IGNORED COUNT, not just its pass count.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const haveTool = async (name: string): Promise<boolean> => {
  try {
    const p = await new Deno.Command(name, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return p.success;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const WASM_OPT = `${ROOT}/node_modules/binaryen/bin/wasm-opt`;
const SRC = `${ROOT}/bench/buffer-view-bounds`;

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const haveOpt = exists(WASM_OPT);
const haveWasmTools = await haveTool("wasm-tools");
const ENABLED = haveBin && haveSeed && haveOpt && haveWasmTools;
if (!ENABLED) {
  console.warn(
    `[view-bounds-shape] skipped — ${
      !haveBin
        ? "missing vl binary"
        : !haveSeed
        ? "missing seed wasm"
        : !haveOpt
        ? "missing wasm-opt (run npm ci)"
        : "missing wasm-tools"
    }`,
  );
}

type Counts = { trap: number; call: number; sget: number };
type Row = { none: Counts; O: Counts; O3: Counts };

const c = (trap: number, call: number, sget: number): Counts => ({ trap, call, sget });

// [trap, call, sget] inside loops, per rung.
//
// How to read the `view` rows. At `none` the loop holds only CALLS and 0 traps:
// every access is `"[]"` -> `getF32`, and the two compares live in the callee.
// (The extra call on every `none` row is the driver's own `call <kernel>` inside
// the trip loop.) At `-O` binaryen inlines the void SETTER but not the
// f32-returning getter, so calls fall and the first traps appear. At `-O3`
// everything is inlined and the FULL check is visible in the loop at exactly
// TWO TRAPS PER ACCESS: 4 for a read-modify-write element (`scale`, `rows`), 2
// for a read-only one (`reduce`), 6 for the three-access `axpy`. That column is
// P1.4's answer, and no rung reduces it.
//
// The `sget` column is why the four `-O3` rows do not cost the same. `scale`,
// `reduce` and `rows` each hold ONE view, so every `struct.new` of the view
// shape agrees on both field values and GUFA folds `length` to a constant and
// sinks `base` into a local: 0 per-element field reads, and the check measures
// free. `axpy` holds TWO views whose `base` differs, nothing folds, and binaryen
// does not hoist the (immutable!) field loads out of the loop — 7 per element,
// which is the 3.7x in §M's table.
//
// The `hoist` rows are the control: 0 traps and 0 calls at every rung, because
// the base and the count left the loop and the body is the bare intrinsic (their
// `sget` is per-TRIP, not per element). The `buf` rows isolate the call from the
// check — the same call count as `view` at `none`, 0 traps anywhere.
const TABLE: Record<string, Row> = {
  "scale-view": { none: c(0, 3, 1), O: c(2, 1, 3), O3: c(4, 0, 0) },
  "scale-buf": { none: c(0, 3, 0), O: c(0, 1, 1), O3: c(0, 0, 1) },
  "scale-hoist": { none: c(0, 1, 0), O: c(0, 0, 0), O3: c(0, 0, 0) },
  "reduce-view": { none: c(0, 2, 1), O: c(2, 0, 0), O3: c(2, 0, 0) },
  "reduce-buf": { none: c(0, 2, 0), O: c(0, 0, 1), O3: c(0, 0, 1) },
  "reduce-hoist": { none: c(0, 1, 0), O: c(0, 0, 0), O3: c(0, 0, 0) },
  "axpy-view": { none: c(0, 4, 1), O: c(2, 2, 3), O3: c(6, 0, 7) },
  "axpy-buf": { none: c(0, 4, 0), O: c(0, 2, 1), O3: c(0, 0, 1) },
  "axpy-hoist": { none: c(0, 1, 0), O: c(0, 0, 3), O3: c(0, 0, 3) },
  "rows-view": { none: c(0, 3, 0), O: c(2, 1, 2), O3: c(4, 0, 0) },
  "rows-buf": { none: c(0, 3, 0), O: c(0, 2, 0), O3: c(0, 0, 1) },
  "rows-hoist": { none: c(0, 1, 0), O: c(0, 0, 0), O3: c(0, 0, 0) },
};

const RUNGS: Array<{ name: keyof Row; flag: string | null }> = [
  { name: "none", flag: null },
  { name: "O", flag: "-O" },
  { name: "O3", flag: "-O3" },
];

/** Instructions inside at least one `loop`, over a flat `wasm-tools print` dump. */
const countInLoops = (wat: string): Counts => {
  const OPENERS = new Set(["block", "loop", "if", "try", "try_table"]);
  const stack: string[] = [];
  let loops = 0;
  let trap = 0;
  let call = 0;
  let sget = 0;
  for (const raw of wat.split("\n")) {
    const line = raw.trim();
    if (line.startsWith("(func")) {
      stack.length = 0;
      loops = 0;
      continue;
    }
    const tok = line.split(/[\s(]/)[0];
    if (OPENERS.has(tok)) {
      stack.push(tok);
      if (tok === "loop") loops++;
    } else if (tok === "end") {
      if (stack.pop() === "loop") loops--;
    } else if (loops > 0) {
      if (tok === "unreachable") trap++;
      else if (tok === "call" || tok === "call_ref" || tok === "return_call") call++;
      else if (tok === "struct.get") sget++;
    }
  }
  return { trap, call, sget };
};

const shapeOf = async (fixture: string, flag: string | null): Promise<Counts> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-viewbounds-" });
  try {
    const out = `${dir}/m.wasm`;
    const args = ["build", `${SRC}/${fixture}.vl`, "--compiler", COMPILER, "-o", out];
    if (flag) args.push(flag);
    const b = await new Deno.Command(VL, {
      args,
      // Without this `-O3` finds no wasm-opt, prints a note and writes the
      // UNOPTIMIZED module with exit 0 — three identical rungs, silently.
      env: { VL_WASM_OPT: WASM_OPT },
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!b.success) {
      throw new Error(
        `vl build ${fixture} ${flag ?? "(none)"} exited ${b.code}: ` +
          new TextDecoder().decode(b.stderr).slice(0, 400),
      );
    }
    const d = await new Deno.Command("wasm-tools", {
      args: ["print", out],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (!d.success) throw new Error(`wasm-tools print failed for ${fixture}`);
    return countInLoops(new TextDecoder().decode(d.stdout));
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
};

for (const [fixture, row] of Object.entries(TABLE)) {
  Deno.test({
    name: `view-bounds shape: ${fixture}`,
    ignore: !ENABLED,
    fn: async () => {
      const seen: string[] = [];
      const bad: string[] = [];
      for (const rung of RUNGS) {
        const got = await shapeOf(fixture, rung.flag);
        const want = row[rung.name];
        seen.push(`${rung.name}=[${got.trap},${got.call},${got.sget}]`);
        if (got.trap !== want.trap || got.call !== want.call || got.sget !== want.sget) {
          bad.push(
            `${rung.name}: [trap,call,sget] = [${got.trap},${got.call},${got.sget}], ` +
              `want [${want.trap},${want.call},${want.sget}]`,
          );
        }
      }
      if (bad.length) {
        throw new Error(
          `${fixture} loop shape moved — ${bad.join("; ")}\n` +
            `  observed: ${seen.join(" ")}\n` +
            `  A moved cell is a P1.4 finding: re-derive it from the disassembly and\n` +
            `  re-justify buffer-design.md §M in the same commit.`,
        );
      }
    },
  });
}

// The P1.4 CONTRACT itself, stated as three assertions that hold no matter what
// the exact counts above are. These are what a kernel author is told, so they are
// checked directly rather than inferred from the table.
Deno.test({
  name: "view-bounds contract: fenced checks survive -O3, the fast pattern is bare",
  ignore: !ENABLED,
  fn: async () => {
    for (const shape of ["scale", "reduce", "axpy", "rows"]) {
      const view = await shapeOf(`${shape}-view`, "-O3");
      const buf = await shapeOf(`${shape}-buf`, "-O3");
      const hoist = await shapeOf(`${shape}-hoist`, "-O3");
      // (1) The fence is NOT eliminated by the release profile.
      if (view.trap === 0) {
        throw new Error(
          `${shape}-view has no trap left inside its loop at -O3 — the per-access ` +
            `bounds check was eliminated. That is a real improvement and a real ` +
            `documentation change: buffer-design.md §M and webcraft-requirements.md ` +
            `P1.4 both state that it survives.`,
        );
      }
      // (2) The unfenced twin has no check, so the delta is the fence and nothing else.
      if (buf.trap !== 0) {
        throw new Error(
          `${shape}-buf has ${buf.trap} trap(s) inside its loop at -O3 — the ` +
            `"unfenced twin" is no longer unfenced, so (view - buf) stops measuring ` +
            `the fence.`,
        );
      }
      // (3) The stated fast pattern really is bare: no call and no check.
      if (hoist.trap !== 0 || hoist.call !== 0) {
        throw new Error(
          `${shape}-hoist is not bare at -O3: [trap,call] = [${hoist.trap},${hoist.call}]. ` +
            `The fast pattern documented in §M5 must lower to the intrinsic with ` +
            `nothing per access.`,
        );
      }
    }
  },
});
