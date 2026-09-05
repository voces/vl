// THE TWO SENTINEL-INDEX IMPLEMENTATIONS MUST AGREE.
//
// `compiler/lint.vl` grades one module at a time from the source the driver hands it;
// `scripts/sentinel-budget.py` (through `scripts/sentinel-census.py`) grades the whole
// tree for the per-file ratchet. They carry the same table definition, the same
// per-module hole-field and map derivations, the same reader fixpoint and the same
// linear guard model, and nothing else ties them together — so a change to either that
// moves a count silently un-ratchets the tree. This runs BOTH over the fixtures and
// compares the hit LINES AND COLUMNS, not totals.
//
// The fixtures also PIN THE FALSE POSITIVES the rule has to design out: a bound-tested
// read, a `while tbl.length <= k { push }` grow loop, a map subscript, a locally-built
// list, a re-bound index, and a parameter read at the TOP of a reader rather than on a
// fall-through. Every one is a shape the compiler really has, and each of the last three
// was a real over-report during the build (docs/internals/sentinel-index-lint.md).
//
// FIVE OF THE FIXTURES ARE THE FILED DEFECTS, reduced: D1440's hole field, D1462's and
// #2498's laundered `checkNode` answer, D1500's fall-through parameter, and D1500's own
// STRICT sibling — which must land under the weaker code, not the gated one. A sixth
// pins the WRAPPED HEADER both ways: a scan reading only a header's first line reported
// a continuation-line parameter as a table its function never declared, and missed the
// same header's own `i32` parameter on a fall-through.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary + seed
// wasm, like the other native `vl_*` suites.
//
// @test-timing sweep n=30

import { COMPILER, ROOT, VL, exists, nativeEnv } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/sentinel-budget.py`;
const UNGUARDED = "sentinel-index-unguarded";
const STRICT = "sentinel-index-strict-untested";
const CODES = [UNGUARDED, STRICT] as const;

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-sentinel-index] skipped — missing vl binary or seed wasm.");
}

type Fixture = {
  name: string;
  src: string;
  /** `line:col` of each expected hit, 1-based both, one per code. */
  unguarded: string[];
  strict: string[];
  /** A substring the ONE message of its code must contain. */
  says?: { code: string; text: string };
};

// Every fixture declares its own tables and readers, so nothing here depends on the
// compiler's vocabulary — unlike the kind-ladder suite, this rule reads only shapes.
const FIXTURES: Fixture[] = [
  {
    // Nothing fires. Seven shapes that must not.
    name: "clean.vl",
    src: `let tys: i32[] = []
let rows: i32[] = []
let byName: {[string]: i32} = Map()

function slotOf(n: i32): i32 {
  if n > 3 { return n }
  -1
}

function guarded(n: i32): i32 {
  const s = slotOf(n)
  if s < 0 { return 0 }
  tys[s]
}

function lengthGuarded(n: i32): i32 {
  const s = slotOf(n)
  if s >= tys.length { return 0 }
  tys[s]
}

function growThenWrite(n: i32): i32 {
  const k = slotOf(n)
  while rows.length <= k { rows.push(-1) }
  rows[k] = 7
  rows[k]
}

function ownList(n: i32): i32 {
  const mine: i32[] = [1, 2, 3]
  const s = slotOf(n)
  mine[s]
}

function mapKey(n: i32): i32 {
  const k = keyOf(n)
  const v = byName[k]
  if v == null { return 0 }
  v
}

function keyOf(n: i32): string {
  if n > 0 { return "a" }
  ""
}

function reboundFirst(n: i32): i32 {
  let s = slotOf(n)
  s = 0
  tys[s]
}

function topOfReader(ix: i32): i32 {
  const v = tys[ix]
  if v > 0 { return v }
  -1
}
`,
    unguarded: [],
    strict: [],
  },
  {
    // D1440, reduced: the index is a hole FIELD, and the module's own `t.inner < 0`
    // guard elsewhere is what says the field can be absent.
    name: "holefield.vl",
    src: `let tys: i32[] = []

