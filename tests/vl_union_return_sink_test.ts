// The union-box SINK, counted structurally — because the corpus cannot see it.
//
// A value whose rep is the shared union box `(struct (field i32) (field anyref))` and that
// is produced on TWO branches used to get one allocation site per branch. Binaryen's
// Heap2Local scalarizes per allocation SITE, so two sites feeding one value melt neither
// and the box survives the whole release profile the moment its payload is read. The sink
// gives the merge ONE site: each branch writes the tag and the payload into two reserved
// locals, and the single `struct.new` is performed once past the merge.
//
// Two positions take it. In RETURN position every `return` branches to a single exit block
// that performs the construction. In BINDING position — a `let`/`const` whose init is a
// union-box if-expression — each arm of the void `if` writes the pair and the construction
// follows the `if`, which also retires the null box that used to be pre-seeded into the
// binding's non-defaultable slot before the merge.
//
// WHY THIS FILE EXISTS. The behavioural oracle is completely blind to the transform — a
// correct program prints the same thing whether its box is built once or once per branch,
// so all 1,700-odd `@log` fixtures would stay green with the sink switched off. This counts
// the construction sites instead. `selfhost_native_release_test.ts`'s MELT_TABLE pins what
// the OPTIMIZER then does with them; this pins what the EMITTER produced.
//
// THE CONTROLS ARE THE POINT, and each is exact rather than "at least one":
//   · two-arm   1 — the positive cell (2 without the sink).
//   · three-arm 1 — separates "the returns merged" from "a union producer emits one box".
//                   Unsunk this reads 3, so any per-arm accounting is ruled out.
//   · if-expression 1 — the same two-armed producer written as ONE `return` of an
//                   if-EXPRESSION. A union-valued if-expression lowers as a value-typed
//                   `if` that boxes in each arm, so this reads 2 unless the return path
//                   splits it into per-arm exits; it is the spelling half of the same
//                   claim the two-arm row makes for the statement form.
//   · let-if     1 — the BINDING position's positive cell, and the same program again.
//                   Unsunk it reads 3, not 2: one box per arm PLUS the pre-seed. That
//                   third site is why this row is not redundant with the if-expression
//                   one — a sink that merged the arms but kept the pre-seed reads 2 here
//                   and would still not melt.
//   · passthrough 2 — the INVERTED control. `pick`'s two exits return a union that already
//                   exists, so neither constructs a box and the sink must not manufacture
//                   one; the two sites counted are its CALLER's argument coercions. A sink
//                   that wrapped every union-returning function would read 3 here, i.e.
//                   would have made a function with no allocation allocate.
//   · branch-local 2 — a `let` written on two branches by SEPARATE statements: an init and
//                   an assignment inside an `if`, with no merge point to sink into. Neither
//                   sink sees it, so this must not move. Collapsing it needs the binding's
//                   slot to hold the pair across a liveness window, which is a rep question
//                   and not a sink (`unboxed-union-rep-design.md` §12.4).
//
// GATING: needs the built binary, the seed, and `wasm-tools` (the spec-grade disassembler
// the playbook requires on PATH). A missing prerequisite self-ignores rather than fails,
// so read the suite's IGNORED COUNT, not just its pass count — extra ignores here mean the
// prerequisites broke, not that anything was proven.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const MELT = `${ROOT}/tests/fixtures/opt-melt`;

const haveTool = async (bin: string): Promise<boolean> => {
  try {
    const { code } = await new Deno.Command(bin, {
      args: ["--version"],
      stdout: "null",
      stderr: "null",
    }).output();
    return code === 0;
  } catch {
    return false;
  }
};

const haveBin = exists(VL);
const haveSeed = exists(COMPILER);
const haveWasmTools = await haveTool("wasm-tools");
const ENABLED = haveBin && haveSeed && haveWasmTools;
if (!ENABLED) {
  console.warn(
    `[union-return-sink] skipped — ${
      !haveBin ? "missing vl binary" : !haveSeed ? "missing seed wasm" : "missing wasm-tools"
    }`,
  );
}

/**
 * How many times the module constructs the UNION BOX, plus what the program prints.
 *
 * The box is the unique type `(struct (field i32) (field anyref))` — one per module — so
 * its type index is read out of the disassembly rather than assumed, and only
 * `struct.new` of THAT index is counted. A payload's `$vbI64`/`$vbI32` value box is a
 * different type and is deliberately not counted: it is the data, not the overhead.
 *
 * The module is disassembled UNOPTIMIZED. This is an emitter assertion; what the release
 * profile then melts is `selfhost_native_release_test.ts`'s question.
 */
