// THE HOST FLOOR AGREEMENT. The imports beneath `std:fs`, `std:args`, `std:process` and
// `std:env` are stated once, by `FS_FLOOR` in compiler/check_intrinsics.vl: the slot order
// and signature of each import. Everything else reads it:
//
//   - the emitter's per-slot predicates, the checker's declarations and the builtin list;
//   - `HOST_FLOOR` in scripts/vl-host/src/main.rs, which pairs each name with a handler and
//     takes its signature from the table through build.rs (cargo test floor_);
//   - tests/support/runWasm.ts, whose stubs are `FLOOR_NAMES` from tests/support/hostFloor.ts.
//
// This file holds HOST_FLOOR to the table's names, refuses a signature spelled in HOST_FLOOR
// and a floor name spelled by hand in the checker, the builtin list or the Deno harness.
// Every check is a function of source text, and each one is shown red on a perturbed copy.

import { ROOT } from "./support/tree.ts";
import {
  FLOOR_NAMES,
  INTRINSICS_SRC,
  parseFloorRows,
} from "./support/hostFloor.ts";

const read = (p: string) => Deno.readTextFileSync(`${ROOT}/${p}`);
const MAIN_RS = read("scripts/vl-host/src/main.rs");
const BUILD_RS = read("scripts/vl-host/build.rs");
const RUN_WASM = read("tests/support/runWasm.ts");
const DERIVED = ["check_core_state.vl", "driver.vl"].map((f) => ({
  f: `compiler/${f}`,
  src: read(`compiler/${f}`),
}));

// A floor import's name, in every source.
const FLOOR_NAME = /^__(fs|args|proc|env)_[a-z_]*__$/;

// The difference between two name sets, or [] when they agree.
function differ(what: string, want: string[], got: string[]): string[] {
  const w = [...want].sort().join(", ");
  const g = [...got].sort().join(", ");
  return w === g ? [] : [`${what}\n  want: ${w}\n  got:  ${g}`];
}

// The text from `head` to the next line that is a lone `}`, `]` or `];` at column 0.
function block(src: string, head: string, what: string): string {
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`${what}: \`${head}\` not found`);
  const rest = src.slice(at);
  const end = rest.search(/\n(}|];?)\n/);
  if (end < 0) throw new Error(`${what}: no end after \`${head}\``);
  return rest.slice(0, end);
}

// `HOST_FLOOR`'s names, in `main.rs`; a name listed twice is a problem of its own.
function hostNames(mainRs: string): string[] {
  const body = block(mainRs, "const HOST_FLOOR:", "main.rs");
  return [...body.matchAll(/\(\s*"([^"]+)",\s*floor_[a-z_]+,?\s*\)/g)].map((
    m,
  ) => m[1]);
}

// HOST_FLOOR against the table: the same names, each once, and no signature restated.
function hostProblems(intrinsics: string, mainRs: string, buildRs: string) {
  const slots = parseFloorRows(intrinsics).map((r) => r.name);
  const host = hostNames(mainRs);
  const bad = differ("main.rs HOST_FLOOR against FS_FLOOR", slots, host);
  if (new Set(host).size !== host.length) {
    bad.push("main.rs HOST_FLOOR: a name listed twice");
  }
  const sigs = [
    ...block(mainRs, "const HOST_FLOOR:", "main.rs").matchAll(
      /"[^"]*=>[^"]*"/g,
    ),
  ].map((m) => m[0]);
  if (sigs.length > 0) {
    bad.push(`main.rs HOST_FLOOR spells a signature: ${sigs.join(", ")}`);
  }
  if (!buildRs.includes("compiler/check_intrinsics.vl")) {
    bad.push("build.rs does not read FS_FLOOR");
  }
  return bad;
}

// The floor names `src` spells as string literals.
function spelledNames(src: string): string[] {
  return [...src.matchAll(/"(__[a-z_]+__)"/g)].map((m) => m[1]).filter((n) =>
    FLOOR_NAME.test(n)
  );
}

