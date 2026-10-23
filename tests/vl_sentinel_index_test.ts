// THE TWO SENTINEL-INDEX IMPLEMENTATIONS MUST AGREE.
//
// `compiler/lint.vl` grades one module at a time from the source the driver hands it;
// `scripts/sentinel-census.vl` grades the whole
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

const SCRIPT = `${ROOT}/scripts/sentinel-census.vl`;
const UNGUARDED = "sentinel-index-unguarded";
const STRICT = "sentinel-index-strict-untested";
const CODES = [UNGUARDED, STRICT] as const;

// The census, run from the checkout root: it grades `compiler/*.vl` under its working directory.
const census = (args: string[]) =>
  new Deno.Command(VL, {
    args: ["run", SCRIPT, "--", ...args],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();

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
  /** Sibling modules written beside the fixture before it is graded. */
  deps?: { name: string; src: string }[];
};

// Every fixture declares its own tables and readers, so nothing here depends on the
// compiler's vocabulary — unlike the kind-ladder suite, this rule reads only shapes.
const FIXTURES: Fixture[] = [
  {
    // Nothing fires. Ten shapes that must not: a read only in a comment and a string, a `!=`
    // guard, and a field tested against a positive number is not a hole field.
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

function quotedRead(n: i32): string {
  const s = slotOf(n)
  // tys[s]
  "tys[s]"
}

function notEqualGuarded(n: i32): i32 {
  const s = slotOf(n)
  if s != -1 { return tys[s] }
  0
}

type Pos = { at: i32 }

function positiveField(p: Pos): i32 {
  if p.at < 3 { return 0 }
  tys[p.at]
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
    says: { code: UNGUARDED, text: "a field its module graph tests against 0 elsewhere" },
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
    // with `undeclaredBase` as the control that must still fire. `boundOne` pins that
    // `1` is not a bound: only `0`, `-1` and a `.length` guard an index.
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

function boundOne(n: i32): i32 {
  const s = slotOf(n)
  if s > 1 { return 0 }
  tys[s]
}
`,
    unguarded: ["21:3", "29:10", "35:3"],
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
  {
    // An IMPORTED map global is a key subscript like a module-local one, under its own name
    // or an `as` alias; an imported LIST is still a table. Moving a map to another module
    // (#3788's `fnDeclIx`) must not turn its reads into hits.
    name: "imported.vl",
    deps: [{
      name: "imported_tables.vl",
      src: `export let byName: {[string]: i32} = Map()
export let tys: i32[] = []
`,
    }],
    src: `import { byName, byName as named, tys } from "./imported_tables"

function slotOf(n: i32): i32 {
  if n > 3 { return n }
  -1
}

function keyOf(n: i32): string {
  if n > 0 { return "a" }
  ""
}

function viaMap(n: i32): i32 {
  const k = keyOf(n)
  const s = slotOf(n)
  (byName[k] ?? 0) + (named[k] ?? 0) + tys[s]
}
`,
    unguarded: ["16:40"],
    strict: [],
  },
  {
    // A hole field is one some module in the GRAPH tests against 0: moving the read out of
    // the module that holds the test must not hide it (the typecheck.vl carve moved three).
    name: "graphhole.vl",
    deps: [{
      name: "graphhole_row.vl",
      src: `export type Row = { inner: i32 }

export function innerOk(t: Row): i32 {
  if t.inner < 0 { return 0 }
  1
}
`,
    }],
    src: `import { Row, innerOk } from "./graphhole_row"

let tys: i32[] = []

function bad(t: Row): i32 {
  tys[t.inner] + innerOk(t)
}
`,
    unguarded: ["6:3"],
    strict: [],
    says: { code: UNGUARDED, text: "a field its module graph tests against 0 elsewhere" },
  },
  {
    // A reader is one wherever it lives: `fallthrough.vl` with its answerer two modules
    // away, through a forwarder and an `as` alias. In one module it is reported; the
    // emit_classify.vl split (#3896) hid six such reads, since the fixpoint stopped at the
    // module's own functions.
    name: "graphreader.vl",
    deps: [{
      name: "graphreader_name.vl",
      src: `export function nameSlot(nm: i32): i32 {
  if nm > 0 { return nm }
  -1
}
`,
    }, {
      name: "graphreader_fwd.vl",
      src: `import { nameSlot } from "./graphreader_name"

export function fwdSlot(nm: i32): i32 {
  nameSlot(nm)
}
`,
    }],
    src: `import { fwdSlot as viaSlot } from "./graphreader_fwd"

let elemName: i32[] = []

function arenaSlot(slot: i32): i32 {
  if slot > 100 { return slot }
  -1
}

function innerSlot(slot: i32): i32 {
  const ar = arenaSlot(slot)
  if ar >= 0 { return ar }
  viaSlot(elemName[slot])
}
`,
    unguarded: ["13:11"],
    strict: [],
    says: { code: UNGUARDED, text: "the parameter `slot` on a fall-through path" },
  },
  {
    // The ARENA ACCESSORS: `nodeAt(ix)` is `P.nodes[ix]` with its bounds check held in one
    // body, so a call of one is a read of that table and fires like the subscript would.
    // Reading the arenas through them hid every such read from a rule that saw only `[`.
    // A bound-tested call and a call of some other function stay quiet.
    name: "accessor_node.vl",
    src: `type Parser = { nodes: i32[] }
let P: Parser = { nodes: [] }

function nodeAt(ix: i32): i32 { P.nodes[ix] }

function other(ix: i32): i32 { ix }

function slotOf(n: i32): i32 {
  if n > 3 { return n }
  -1
}

function guarded(n: i32): i32 {
  const s = slotOf(n)
  if s < 0 || s >= P.nodes.length { return 0 }
  nodeAt(s)
}

function notAnAccessor(n: i32): i32 {
  const s = slotOf(n)
  other(s)
}

function bad(n: i32): i32 {
  const s = slotOf(n)
  nodeAt(s)
}
`,
    unguarded: ["26:3"],
    strict: [],
    says: { code: UNGUARDED, text: "`nodeAt(s)` indexes a table with `slotOf`" },
  },
  {
    // `tyAt` is the type arena's accessor, graded the same way; here off a hole field.
    name: "accessor_ty.vl",
    src: `type Checker = { tys: i32[] }
let T: Checker = { tys: [] }

type Row = { inner: i32 }

function tyAt(ix: i32): i32 { T.tys[ix] }

function ok(t: Row): i32 {
  if t.inner < 0 { return 0 }
  tyAt(t.inner)
}

function bad(t: Row): i32 {
  tyAt(t.inner)
}
`,
    unguarded: ["14:3"],
    strict: [],
    says: { code: UNGUARDED, text: "`tyAt(t.inner)` indexes a table with `t.inner`" },
  },
];

type Hits = { at: Record<string, string[]>; msgs: Record<string, string[]> };

const script = async (path: string): Promise<Hits> => {
  const { code, stdout, stderr } = await census(["--grade", path]);
  if (code !== 0) {
    throw new Error(
      `sentinel-census.vl --grade ${path} exited ${code}: ` +
        new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
    );
  }
  const raw = JSON.parse(new TextDecoder().decode(stdout)) as Record<string, unknown[][]>;
  const at: Record<string, string[]> = {};
  for (const c of CODES) at[c] = raw[c].map((r) => `${r[0]}:${r[1]}`).sort();
  return { at, msgs: {} };
};

// The rule grades `compiler/` alone (docs/internals/lint-rule-scope.md), so the fixture
// is checked as `compiler/<file>` relative to its temp root.
const lint = async (dir: string, file: string): Promise<Hits> => {
  const path = `compiler/${file}`;
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", path, "--severity", "info", "--json", "--compiler", COMPILER],
    cwd: dir,
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
  const diags = all.filter((d) => d.file.endsWith(`/${path}`) || d.file === path);
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
    await Deno.mkdir(`${dir}/compiler`);

    for (const f of FIXTURES) {
      const path = `${dir}/compiler/${f.name}`;
      for (const d of f.deps ?? []) {
        await Deno.writeTextFile(`${dir}/compiler/${d.name}`, d.src);
      }
      await Deno.writeTextFile(path, f.src);
      const s = await script(path);
      const l = await lint(dir, f.name);

      for (const c of CODES) {
        if (!eq(s.at[c], l.at[c])) {
          throw new Error(
            `${f.name}: ${c} disagrees — sentinel-census.vl wants ` +
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

// THE RATCHET IS A COMMITTED FILE. `vl check --budget scripts/sentinel-budget-baseline.json`
// holds the lint's count per file, and the baseline's totals must be the sum of its rows.
// The census is held to the lint by the fixtures above, not by a whole-tree run: each
// census over-count the tree run alone could see has a fixture shape that fails "agree".
Deno.test("sentinel-index: the committed baseline's totals are the sum of its rows", async () => {
  const base = JSON.parse(
    await Deno.readTextFile(`${ROOT}/scripts/sentinel-budget-baseline.json`),
  ) as { total: Record<string, number>; files: Record<string, Record<string, number>> };
  const bad: string[] = [];
  for (const c of CODES) {
    const sum = Object.values(base.files).reduce((n, v) => n + (v[c] ?? 0), 0);
    if (sum !== base.total[c]) bad.push(`total ${c} is ${base.total[c]}, its rows sum to ${sum}`);
  }
  if (bad.length > 0) throw new Error(`the sentinel baseline:\n  ${bad.join("\n  ")}`);
});
