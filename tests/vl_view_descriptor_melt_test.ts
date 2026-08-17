// WHY THE VIEW DESCRIPTOR IS RE-READ PER ELEMENT — the limit, pinned.
//
// `buffer-design.md` §M4 measures a fenced two-view kernel at 3.0x a hoisted one
// and attributes ~90% of the excess to the view descriptor's `base`/`length`
// being reloaded from the struct once per access. The obvious repair — have the
// emitter hoist those reads out of the loop ("backing-pointer LICM") — was filed
// as an open item. It does not work, for two independent reasons that this file
// pins so the next re-deriver does not re-open it.
//
// 1. BINARYEN WILL NOT HOIST THE SHAPE THE EMITTER PRODUCES. The reads are
//    loop-invariant, the field is IMMUTABLE in the optimized type, the reference
//    is non-nullable so the read cannot trap, and the loop allocates nothing —
//    every precondition a mover could want. Binaryen still leaves them in, at
//    every rung, because (a) its `licm` pass is not in the release pipeline and
//    (b) run explicitly it only moves TOP-LEVEL statements of the loop body,
//    never a `struct.get` nested inside the fence's `if`. The probe below is two
//    functions identical except for that nesting: `--licm` alone hoists all
//    three reads out of the top-level one and none out of the nested one.
//
// 2. THE EMITTER CANNOT REACH SIX OF THE SEVEN READS. Only ONE of `axpy-view`'s
//    seven per-element reads is written in the user's function (`i < y.length`
//    in the loop guard). The other six are inside `std:buffer`'s `getF32` /
//    `setF32` and enter the loop only after binaryen inlines them, which happens
//    long after the emitter is done. Hand-hoisting just the reachable one is
//    worth 2.9% of 3.0x.
//
// What DOES remove them is letting binaryen inline the descriptor CONSTRUCTOR
// into the function that owns the loop, after which Heap2Local melts the struct
// and there is nothing left to read. That is the third assertion here, and it is
// also why the cost is a whole-program property: it is decided by the inlining
// budget, not by how many views the loop touches. The global lever for it
// (`--always-inline-max-function-size`) is measured and NOT taken — at the value
// that melts this kernel it costs the 1.16 MB compiler module +82% of its size
// and +127% of its `wasm-opt` wall time. See §M4.
//
// GATING: needs the built binary, the seed, `wasm-opt` and `wasm-tools`. A
// missing prerequisite self-ignores rather than fails, so read the suite's
// IGNORED COUNT, not just its pass count.

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
    `[view-descriptor-melt] skipped — ${
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

/** The host's own binaryen feature list (`main.rs` BINARYEN_FEATURES). Without
 * these `wasm-opt` rejects every VL module as using disallowed types. */
const FEATURES = [
  "--enable-reference-types",
  "--enable-gc",
  "--enable-bulk-memory",
  "--enable-tail-call",
];

/** The host's `vl build -O3` flag set (`main.rs` RELEASE_PASSES). */
const RELEASE = ["--closed-world", "-O3", "--gufa", "-O3"];

const run = async (cmd: string, args: string[]): Promise<string> => {
  const p = await new Deno.Command(cmd, { args, stdout: "piped", stderr: "piped" }).output();
  if (!p.success) {
    throw new Error(
      `${cmd} ${args.join(" ")} exited ${p.code}: ` +
        new TextDecoder().decode(p.stderr).slice(0, 400),
    );
  }
  return new TextDecoder().decode(p.stdout);
};

/** `struct.get`s lexically inside at least one `loop`, keyed by the function's
 * own printed wasm index (imports occupy the low indices and never appear here),
 * over a flat `wasm-tools print` dump. Same loop-MEMBERSHIP unit as
 * `vl_buffer_view_bounds_shape_test.ts`. */
const sgetsInLoopsByFunc = (wat: string): Map<number, number> => {
  const OPENERS = new Set(["block", "loop", "if", "try", "try_table"]);
  const per = new Map<number, number>();
  let stack: string[] = [];
  let loops = 0;
  let cur = -1;
  for (const raw of wat.split("\n")) {
    const line = raw.trim();
    const head = /^\(func (?:\$\S+ )?\(;(\d+);\)/.exec(line);
    if (head) {
      stack = [];
      loops = 0;
      cur = Number(head[1]);
      per.set(cur, 0);
      continue;
    }
    const tok = line.split(/[\s(]/)[0];
    if (OPENERS.has(tok)) {
      stack.push(tok);
      if (tok === "loop") loops++;
    } else if (tok === "end") {
      if (stack.pop() === "loop") loops--;
    } else if (loops > 0 && tok === "struct.get" && cur >= 0) {
      per.set(cur, (per.get(cur) ?? 0) + 1);
    }
  }
  return per;
};

const sgetsInLoops = (wat: string): number => {
  let n = 0;
  for (const v of sgetsInLoopsByFunc(wat).values()) n += v;
  return n;
};

const structNews = (wat: string): number =>
  wat.split("\n").filter((l) => l.trim().startsWith("struct.new")).length;

// ── 1. the binaryen limit ──────────────────────────────────────────────────
//
// Two functions over the same immutable two-field struct, differing ONLY in
// where the loop-invariant reads sit: `$nested` reads them inside the `if` that
// the fence produces (what the VL emitter emits), `$toplevel` reads them into
// locals as top-level statements of the loop body (what binaryen's LICM is
// written to move). The field values come from an import so nothing is
// GUFA-constant, and `--no-inline` keeps the two shapes distinguishable.
const PROBE = `(module
  (import "e" "n" (func $n (result i32)))
  (memory 1)
  (type $v (struct (field i32) (field i32)))
  (func $nested (param $y (ref $v)) (param $x (ref $v))
    (local $i i32)
    (loop $L
      (if (i32.lt_s (local.get $i) (struct.get $v 1 (local.get $y)))
        (then
          (f32.store
            (i32.add (struct.get $v 0 (local.get $y))
                     (i32.shl (local.get $i) (i32.const 2)))
            (f32.load
              (i32.add (struct.get $v 0 (local.get $x))
                       (i32.shl (local.get $i) (i32.const 2)))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)))))
  (func $toplevel (param $y (ref $v)) (param $x (ref $v))
    (local $i i32) (local $a i32) (local $b i32) (local $c i32)
    (loop $L
      (local.set $a (struct.get $v 1 (local.get $y)))
      (local.set $b (struct.get $v 0 (local.get $y)))
      (local.set $c (struct.get $v 0 (local.get $x)))
      (if (i32.lt_s (local.get $i) (local.get $a))
        (then
          (f32.store
            (i32.add (local.get $b) (i32.shl (local.get $i) (i32.const 2)))
            (f32.load
              (i32.add (local.get $c) (i32.shl (local.get $i) (i32.const 2)))))
          (local.set $i (i32.add (local.get $i) (i32.const 1)))
          (br $L)))))
  (func (export "go")
    (local $y (ref null $v)) (local $x (ref null $v))
    (local.set $y (struct.new $v (call $n) (call $n)))
    (local.set $x (struct.new $v (call $n) (call $n)))
    (call $nested (ref.as_non_null (local.get $y)) (ref.as_non_null (local.get $x)))
    (call $toplevel (ref.as_non_null (local.get $y)) (ref.as_non_null (local.get $x)))))
`;

// [nested, toplevel] `struct.get`s left inside the loop, per pipeline. The
// `licm` row is the LIVE CONTROL: it is the one cell that moves, which is what
// proves the counter and the pipeline are doing anything at all.
const LICM_ROWS: Array<{ name: string; passes: string[]; want: [number, number] }> = [
  { name: "(no passes)", passes: ["--closed-world"], want: [3, 3] },
  { name: "-O", passes: ["--closed-world", "-O"], want: [3, 3] },
  { name: "-O3 (release profile)", passes: RELEASE, want: [3, 3] },
  { name: "release + --licm", passes: [...RELEASE, "--licm"], want: [3, 3] },
  { name: "--licm alone", passes: ["--closed-world", "--licm"], want: [3, 0] },
];

Deno.test({
  name: "descriptor melt: binaryen hoists a loop-invariant struct.get only at the loop's TOP LEVEL",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-descmelt-" });
    try {
      const wat = `${dir}/probe.wat`;
      const src = `${dir}/probe.wasm`;
      await Deno.writeTextFile(wat, PROBE);
      await run("wasm-tools", ["parse", wat, "-o", src]);
      const bad: string[] = [];
      for (const row of LICM_ROWS) {
        const out = `${dir}/o.wasm`;
        await run(WASM_OPT, [...FEATURES, "--no-inline=*", ...row.passes, src, "-o", out]);
        const per = sgetsInLoopsByFunc(await run("wasm-tools", ["print", out]));
        // wasm function indices: 0 = the imported `n`, 1 = $nested, 2 = $toplevel,
        // 3 = the exported driver. A missing entry reports as -1 rather than 0, so
        // a probe that lost a function fails loudly instead of reading as hoisted.
        const got: [number, number] = [per.get(1) ?? -1, per.get(2) ?? -1];
        if (got[0] !== row.want[0] || got[1] !== row.want[1]) {
          bad.push(
            `${row.name}: [nested,toplevel] in-loop struct.get = [${got[0]},${got[1]}], ` +
              `want [${row.want[0]},${row.want[1]}]`,
          );
        }
      }
      if (bad.length) {
        throw new Error(
          `binaryen's loop-invariant motion for struct.get moved — ${bad.join("; ")}\n` +
            `  If the NESTED column dropped to 0, binaryen learned to hoist the shape the\n` +
            `  emitter produces and buffer-design.md §M4 can be reopened as shippable.\n` +
            `  If the --licm row stopped moving the TOPLEVEL column, this probe has gone\n` +
            `  inert and proves nothing — fix it before trusting the nested column.`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// ── 2. the axis is the inlining budget, not the view count ─────────────────

const buildAt = async (fixture: string, flag: string | null, out: string): Promise<void> => {
  const args = ["build", `${SRC}/${fixture}.vl`, "--compiler", COMPILER, "-o", out];
  if (flag) args.push(flag);
  const p = await new Deno.Command(VL, {
    args,
    // Without this `-O3` finds no wasm-opt, prints a note and writes the
    // UNOPTIMIZED module with exit 0 — which reads as a total optimization win.
    env: { VL_WASM_OPT: WASM_OPT },
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!p.success) {
    throw new Error(
      `vl build ${fixture} ${flag ?? "(none)"} exited ${p.code}: ` +
        new TextDecoder().decode(p.stderr).slice(0, 400),
    );
  }
};

Deno.test({
  name: "descriptor melt: one view melts, the same one view with a second call site does not",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-descmelt-" });
    try {
      const shapeOf = async (fixture: string) => {
        const out = `${dir}/${fixture}.wasm`;
        await buildAt(fixture, "-O3", out);
        const wat = await run("wasm-tools", ["print", out]);
        return { sget: sgetsInLoops(wat), snew: structNews(wat) };
      };
      // Same buffer, same single view, same single column, same kernel source.
      // `scale-seedtwice` differs only by calling an idempotent helper twice.
      const melted = await shapeOf("scale-view");
      const kept = await shapeOf("scale-seedtwice");
      const bad: string[] = [];
      // `scale-view` collapses into its driver: the only `struct.new` left is the
      // Buffer's, the view descriptor never exists, nothing is read per element.
      if (melted.sget !== 0 || melted.snew !== 1) {
        bad.push(
          `scale-view: in-loop struct.get=${melted.sget} (want 0), struct.new=${melted.snew} (want 1)`,
        );
      }
      // `scale-seedtwice` does not: the descriptor is built in a surviving callee
      // and returned, so it cannot be melted and every access reloads it.
      if (kept.sget !== 5 || kept.snew !== 2) {
        bad.push(
          `scale-seedtwice: in-loop struct.get=${kept.sget} (want 5), struct.new=${kept.snew} (want 2)`,
        );
      }
      if (bad.length) {
        throw new Error(
          `the descriptor melt boundary moved — ${bad.join("; ")}\n` +
            `  These two sources differ ONLY in how many times an idempotent seed helper\n` +
            `  is called. If they now agree, the 3.0x in buffer-design.md §M4 has a new\n` +
            `  explanation and §M4 must be re-derived in the same commit.`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

// ── 3. the priced route around, and the price ──────────────────────────────

Deno.test({
  name: "descriptor melt: forcing the constructor inline removes every per-element read",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-descmelt-" });
    try {
      const raw = `${dir}/axpy.wasm`;
      await buildAt("axpy-view", null, raw);
      const shape = async (extra: string[]) => {
        const out = `${dir}/o.wasm`;
        await run(WASM_OPT, [...FEATURES, ...RELEASE, ...extra, raw, "-o", out]);
        const wat = await run("wasm-tools", ["print", out]);
        return { sget: sgetsInLoops(wat), snew: structNews(wat) };
      };
      const base = await shape([]);
      // 60 is the smallest multiple-of-ten threshold that melts this kernel; it
      // is NOT in the shipped profile — on the 1.16 MB compiler module it costs
      // +82% module size and +127% wasm-opt wall time (§M4).
      const forced = await shape(["--always-inline-max-function-size=60"]);
      const bad: string[] = [];
      if (base.sget !== 7 || base.snew !== 2) {
        bad.push(
          `release profile: in-loop struct.get=${base.sget} (want 7), struct.new=${base.snew} (want 2)`,
        );
      }
      if (forced.sget !== 0 || forced.snew !== 0) {
        bad.push(
          `release + always-inline<=60: in-loop struct.get=${forced.sget} (want 0), ` +
            `struct.new=${forced.snew} (want 0)`,
        );
      }
      if (bad.length) {
        throw new Error(
          `the inline-threshold lever moved — ${bad.join("; ")}\n` +
            `  This is the measured route around the reload that §M4 prices and declines.\n` +
            `  If the baseline now melts on its own, the item is closed by binaryen and\n` +
            `  §M4's 3.0x no longer holds; re-derive it before editing this file.`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