// The Deno harness: its stubs come from `FLOOR_NAMES`, it spells no floor name as a string,
// and each handler it defines by key (`__proc_exit__:`) is a slot of the table.
function harnessProblems(intrinsics: string, runWasm: string): string[] {
  const slots = new Set(parseFloorRows(intrinsics).map((r) => r.name));
  const bad: string[] = [];
  if (!/^import \{ FLOOR_NAMES \} from "\.\/hostFloor\.ts";$/m.test(runWasm)) {
    bad.push("tests/support/runWasm.ts does not import FLOOR_NAMES");
  }
  if (!runWasm.includes("FLOOR_NAMES.map(")) {
    bad.push("tests/support/runWasm.ts does not stub FLOOR_NAMES");
  }
  for (const n of spelledNames(runWasm)) {
    bad.push(`tests/support/runWasm.ts spells "${n}" by hand`);
  }
  for (const m of runWasm.matchAll(/^\s+(__[a-z_]+__): \(/gm)) {
    if (FLOOR_NAME.test(m[1]) && !slots.has(m[1])) {
      bad.push(
        `tests/support/runWasm.ts defines ${m[1]}, not an FS_FLOOR slot`,
      );
    }
  }
  return bad;
}

// The checker and the builtin list read the table rather than spelling a floor name.
function derivedProblems(files: { f: string; src: string }[]): string[] {
  return files.flatMap(({ f, src }) =>
    spelledNames(src).map((n) => `${f}: "${n}" spelled by hand`)
  );
}

function clean(what: string, bad: string[]) {
  if (bad.length > 0) throw new Error(`${what}\n  ${bad.join("\n  ")}`);
}

// A perturbation whose text is absent, which voids the control rather than passing it.
class VoidControl extends Error {}

// A control must make its check report, or make the table's reader throw.
function red(what: string, run: () => string[]) {
  let bad: string[];
  try {
    bad = run();
  } catch (e) {
    if (e instanceof VoidControl) throw e;
    return;
  }
  if (bad.length === 0) throw new Error(`control stayed green: ${what}`);
}

// `src` with `from` replaced once.
function perturb(src: string, from: string, to: string): string {
  if (!src.includes(from)) {
    throw new VoidControl(`control text not found: ${from}`);
  }
  return src.replace(from, to);
}

Deno.test("host floor: the table parses, and the harness reads all of it", () => {
  const rows = parseFloorRows(INTRINSICS_SRC);
  if (rows.length < 10) {
    throw new Error(`parsed too little: want >=10 slots, got ${rows.length}`);
  }
  clean(
    "hostFloor.ts FLOOR_NAMES",
    differ("FLOOR_NAMES against FS_FLOOR", rows.map((r) => r.name), [
      ...FLOOR_NAMES,
    ]),
  );
});

Deno.test("host floor: HOST_FLOOR names the table's imports and states no signature", () => {
  clean("HOST_FLOOR", hostProblems(INTRINSICS_SRC, MAIN_RS, BUILD_RS));
});

Deno.test("host floor: the Deno harness stubs the table's names", () => {
  clean("runWasm.ts", harnessProblems(INTRINSICS_SRC, RUN_WASM));
});

Deno.test("host floor: the checker and the builtin list read the table", () => {
  clean("a floor name not read from FS_FLOOR", derivedProblems(DERIVED));
});

Deno.test("host floor: every check is red on a perturbed source", () => {
  const row = '  "__env_get__", "(u8[]) => u8[]", "",';
  red("a malformed FS_FLOOR row", () =>
    hostProblems(
      perturb(INTRINSICS_SRC, row, '  "__env_get__", "(u8[]) => u8[]",'),
      MAIN_RS,
      BUILD_RS,
    ));
  red("a renamed FS_FLOOR row", () =>
    hostProblems(
      perturb(INTRINSICS_SRC, row, row.replace("__env_get__", "__env_got__")),
      MAIN_RS,
      BUILD_RS,
    ));
  red("a HOST_FLOOR row dropped", () =>
    hostProblems(
      INTRINSICS_SRC,
      perturb(MAIN_RS, '    ("__env_get__", floor_env_get),\n', ""),
      BUILD_RS,
    ));
  red("a HOST_FLOOR row restating its signature", () =>
    hostProblems(
      INTRINSICS_SRC,
      perturb(
        MAIN_RS,
        '("__env_get__", floor_env_get)',
        '("__env_get__", "(u8[]) => u8[]", floor_env_get)',
      ),
      BUILD_RS,
    ));
  red("a harness listing a floor name by hand", () =>
    harnessProblems(
      INTRINSICS_SRC,
      perturb(RUN_WASM, "FLOOR_NAMES.map(", '["__fs_read__"].map('),
    ));
  red("a harness handler for a name the table lacks", () =>
    harnessProblems(
      perturb(INTRINSICS_SRC, '  "__proc_exit__", "(i32) => void", "",\n', ""),
      RUN_WASM,
    ));
  red(
    "the checker spelling a floor name",
    () =>
      derivedProblems([{ f: "control.vl", src: 'const n = "__fs_read__"' }]),
  );
});
