// THE POSITION-MATRIX HARNESS, GRADED AGAINST ITS OWN CONTROLS.
//
// `scripts/capability-probes/matrix.py` generates one program per delivery POSITION x FACE
// from a single template. An instrument nobody validates measures nothing (CLAUDE.md: never
// trust a probe until a control you KNOW should trigger it does), so this suite runs it on
// four templates whose answers are already known: D1042's generic-pinned union, where every
// position runs but the INFERRED return (D1194); D1197's narrowed nullable ref, all nine
// delivery positions running since that row closed; and D1244's module-scope block at two
// reps, where the STRUCT capture is a loud refusal and the `i32[]` one is silent.
//
// D1244's `i32[]` cell is the load-bearing one — the SILENT control that proves the harness
// can still SEE check-clean invalid wasm. It took that role from D1197's `.push`, which is
// now the opposite control: the row it was filed against is closed, so an `array_push` cell
// that stops grading RUNS is a regression rather than a blinded instrument.

const exists = (p: string): boolean => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

const ROOT = new URL("../", import.meta.url).pathname.replace(/\/$/, "");
const MATRIX = `${ROOT}/scripts/capability-probes/matrix.py`;
const TEMPLATES = `${ROOT}/scripts/capability-probes/matrix`;
const VL = `${ROOT}/scripts/vl-host/target/release/vl`;
const COMPILER = `${ROOT}/build/vl-compiler.wasm`;
const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && exists(MATRIX);
if (GATED && !ENABLED) {
  console.warn("[vl-capability-matrix] skipped — missing vl binary, seed wasm or matrix.py.");
}

// The vocabulary run.py grades on. A verdict outside it means the two scripts have drifted.
const VERDICTS = [
  "RUNS",
  "WRONG",
  "skipped",
  "check refuses",
  "emit refuses",
  "SILENT",
  "COMPILER TRAP",
  "TIMEOUT",
];

type Cell = { position: string; face: string; grade: string };

const verdictOf = (grade: string): string => {
  const hit = VERDICTS.find((v) => grade === v || grade.startsWith(v + ":") || grade.startsWith(v + " "));
  if (!hit) throw new Error(`grade ${JSON.stringify(grade)} is outside the run.py vocabulary`);
  return hit;
};

// Memoised: three assertions over two templates would otherwise be five full matrix runs,
// and the harness is the thing under test, not the seed's throughput.
const CACHE = new Map<string, Promise<{ code: number; cells: Cell[]; out: string }>>();
// `only` narrows the run to a comma-separated position list. The D1244 templates are graded
// that way: their whole point is the six `block_*` cells, and a full 52-cell sweep of three
// more templates would put this suite over the gate's time budget for nothing.
const runMatrix = (template: string, only = "") => {
  const key = only ? `${template}#${only}` : template;
  let p = CACHE.get(key);
  if (!p) {
    p = runMatrixOnce(template, only);
    CACHE.set(key, p);
  }
  return p;
};

const runMatrixOnce = async (
  template: string,
  only: string,
): Promise<{ code: number; cells: Cell[]; out: string }> => {
  const args = [MATRIX, `${TEMPLATES}/${template}`, "--compiler", COMPILER, "--vl", VL];
  if (only) args.push("--only", only);
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args,
    stdout: "piped",
    stderr: "piped",
    env: { NO_COLOR: "1" },
  }).output();
  const out = new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr);
  const cells: Cell[] = [];
  for (const line of out.split("\n")) {
    const m = line.match(/^\| `([a-z_0-9]+)` \| ([a-z-]+) \| (.*?) \|$/);
    if (m) cells.push({ position: m[1], face: m[2], grade: m[3].trim() });
  }
  if (cells.length === 0) throw new Error(`${template}: no table rows parsed from:\n${out}`);
  return { code, cells, out };
};

