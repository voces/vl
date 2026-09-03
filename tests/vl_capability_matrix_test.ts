// THE POSITION-MATRIX HARNESS, GRADED AGAINST ITS OWN CONTROLS.
//
// `scripts/capability-probes/matrix.py` generates one program per delivery POSITION x FACE
// from a single template. An instrument nobody validates measures nothing (CLAUDE.md: never
// trust a probe until a control you KNOW should trigger it does), so this suite runs it on
// two templates whose answers are already known: D1042's generic-pinned union, where every
// position runs but the INFERRED return (D1194), and D1197's narrowed nullable ref, where
// `.push` is check-clean invalid wasm and eight siblings run.
//
// D1197's cell is the load-bearing one. If it stops grading SILENT the harness has either
// been fixed or been blinded, and the two must not look the same.

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
const runMatrix = (template: string) => {
  let p = CACHE.get(template);
  if (!p) {
    p = runMatrixOnce(template);
    CACHE.set(template, p);
  }
  return p;
};

const runMatrixOnce = async (
  template: string,
): Promise<{ code: number; cells: Cell[]; out: string }> => {
  const { code, stdout, stderr } = await new Deno.Command("python3", {
    args: [MATRIX, `${TEMPLATES}/${template}`, "--compiler", COMPILER, "--vl", VL],
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
    }
    // No SILENT cell and no runs lost, so the harness must report success.
    if (code !== 0) throw new Error(`want exit 0 with no silent cell, got ${code}`);
  },
});

Deno.test({
  name: "matrix: D1197's `.push` cell grades SILENT — the control that proves the instrument",
  ignore: !ENABLED,
  fn: async () => {
    const { code, cells } = await runMatrix("narrowed-nullable-ref-push.matrix.vl");
    for (const face of ["annotated", "un-annotated"]) {
      wantVerdict(
        cells,
        "array_push",
        face,
        "SILENT",
        "D1197: `.push` drops the non-null recovery. When D1197 closes, change this to RUNS",
      );
      wantVerdict(cells, "binding", face, "RUNS", "D1197's matrix: eight positions run");
      wantVerdict(cells, "argument", face, "RUNS", "D1197's matrix: eight positions run");
      wantVerdict(cells, "return_annotated", face, "RUNS", "D1197's matrix: eight positions run");
      // A GUARDed template cannot nest a module global's initialiser, and the harness says
      // so rather than reporting a refusal it manufactured itself.
      wantVerdict(cells, "global_init", face, "skipped", "a global init cannot nest in a guard");
    }
    if (code === 0) {
      throw new Error("want a non-zero exit on a SILENT cell in the after column, got 0");
    }
  },
});
