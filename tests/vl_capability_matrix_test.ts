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

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const MATRIX = `${ROOT}/scripts/capability-probes/matrix.py`;
const TEMPLATES = `${ROOT}/scripts/capability-probes/matrix`;
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
        "local_assign",
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
      wantVerdict(cells, "block_if_capture", face, "RUNS", "D1244 closed: the module block is a frame");
    }
    // Back to `exit 0`, and the third value this assertion has held. It wanted 0 before the
    // `block_*` positions existed, non-zero while D1244's captured box was SILENT, and 0
    // again now the frame landed. The cells above are pinned by name so the number cannot
    // move a fourth time without someone saying which cell moved.
    if (code !== 0) {
      throw new Error(`want exit 0 once D1244's block cells run, got ${code}`);
    }
  },
});

Deno.test({
  name: "matrix: D1197's `.push` cell runs; D1370's four annotated captures are the price",
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
    // D1370 — THE PRICE D1244's FRAME BOUGHT, PINNED BY NAME AND BY FACE. Making a
    // module-scope block a real frame let four captured cells reach the emitter, and the
    // ANNOTATED rebind arrives with a rep nothing converts: `const c: Item = e` under
    // `if e != null`. On master all four were D1244's own loud message. Eight cells left the
    // loud column here — four to RUNS, these four to SILENT, with runs -> not-runs at zero.
    // The un-annotated face of every one of them RUNS, which is why the face is part of the
    // pin: a fix that moves the annotated four must not quietly move the other face instead.
    for (const p of ["closure_capture", "block_if_capture", "block_while_capture", "block_bare_capture"]) {
      wantVerdict(cells, p, "annotated", "SILENT", "D1370. When it closes, change to RUNS");
      wantVerdict(cells, p, "un-annotated", "RUNS", "D1370's un-annotated face already runs");
    }
    // Non-zero BECAUSE of those four and nothing else. The count is asserted so a fifth
    // silent cell cannot hide behind a pin that only names four.
    const silent = cells.filter((c) => verdictOf(c.grade) === "SILENT");
    if (silent.length !== 4) {
      throw new Error(
        `want exactly D1370's 4 SILENT cells, got ${silent.length}: ` +
          silent.map((c) => `${c.position}/${c.face}`).join(", "),
      );
    }
    if (code === 0) {
      throw new Error("want a non-zero exit while D1370's four cells are SILENT, got 0");
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
// and `block_bare` is the plain bare block D1253 closed. Only the six block positions are run —
// `--only` — because three more 52-cell sweeps would cost the gate more than they say.

const BLOCKS =
  "block_if,block_if_capture,block_while,block_while_capture,block_bare,block_bare_capture";

Deno.test({
  name: "matrix: D1244 CLOSED — a captured struct in a module-scope block, three block kinds",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("module-block-capture-struct.matrix.vl", BLOCKS);
    for (const face of ["annotated", "un-annotated"]) {
      // The controls: a PLAIN read of the same local in the same block runs. Without these
      // the loud cells below would be satisfied by a block that never worked at all.
      wantVerdict(cells, "block_if", face, "RUNS", "D1244: the capture is the ingredient");
      wantVerdict(cells, "block_while", face, "RUNS", "D1244: the capture is the ingredient");
      for (const p of ["block_if_capture", "block_while_capture", "block_bare_capture"]) {
        // Was D1244's `field access receiver is not a struct`; the close removes the message
        // along with the refusal, so the verdict IS the assertion now.
        wantVerdict(cells, p, face, "RUNS", "D1244 closed 2026-09-03: the module block is a frame");
      }
      // D1253 CLOSED the floor that used to sit under all three: a bare block now lowers like
      // any other scope, so the plain-read bare cell runs with its `if` and `while` siblings
      // and `block_bare_capture` above reaches D1244's own message instead of the floor's.
      wantVerdict(cells, "block_bare", face, "RUNS", "D1253 closed");
    }
    // No SILENT cell and no runs lost: a loud refusal is not a failure of the harness, and
    // this is the exit-0 control the orerr template used to be.
    if (code !== 0) throw new Error(`want exit 0 with no silent cell, got ${code}`);
  },
});

Deno.test({
  name: "matrix: D1244 CLOSED at the `i32[]` rep too — the two silent cells and D1253's price",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("module-block-capture-list.matrix.vl", BLOCKS);
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(cells, "block_if", face, "RUNS", "the plain read of the list is fine");
      wantVerdict(cells, "block_if_capture", face, "RUNS", "D1244 closed 2026-09-03");
      wantVerdict(cells, "block_while_capture", face, "RUNS", "D1244 closed 2026-09-03");
      // D1253's PRICE, NOW REPAID. Closing the bare-block floor made this cell reachable and
      // it moved emit-refuses -> SILENT; D1244's frame moves it the rest of the way. A price
      // pinned by name is what let this be read as repayment rather than noticed as a number.
      wantVerdict(cells, "block_bare_capture", face, "RUNS", "D1253's price, repaid by D1244");
      wantVerdict(cells, "block_bare", face, "RUNS", "D1253 closed");
    }
    if (code !== 0) throw new Error(`want exit 0 once the ref reps run, got ${code}`);
  },
});

// D1500 — THE `local_assign` POSITION, GRADED AGAINST THE ROW THAT NAMED IT.
//
// `emitAssign` has two arms and the matrix had a cell for one: `global_assign` covers the
// `global.set` arm (D965's missed position), and the `local.set` arm — the plainest
// reassignment in the language — had none. D1500 is a compiler TRAP that lives at exactly
// that position: `let len = 0; len = xs[0]` over an `i32[]` crashed the compiler while the
// same value graded RUNS at all twenty-six other cells, in both faces. Only the one position
// is run: this is the control for the POSITION, not a second sweep of the value.
Deno.test({
  name: "matrix: D1500's `local_assign` position exists and its own template runs there",
  ignore: !ENABLED,
  fn: async () => {
    const { cells } = await runMatrix("index-read-into-local-assign.matrix.vl", "local_assign");
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(cells, "local_assign", face, "RUNS", "D1500 closed 2026-09-03");
    }
    if (cells.length !== 2) {
      throw new Error(`want the 2 local_assign cells, got ${cells.length}`);
    }
  },
});