const gradeOf = (cells: Cell[], position: string, face: string): string => {
  const c = cells.find((x) => x.position === position && x.face === face);
  if (!c) throw new Error(`no cell for ${position}/${face}`);
  return c.grade;
};

const wantVerdict = (
  cells: Cell[],
  position: string,
  face: string,
  want: string,
  why: string,
) => {
  const grade = gradeOf(cells, position, face);
  const got = verdictOf(grade);
  if (got !== want) {
    throw new Error(
      `${position}/${face}: want ${want} (${why}), got ${got} — full grade: ${grade}`,
    );
  }
};

Deno.test({
  name: "matrix: every grade is in run.py's vocabulary, and both faces are generated",
  ignore: !ENABLED,
  fn: async () => {
    const { cells } = await runMatrix("orerr-generic-pin.matrix.vl");
    for (const c of cells) verdictOf(c.grade);
    const positions = new Set(cells.map((c) => c.position));
    // The standard list. A position dropped from matrix.py is a position no brief will
    // grade again, which is exactly how D965 lost global assignment in the first place.
    for (
      const p of [
        "binding",
        "return_inferred",
        "return_annotated",
        "argument",
        "struct_field_init",
        "struct_field_assign",
        "array_element",
        "array_element_assign",
        "array_push",
        "global_init",
        "global_assign",
        "map_value",
        "closure_capture",
        "is_in_if",
        "is_in_while",
        "is_in_and",
        "is_in_not",
        "else_if",
        "early_return_guard",
        "two_instances",
        // The `block_*` six, added for D1244: a module-scope BLOCK is a scope none of the
        // twenty above opens, so `closure_capture` graded that capability green.
        "block_if",
        "block_if_capture",
        "block_while",
        "block_while_capture",
        "block_bare",
        "block_bare_capture",
      ]
    ) {
      if (!positions.has(p)) {
        throw new Error(`matrix.py no longer generates the ${p} position`);
      }
    }
    const faces = new Set(cells.map((c) => c.face));
    if (!faces.has("annotated") || !faces.has("un-annotated")) {
      throw new Error(`want both faces, got ${[...faces].join(", ")}`);
    }
    if (cells.length !== positions.size * 2) {
      throw new Error(`want 2 cells per position, got ${cells.length} for ${positions.size}`);
    }
  },
});

Deno.test({
  name: "matrix: D1042's template runs everywhere but the INFERRED return (D1194)",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("orerr-generic-pin.matrix.vl");
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(cells, "binding", face, "RUNS", "D1042 closed 2026-09-02");
      wantVerdict(cells, "array_push", face, "RUNS", "D1042 closed 2026-09-02");
      wantVerdict(cells, "global_assign", face, "RUNS", "D965's missed position");
      wantVerdict(cells, "two_instances", face, "RUNS", "two pins of one generic in a module");
      wantVerdict(cells, "return_inferred", face, "check refuses", "D1194, still open");
      // THE BLOCK FAMILY REACHES THIS TEMPLATE TOO, and that is the point of adding it: the
      // generic-pinned box is check-clean invalid wasm when captured out of a module-scope
      // block, which nothing graded before the positions existed. D1244's mechanism, this
      // template's value.
      wantVerdict(cells, "block_if", face, "RUNS", "the plain read inside the block is fine");
      wantVerdict(cells, "block_if_capture", face, "SILENT", "D1244 at the union box");
    }
    // A SILENT cell in the after column, so the harness must report FAILURE. This assertion
    // said `exit 0` until the `block_*` positions landed; the cells above are why it flipped,
    // and pinning them by name is what stops the number moving again unexplained.
    if (code === 0) {
      throw new Error("want a non-zero exit on D1244's block cells, got 0");
    }
  },
});

