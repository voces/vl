// THE HOST FLOOR AGREEMENT. The imports beneath `std:fs`, `std:args`, `std:process` and
// `std:env` are spelled by three sources, and each one can drift from the others:
//
//   - `FS_FLOOR` in compiler/check_intrinsics.vl: the slot order and signature of each import,
//     from which the emitter's per-slot predicates, the checker's declarations and the builtin
//     list are all derived;
//   - `HOST_FLOOR` in scripts/vl-host/src/main.rs: the native host's name and handler for each
//     import; its signature column is read from `FS_FLOOR` by build.rs (cargo test floor_);
//   - tests/support/runWasm.ts: the Deno harness's stubs.
//
// This file holds all three to one set of names, and refuses a signature spelled by hand in
// HOST_FLOOR. It also refuses a floor name spelled by hand in the checker or the
// builtin list, which read the table instead. It reads source text and runs nothing.

import { ROOT } from "./support/tree.ts";

const MAIN_RS = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
const INTRINSICS = Deno.readTextFileSync(
  `${ROOT}/compiler/check_intrinsics.vl`,
);
const DERIVED = ["check_core_state.vl", "driver.vl"].map((f) => ({
  f,
  src: Deno.readTextFileSync(`${ROOT}/compiler/${f}`),
}));
const RUN_WASM = Deno.readTextFileSync(`${ROOT}/tests/support/runWasm.ts`);

// A floor import's name, in every source.
const FLOOR_NAME = /^__(fs|args|proc|env)_[a-z_]*__$/;

function same(what: string, want: string[], got: string[]) {
  const w = [...want].sort().join(", ");
  const g = [...got].sort().join(", ");
  if (w !== g) throw new Error(`${what}\n  want: ${w}\n  got:  ${g}`);
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

// `HOST_FLOOR`'s rows: name -> handler. The host states no signature; build.rs reads it.
function hostRows(): Map<string, string> {
  const rows = new Map<string, string>();
  const body = block(MAIN_RS, "const HOST_FLOOR:", "main.rs");
  for (
    const m of body.matchAll(/\(\s*"([^"]+)",\s*(floor_[a-z_]+),?\s*\)/g)
  ) {
    if (rows.has(m[1])) {
      throw new Error(`main.rs HOST_FLOOR: ${m[1]} listed twice`);
    }
    rows.set(m[1], m[2]);
  }
  return rows;
}

// `FS_FLOOR`'s rows, in slot order: name -> signature. Every quoted line must be a row.
function slotRows(): Map<string, string> {
  const body = block(INTRINSICS, "const FS_FLOOR:", "check_intrinsics.vl");
  const rows = new Map<string, string>();
  for (
    const m of body.matchAll(/^ {2}"([^"]+)", "([^"]+)", "(|memory)",$/gm)
  ) {
    if (rows.has(m[1])) {
      throw new Error(`check_intrinsics.vl FS_FLOOR: ${m[1]} listed twice`);
    }
    rows.set(m[1], m[2]);
  }
  const lines = body.split("\n").filter((l) => /^ {2}"/.test(l)).length;
  if (lines !== rows.size) {
    throw new Error(
      `check_intrinsics.vl FS_FLOOR: ${lines} row lines, ${rows.size} parsed — a row is \`"name", "sig", "" | "memory",\``,
    );
  }
  return rows;
}

// The Deno harness's floor names: the stub list and the one it implements.
function harnessNames(): string[] {
  return [
    ...new Set(
      [...RUN_WASM.matchAll(/"(__[a-z_]+__)"|\b(__proc_exit__):/g)]
        .map((m) => m[1] ?? m[2])
        .filter((n) => FLOOR_NAME.test(n)),
    ),
  ];
}

Deno.test("host floor: every source names the same imports", () => {
  const slots = [...slotRows().keys()];
  if (slots.length < 10) {
    throw new Error(`parsed too little: want >=10 slots, got ${slots.length}`);
  }
  same("main.rs HOST_FLOOR against FS_FLOOR", slots, [...hostRows().keys()]);
  same("tests/support/runWasm.ts against FS_FLOOR", slots, harnessNames());
});

Deno.test("host floor: the host restates no signature, build.rs reads the table", () => {
  const sigs = [
    ...block(MAIN_RS, "const HOST_FLOOR:", "main.rs").matchAll(
      /"[^"]*=>[^"]*"/g,
    ),
  ].map((m) => m[0]);
  if (sigs.length > 0) {
    throw new Error(
      `main.rs HOST_FLOOR spells a signature: ${sigs.join(", ")}`,
    );
  }
  const build = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/build.rs`);
  if (!build.includes("compiler/check_intrinsics.vl")) {
    throw new Error("build.rs does not read FS_FLOOR");
  }
});

Deno.test("host floor: the checker and the builtin list read the table", () => {
  const bad: string[] = [];
  for (const { f, src } of DERIVED) {
    for (const m of src.matchAll(/"(__[a-z_]+__)"/g)) {
      if (FLOOR_NAME.test(m[1])) bad.push(`compiler/${f}: "${m[1]}"`);
    }
  }
  if (bad.length > 0) {
    throw new Error(
      `a floor name spelled by hand, not read from FS_FLOOR:\n  ${
        bad.join("\n  ")
      }`,
    );
  }
});