type Row = { inner: i32 }

function ok(t: Row): i32 {
  if t.inner < 0 { return 0 }
  tys[t.inner]
}

function bad(t: Row): i32 {
  tys[t.inner]
}
`,
    unguarded: ["11:3"],
    strict: [],
    says: { code: UNGUARDED, text: "a field this module tests against 0 elsewhere" },
  },
  {
    // D1462 and #2498, reduced: the producer LAUNDERS a hole four hops down and carries
    // no `-1` of its own, which is why the rule does not filter its hits through the
    // reader census.
    name: "laundered.vl",
    src: `let tys: i32[] = []

function elemOf(t: i32): i32 {
  if t > 0 { return t }
  -1
}

function checkNode(ix: i32): i32 {
  const t = elemOf(ix)
  t
}

function checkBin(ix: i32): i32 {
  const lt = checkNode(ix)
  tys[lt]
}
`,
    unguarded: ["15:3"],
    strict: [],
    says: { code: UNGUARDED, text: "`checkNode`, which can answer in band" },
  },
  {
    // D1500, reduced: the read is on the FALL-THROUGH of a reader, off its own
    // parameter, into a table that a scalar-only module leaves EMPTY. `innerSlot` is a
    // reader by FORWARDING — it carries no `-1` of its own and hands its answer to one
    // that does, which is the shape the fixpoint exists for.
    name: "fallthrough.vl",
    src: `let elemName: i32[] = []

function nameSlot(nm: i32): i32 {
  if nm > 0 { return nm }
  -1
}

function arenaSlot(slot: i32): i32 {
  if slot > 100 { return slot }
  -1
}

function innerSlot(slot: i32): i32 {
  const ar = arenaSlot(slot)
  if ar >= 0 { return ar }
  nameSlot(elemName[slot])
}
`,
    unguarded: ["16:12"],
    strict: [],
    says: { code: UNGUARDED, text: "the parameter `slot` on a fall-through path" },
  },
  {
    // A WRAPPED HEADER. `vl fmt` breaks a long parameter list over several lines, and a
    // scan that read only the first line saw a continuation-line parameter as neither
    // declared nor an `i32` — so it reported `mine[s]` off a list the function was
    // handed (a false positive), and missed `tys[slot]` off the function's own `i32`
    // parameter on a fall-through (a false negative). Both directions are pinned here,
    // with `undeclaredBase` as the control that must still fire.
    name: "wrapped.vl",
    src: `let tys: i32[] = []

function slotOf(n: i32): i32 {
  if n > 3 { return n }
  -1
}

function wrappedBase(
  n: i32,
  mine: i32[],
): i32 {
  const s = slotOf(n)
  mine[s]
}

function undeclaredBase(
  n: i32,
  _spare: i32[],
): i32 {
  const s = slotOf(n)
  tys[s]
}

function wrappedParam(
  first: i32,
  slot: i32,
): i32 {
  if first > 0 { return first }
  slotOf(tys[slot])
}
`,
    unguarded: ["21:3", "29:10"],
    strict: [],
  },
  {
    // The STRICT carve-out: `slotOfStrict`'s -1 is its documented answer, not a clamp,
    // so an untested read of it is the weaker code and NOT the gated one. Its clamping
    // sibling in the same file is what makes the pair a pair.
    name: "strict.vl",
    src: `let tys: i32[] = []

function slotOf(n: i32): i32 {
  const s = slotOfStrict(n)
  if s < 0 { return 0 }
  s
}

function slotOfStrict(n: i32): i32 {
  if n > 3 { return n }
  -1
}