const boxSitesAndOutput = async (
  fixture: string,
): Promise<{ sites: number; out: string[] }> => {
  const tmp = await Deno.makeTempDir();
  try {
    const src = `${MELT}/${fixture}.vl`;
    const wasm = `${tmp}/m.wasm`;
    const b = await new Deno.Command(VL, {
      args: ["build", src, "-o", wasm, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (b.code !== 0) {
      throw new Error(
        `vl build ${fixture} exited ${b.code}: ${
          new TextDecoder().decode(b.stderr).trim().split("\n")[0]
        }`,
      );
    }
    const d = await new Deno.Command("wasm-tools", {
      args: ["print", wasm],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (d.code !== 0) throw new Error(`wasm-tools print failed for ${fixture}`);
    const wat = new TextDecoder().decode(d.stdout);
    const ty = wat.match(
      /^\s*\(type \(;(\d+);\) \(struct \(field i32\) \(field anyref\)\)\)/m,
    );
    // No box type at all is a legitimate answer (zero sites), not a failure.
    const sites = ty
      ? (wat.match(new RegExp(`^\\s*struct\\.new ${ty[1]}\\s*$`, "gm")) ?? []).length
      : 0;
    const r = await new Deno.Command(VL, {
      args: ["run", src, "--compiler", COMPILER],
      stdout: "piped",
      stderr: "piped",
    }).output();
    if (r.code !== 0) {
      throw new Error(
        `vl run ${fixture} exited ${r.code}: ${
          new TextDecoder().decode(r.stderr).trim().split("\n")[0]
        }`,
      );
    }
    const out = new TextDecoder().decode(r.stdout).replace(/\n$/, "");
    return { sites, out: out.length ? out.split("\n") : [] };
  } finally {
    await Deno.remove(tmp, { recursive: true });
  }
};

/** The `@log` lines a fixture declares, in order — its behavioural oracle. */
const expectedLogs = (fixture: string): string[] =>
  Deno.readTextFileSync(`${MELT}/${fixture}.vl`)
    .split("\n")
    .filter((l) => l.startsWith("// @log "))
    .map((l) => l.slice("// @log ".length));

const SINK_SITES: Array<{ fixture: string; sites: number; why: string }> = [
  { fixture: "union-sink-two-arm", sites: 1, why: "two returns merge onto one exit" },
  { fixture: "union-sink-three-arm", sites: 1, why: "three returns merge onto one exit" },
  {
    fixture: "union-sink-if-expression",
    sites: 1,
    why: "one `return` of an if-expression splits into per-arm exits that merge onto one",
  },
  {
    fixture: "union-sink-let-if",
    sites: 1,
    why: "a binding's if-expression arms write the sink pair and the box is built once after the `if`",
  },
  {
    fixture: "union-sink-passthrough",
    sites: 2,
    why: "both exits pass a union through; the two sites are the caller's arguments",
  },
  {
    fixture: "union-box-branch-local",
    sites: 2,
    why: "an init and a later assignment have no merge point, so neither sink sees them",
  },
  {
    fixture: "union-box-branch-local-read",
    sites: 2,
    // The payload READ is what makes this row say something the one above cannot: with the
    // payload discarded, `-O3` deletes the box's anyref field and the count falls for a
    // reason that is not a melt. Read, it is 4/4/4 at every rung.
    why: "the same two writes with the payload CONSUMED — still no merge point",
  },
  { fixture: "union-box-payload-read", sites: 1, why: "two returns merge onto one exit" },
];

for (const row of SINK_SITES) {
  Deno.test({
    name: `union-return-sink: ${row.fixture} constructs the box at exactly ${row.sites} site(s) — ${row.why}`,
    ignore: !ENABLED,
    fn: async () => {
      const got = await boxSitesAndOutput(row.fixture);
      const want = expectedLogs(row.fixture);
      if (JSON.stringify(got.out) !== JSON.stringify(want)) {
        throw new Error(
          `${row.fixture}: behaviour changed\n  want ${JSON.stringify(want)}\n  got  ${
            JSON.stringify(got.out)
          }`,
        );
      }
      if (got.sites !== row.sites) {
        throw new Error(
          `${row.fixture}: union-box construction sites moved\n  want ${row.sites}\n  got  ${got.sites}\n` +
            `  UP means the return sink stopped firing for this shape.\n` +
            `  DOWN on a control means it started reaching a shape it must not.`,
        );
      }
    },
  });
}
