// NATIVE `vl check --json` over D1230's "add this import" suffix — the exact line a
// reader can paste, appended to the `is not imported` sentence. EXACT message
// comparison, which is the half `tests/cases/modules/ufcs-not-imported*` cannot do: an
// `@error-at` directive matches by SUBSTRING, so the corpus tier passes whether the
// suffix is there or not, and it cannot see the negative (two-candidate) control at all.
//
// The rows: the entry already imports something else from the module (extend it), the
// module is only in the graph transitively (insert a fresh import), and two candidate
// modules (no suffix — the fix is a CHOICE, and no single line is right).
//
// GATING: same as tests/vl_check_json_test.ts — env-gated (`SELFHOST_NATIVE_ALIGN=1`)
// AND requires the built binary + seed wasm.
//
// @test-timing native

import { COMPILER, ROOT, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-ufcs-import-suffix] skipped — missing vl binary or seed wasm.");
}

type Diag = { severity: string; message: string };

const checkJson = async (dir: string, entry: string): Promise<Diag[]> => {
  const { stdout } = await new Deno.Command(VL, {
    args: ["check", `${dir}/${entry}`, "--json", "--compiler", COMPILER],
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${ROOT}/std` },
  }).output();
  const out = new TextDecoder().decode(stdout).trim();
  return JSON.parse(out) as Diag[];
};

// Every ERROR message for a single-file program.
const errorsOf = async (dir: string, src: string): Promise<string[]> => {
  await Deno.writeTextFile(`${dir}/x.vl`, src);
  const diags = await checkJson(dir, "x.vl");
  return diags.filter((d) => d.severity === "error").map((d) => d.message);
};

// Every ERROR message for a multi-file program, `files` keyed by name with `entry.vl`
// the one checked.
const errorsOfFiles = async (
  dir: string,
  files: Record<string, string>,
): Promise<string[]> => {
  for (const [name, src] of Object.entries(files)) {
    await Deno.writeTextFile(`${dir}/${name}`, src);
  }
  const diags = await checkJson(dir, "entry.vl");
  return diags.filter((d) => d.severity === "error").map((d) => d.message);
};

const eq = (got: string[], want: string[], what: string) => {
  const g = JSON.stringify(got);
  const w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

Deno.test({
  name: "ufcs-import suffix: the entry already imports another name from the module",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ufcs_suffix_" });
    try {
      // `Buf` is already imported for the annotation, so the fix EXTENDS that
      // import rather than proposing a second, colliding one.
      eq(
        await errorsOf(
          dir,
          'import { Buf } from "std:buffer"\n\nfunction f(b: Buf): i32 { b.loadU8(0) }\n',
        ),
        [
          "'loadU8' is not imported — a free `loadU8(self: …)` accepting Buf is " +
          'exported by "std:buffer"; a UFCS call resolves only names in scope, so ' +
          "import `loadU8` from there — add `loadU8` to the existing " +
          '`import { … } from "std:buffer"`',
        ],
        "std:buffer, Buf already imported",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "ufcs-import suffix: a relative module the entry already imports from",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ufcs_suffix_" });
    try {
      eq(
        await errorsOfFiles(dir, {
          "lib.vl": "export type Box = { v: i32 }\n\n" +
            "export function box(v: i32): Box { return { v: v } }\n\n" +
            "export function area(self: Box): i32 { return self.v * self.v }\n",
          "entry.vl": 'import { box } from "./lib"\n\nprint(box(2).area())\n',
        }),
        [
          "'area' is not imported — a free `area(self: …)` accepting Box is " +
          'exported by "./lib"; a UFCS call resolves only names in scope, so ' +
          "import `area` from there — add `area` to the existing " +
          '`import { … } from "./lib"`',
        ],
        "./lib, box already imported",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "ufcs-import suffix: the module is in the graph only transitively — no existing import to extend",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ufcs_suffix_" });
    try {
      // The entry names only `./dep`; `./dep` is what imports `std:fmt`. Nothing in
      // THIS file names `std:fmt`, so the fix has to insert a fresh import.
      eq(
        await errorsOfFiles(dir, {
          "dep.vl": 'import { toString } from "std:fmt"\n\n' +
            'export function tag(n: i32): string { return "#" + toString(n) }\n',
          "entry.vl": 'import { tag } from "./dep"\n\n' +
            'print(tag(3))\n\nprint("ab".padLeft(5, "."))\n',
        }),
        [
          "'padLeft' is not imported — a free `padLeft(self: …)` accepting string " +
          'is exported by "std:fmt"; a UFCS call resolves only names in scope, so ' +
          "import `padLeft` from there — add `import { padLeft } from " +
          '"std:fmt"`',
        ],
        "std:fmt reachable only through ./dep",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "ufcs-import suffix: NEGATIVE CONTROL — two candidate modules, no suffix",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_ufcs_suffix_" });
    try {
      // The fix is a CHOICE between "./left" and "./right", so no single pasteable
      // line is right and the sentence stops at "from there", exactly as before.
      eq(
        await errorsOfFiles(dir, {
          "left.vl": "export type Tag = { n: i32 }\n\n" +
            "export function tag(n: i32): Tag { return { n: n } }\n\n" +
            'export function label(self: Tag): string { return "L" }\n',
          "right.vl": 'import { Tag } from "./left"\n\n' +
            'export function label(self: Tag): string { return "R" }\n\n' +
            "export function marker(): i32 { return 1 }\n",
          "entry.vl": 'import { tag } from "./left"\n' +
            'import { marker } from "./right"\n\n' +
            "print(tag(1).label())\n\nprint(marker())\n",
        }),
        [
          "'label' is not imported — a free `label(self: …)` accepting Tag is " +
          'exported by "./left", "./right"; a UFCS call resolves only names in ' +
          "scope, so import `label` from there",
        ],
        "two candidates, no pasteable line",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