function reader(n: i32): i32 {
  const s = slotOfStrict(n)
  tys[s]
}
`,
    unguarded: [],
    strict: ["16:3"],
    says: { code: STRICT, text: "`slotOfStrict`, which can answer in band" },
  },
];

type Hits = { at: Record<string, string[]>; msgs: Record<string, string[]> };

const script = async (path: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [SCRIPT, "--grade", path],
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `sentinel-budget.py --grade ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`,
    );
  }
  const raw = JSON.parse(new TextDecoder().decode(stdout)) as Record<string, unknown[][]>;
  const at: Record<string, string[]> = {};
  for (const c of CODES) at[c] = raw[c].map((r) => `${r[0]}:${r[1]}`).sort();
  return { at, msgs: {} };
};

const lint = async (path: string, file: string): Promise<Hits> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  if (code > 1) {
    throw new Error(`vl check ${path} exited ${code}: ${new TextDecoder().decode(stderr)}`);
  }
  const all = JSON.parse(new TextDecoder().decode(stdout)) as {
    file: string;
    code?: string;
    line: number;
    col: number;
    message: string;
  }[];
  const diags = all.filter((d) => d.file.endsWith(`/${file}`) || d.file === file);
  const at: Record<string, string[]> = {};
  const msgs: Record<string, string[]> = {};
  for (const c of CODES) {
    const mine = diags.filter((d) => d.code === c);
    at[c] = mine.map((d) => `${d.line}:${d.col}`).sort();
    msgs[c] = mine.map((d) => d.message);
  }
  return { at, msgs };
};

const eq = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);

Deno.test({
  name: "sentinel-index: the lint and the ratchet script agree, both codes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_sentinel_index_" });

    for (const f of FIXTURES) {
      const path = `${dir}/${f.name}`;
      await Deno.writeTextFile(path, f.src);
      const s = await script(path);
      const l = await lint(path, f.name);

      for (const c of CODES) {
        if (!eq(s.at[c], l.at[c])) {
          throw new Error(
            `${f.name}: ${c} disagrees — sentinel-budget.py wants ` +
              `${JSON.stringify(s.at[c])}, compiler/lint.vl got ${JSON.stringify(l.at[c])}. ` +
              `The two carry the same table definition, the same hole-field and map ` +
              `derivations and the same guard model; whichever moved has to move back, ` +
              `or both together.`,
          );
        }
      }

      // Pin the fixture's own arithmetic, so an agreeing pair of ZEROS cannot pass.
      const want: Record<string, string[]> = { [UNGUARDED]: f.unguarded, [STRICT]: f.strict };
      for (const c of CODES) {
        if (!eq(s.at[c], want[c].slice().sort())) {
          throw new Error(
            `${f.name}: want ${c} at ${JSON.stringify(want[c])}, got ${JSON.stringify(s.at[c])}`,
          );
        }
      }

      if (f.says !== undefined) {
        const got = l.msgs[f.says.code];
        if (got.length !== 1 || !got[0].includes(f.says.text)) {
          throw new Error(
            `${f.name}: the ${f.says.code} message must name the producer — want one ` +
              `message containing "${f.says.text}", got ${JSON.stringify(got)}`,
          );
        }
      }
    }

    await Deno.remove(dir, { recursive: true });
  },
});

// THE RATCHET IS A COMMITTED FILE, AND IT HAS TO DESCRIBE THIS TREE. A baseline whose
// per-file rows no longer match the census is a gate that passes for the wrong reason —
// either it was written on a different tree, or the walk stopped seeing something.
Deno.test({
  name: "sentinel-index: the committed baseline is at or above the tree, and --check passes",
  ignore: !ENABLED,
  fn: async () => {
    const { code, stdout, stderr } = await new Deno.Command("python3", {
      args: [SCRIPT, "--check"],
      stdout: "piped",
      stderr: "piped",
    }).output();
    const out = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
    if (code !== 0) {
      throw new Error(`sentinel-budget.py --check exited ${code}:\n${out}`);
    }
    if (!out.includes("sentinel-index budget ok")) {
      throw new Error(`want the "sentinel-index budget ok" summary line, got:\n${out}`);
    }
  },
});
