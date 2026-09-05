// The view-bounds shape suite's MACHINERY — the fixture table, the loop-membership
// counter and the build-and-disassemble helper. The tests are in
// `vl_buffer_view_bounds_shape_test.ts` (the 18 table rows) and
// `vl_buffer_view_bounds_contract_test.ts` (the P1.4 contract), two files because
// `deno test --parallel` gives one worker per FILE and the contract test alone is
// 4 s of the 18 s they used to take back to back.

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
// MODULE-WIDE also means the `none` column counts every loop-bearing function
// `std:buffer` itself defines, reachable from the kernel or not — the whole
// module is present until an optimizer rung deletes what nothing calls. So a new
// std export with a loop in it moves all eighteen `none` cells by the same
// amount and neither `O` nor `O3` at all, which is the signature to check for
// before reading a move as a codegen finding. `storeBytes`/`loadBytes` did exactly
// that (+3 call, +4 sget): two `struct.get`s each in their copy loop, plus their
// `__trap__("…")` message, whose per-character print loop is what drags the
// string machinery into a kernel that has no strings. At `-O3` the module is
// byte-identical to the one built before they existed.
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

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./tree.ts";

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

export { COMPILER, ROOT, VL };

export const WASM_OPT = `${ROOT}/node_modules/binaryen/bin/wasm-opt`;
export const SRC = `${ROOT}/bench/buffer-view-bounds`;

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const haveOpt = exists(WASM_OPT);
const haveWasmTools = await haveTool("wasm-tools");
export const ENABLED = haveBin && haveSeed && haveOpt && haveWasmTools;
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
// The `sget` column is why the four `-O3` rows do not cost the same, and the
// axis is the INLINING BUDGET, not the view count. `scale`, `reduce` and `rows`
// collapse entirely into their driver — `f32view` is inlined, so Heap2Local
// melts the descriptor and the whole module is left with ONE `struct.new` (the
// Buffer's) and 0 per-element field reads. `axpy` does not collapse: `f32view`
// survives as a callee, so the descriptor is built there and returned, which no
// rung can melt, and every access reloads `base`/`length` — 7 per element.
// Binaryen does not hoist those loads either. The reason is NOT field
// immutability, and this comment used to say it was: every field of every
// declared struct is emitted MUTABLE (`compiler/emit_sections.vl` writes
// `wU8(1) // mutable` unconditionally, and a view module disassembles to
// `(struct (field (mut i32)) (field (mut i32)))`). Making them immutable by hand
// and re-running the release pipeline leaves the identical reload count, so
// mutability is not the axis in either direction. What actually blocks it: LICM
// is not in the release pipeline at all and, run explicitly, only moves TOP-LEVEL
// loop-body statements, never a `struct.get` nested inside the fence's `if`.
// `scale-seedtwice` is the control that separates the two candidate axes.
//
// The `hoist` rows are the control: 0 traps and 0 calls at every rung, because
// the base and the count left the loop and the body is the bare intrinsic (their
// `sget` is per-TRIP, not per element). The `buf` rows isolate the call from the
// check — the same call count as `view` at `none`, 0 traps anywhere.
export const TABLE: Record<string, Row> = {
  "scale-view": { none: c(0, 6, 5), O: c(2, 1, 3), O3: c(4, 0, 0) },
  // Identical to `scale-view` in every cell, which is the POINT: the bracket's
  // extra frame is one level DOWN (`"[]"` calls `getF32`), so a loop-level count
  // cannot see it. It shows up only in the call TARGET and on the clock (§M3(4)).
  "scale-accessor": { none: c(0, 6, 5), O: c(2, 1, 3), O3: c(4, 0, 0) },
  // `scale-view` with its IDEMPOTENT seed helper called twice, and no other
  // difference: one buffer, one view, one column, the same kernel source. The
  // second call site keeps `seed` alive, the module stops collapsing into its
  // driver, `f32view` stops being inlined, and the descriptor that `scale-view`
  // melts away survives — so the `-O3` cell that reads 0 there reads non-zero
  // here, and the kernel runs 3.0x slower (0.445 -> 1.36 ns/element). This row
  // is the evidence that the reload is NOT a "two views of one width" property.
  "scale-seedtwice": { none: c(0, 6, 5), O: c(2, 1, 3), O3: c(4, 0, 5) },
  "scale-buf": { none: c(0, 6, 4), O: c(0, 1, 1), O3: c(0, 0, 1) },
  "scale-hoist": { none: c(0, 4, 4), O: c(0, 0, 0), O3: c(0, 0, 0) },
  "reduce-view": { none: c(0, 5, 5), O: c(2, 0, 0), O3: c(2, 0, 0) },
  "reduce-buf": { none: c(0, 5, 4), O: c(0, 0, 1), O3: c(0, 0, 1) },
  "reduce-hoist": { none: c(0, 4, 4), O: c(0, 0, 0), O3: c(0, 0, 0) },
  "axpy-view": { none: c(0, 7, 5), O: c(2, 2, 3), O3: c(6, 0, 7) },
  // The ATTRIBUTION control (§M4): the same six per-access compares as
  // `axpy-view`, written by hand over a base and an extent hoisted into locals.
  // Six traps and ZERO field reloads per element at `none`; the seventh trap and
  // the four `struct.get`s that appear once optimized are the view CONSTRUCTION
  // check and its field reads, inlined into the driver's TRIP loop — per trip,
  // not per element, which is the limit of a loop-membership counter.
  "axpy-fencedhoist": { none: c(6, 4, 4), O: c(7, 0, 4), O3: c(7, 0, 4) },
  // The control above, as a LIBRARY call rather than six hand-written compares:
  // `getF32At`/`setF32At` shipped in `std:buffer` (webcraft A1). At `none` the
  // traps sit in the callees, so this reads like `axpy-view`; what matters is the
  // `-O3` cell, where the per-element reload is gone (7 -> 4, and those 4 are the
  // view construction in the TRIP loop, exactly as on the `fencedhoist` row) while
  // all six per-access compares survive.
  "axpy-at": { none: c(0, 7, 4), O: c(2, 2, 4), O3: c(6, 0, 4) },
  "axpy-buf": { none: c(0, 7, 4), O: c(0, 2, 1), O3: c(0, 0, 1) },
  "axpy-hoist": { none: c(0, 4, 4), O: c(0, 0, 3), O3: c(0, 0, 3) },
  // ── shape `soa`: webcraft's own six-column integrator (A1) ──────────────────
  // The two-view `axpy` rows UNDERSTATE the reload, because there the per-trip
  // view-construction reads dominate the per-element ones. This pair is the
  // kernel A1 was actually filed on — six columns taken as PARAMETERS, four
  // updates, twelve accesses per element — so `soa-view`'s `sget` is per-element
  // and nothing else: 24, being two descriptor fields times twelve accesses.
  //
  // `soa-at` is the same kernel over the hoisted accessors. Its per-ELEMENT
  // reload count is ZERO; the 12 it reports are the six bases and six lengths
  // taken once at the top of the tick, which the driver's TRIP loop lexically
  // contains — the same loop-membership limit called out on `axpy-fencedhoist`.
  // Both rows keep all 24 traps at `-O3`, which is the point: the fence is not
  // what costs.
  "soa-view": { none: c(0, 16, 4), O: c(0, 12, 1), O3: c(24, 0, 25) },
  "soa-at": { none: c(0, 16, 4), O: c(0, 12, 12), O3: c(24, 0, 12) },
  "rows-view": { none: c(0, 6, 4), O: c(2, 1, 2), O3: c(4, 0, 0) },
  "rows-buf": { none: c(0, 6, 4), O: c(0, 2, 0), O3: c(0, 0, 1) },
  "rows-hoist": { none: c(0, 4, 4), O: c(0, 0, 0), O3: c(0, 0, 0) },
};

export const RUNGS: Array<{ name: keyof Row; flag: string | null }> = [
  { name: "none", flag: null },
  { name: "O", flag: "-O" },
  { name: "O3", flag: "-O3" },
];

/** Instructions inside at least one `loop`, over a flat `wasm-tools print` dump. */
export const countInLoops = (wat: string): Counts => {
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

export const shapeOf = async (fixture: string, flag: string | null): Promise<Counts> => {
  const dir = await Deno.makeTempDir({ prefix: "vl-viewbounds-" });
  try {
    const out = `${dir}/m.wasm`;
    const args = ["build", `${SRC}/${fixture}.vl`, "--compiler", COMPILER, "-o", out];
    if (flag) args.push(flag);
    const b = await new Deno.Command(VL, {
      args,
      // Without this `-O3` finds no wasm-opt, prints a note and writes the
      // UNOPTIMIZED module with exit 0 — three identical rungs, silently.
      env: nativeEnv({ VL_WASM_OPT: WASM_OPT }),
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