Deno.test({
  name: "matrix: D1197's `.push` cell RUNS with its eight siblings — the row is closed",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("narrowed-nullable-ref-push.matrix.vl");
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(
        cells,
        "array_push",
        face,
        "RUNS",
        "D1197 closed: `.push` asks `nulNicheRecoverOwed` like its siblings",
      );
      wantVerdict(cells, "binding", face, "RUNS", "D1197's matrix: eight positions run");
      wantVerdict(cells, "argument", face, "RUNS", "D1197's matrix: eight positions run");
      wantVerdict(cells, "return_annotated", face, "RUNS", "D1197's matrix: eight positions run");
      // A GUARDed template cannot nest a module global's initialiser, and the harness says
      // so rather than reporting a refusal it manufactured itself.
      wantVerdict(cells, "global_init", face, "skipped", "a global init cannot nest in a guard");
    }
    if (code !== 0) {
      throw new Error(`want exit 0 with no SILENT cell in the after column, got ${code}`);
    }
  },
});

// THE `block_*` FAMILY, GRADED AGAINST D1244 — the row the harness could not see.
//
// D1244 is a closure capturing a ref local declared in a MODULE-SCOPE block. Every one of the
// original twenty positions delivered at module scope or inside a function and none opened a
// block, so `closure_capture` graded that capability GREEN while the row was live. These two
// tests are the controls that prove the six new positions can speak: the struct rep is D1244's
// own LOUD cell, the `i32[]` rep is one of the two the row names as check-clean invalid wasm,
// and `block_bare` is D1253's floor underneath both. Only the six block positions are run —
// `--only` — because three more 52-cell sweeps would cost the gate more than they say.

const BLOCKS =
  "block_if,block_if_capture,block_while,block_while_capture,block_bare,block_bare_capture";

Deno.test({
  name: "matrix: D1244's LOUD cell — a captured struct in a module-scope block, three kinds",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("module-block-capture-struct.matrix.vl", BLOCKS);
    for (const face of ["annotated", "un-annotated"]) {
      // The controls: a PLAIN read of the same local in the same block runs. Without these
      // the loud cells below would be satisfied by a block that never worked at all.
      wantVerdict(cells, "block_if", face, "RUNS", "D1244: the capture is the ingredient");
      wantVerdict(cells, "block_while", face, "RUNS", "D1244: the capture is the ingredient");
      for (const p of ["block_if_capture", "block_while_capture", "block_bare_capture"]) {
        wantVerdict(cells, p, face, "emit refuses", "D1244. When it closes, change to RUNS");
        const grade = gradeOf(cells, p, face);
        if (!grade.includes("field access receiver is not a struct")) {
          throw new Error(`${p}/${face}: want D1244's message, got ${grade}`);
        }
      }
      // D1253's floor: a bare block is `unsupported statement in body` at every scope, so the
      // plain-read bare cell refuses where its `if` and `while` siblings run.
      wantVerdict(cells, "block_bare", face, "emit refuses", "D1253, still open");
      const bare = gradeOf(cells, "block_bare", face);
      if (!bare.includes("unsupported statement in body")) {
        throw new Error(`block_bare/${face}: want D1253's message, got ${bare}`);
      }
    }
    // No SILENT cell and no runs lost: a loud refusal is not a failure of the harness, and
    // this is the exit-0 control the orerr template used to be.
    if (code !== 0) throw new Error(`want exit 0 with no silent cell, got ${code}`);
  },
});

Deno.test({
  name: "matrix: D1244's `i32[]` rep grades SILENT where its struct rep is loud",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("module-block-capture-list.matrix.vl", BLOCKS);
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(cells, "block_if", face, "RUNS", "the plain read of the list is fine");
      wantVerdict(
        cells,
        "block_if_capture",
        face,
        "SILENT",
        "D1244 at `i32[]`: check-clean invalid wasm. When D1244 closes, change this to RUNS",
      );
      wantVerdict(cells, "block_while_capture", face, "SILENT", "D1244 at `i32[]`");
    }
    if (code === 0) {
      throw new Error("want a non-zero exit on D1244's silent ref-rep cells, got 0");
    }
  },
});
