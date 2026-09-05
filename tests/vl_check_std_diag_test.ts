// NATIVE `vl check`: A DIAGNOSTIC INSIDE AN IMPORTED `std:` MODULE IS NOT THE
// TARGET AUTHOR'S TO FIX.
//
// A check resolves the whole module graph, so every `import … from "std:…"` puts
// std's own source under the same lint tier as the file being checked. An external
// consumer's `vl check tools/replay-info.vl` printed 44 warnings, 42 of them inside
// std, burying the two that were about the target (glean VL-014; D1601).
//
// Policy pinned here (compiler/cli.vl, `cliDiagStdHidden`):
//   - a non-error whose owning module key starts with `std:` is WITHHELD unless
//     `--include-std` is passed, and counts nowhere while withheld — not in the
//     tally, not in the `--severity` gate, not in the `--json` array;
//   - a std ERROR is ALWAYS shown: it means the toolchain is broken, and hiding it
//     would leave a build failing with no diagnostic at all;
//   - a withheld run SAYS SO on stderr, in both human and `--json` mode, so nothing
//     is dropped in silence;
//   - the target's own diagnostics are untouched.
//
// The std tree under test is a `VL_STD` override holding one small module, so the
// fixture states its own warning rather than depending on what real std happens to
// carry today.
//
// GATING: env-gated (`SELFHOST_NATIVE_ALIGN=1`) AND requires the built binary +
// seed wasm, like the other native `vl_check_*` suites.
//
// @test-timing native

import { COMPILER, VL, exists } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-check-std-diag] skipped — missing vl binary or seed wasm.");
}

// `std:probe` with an unused local — a plain `unused-binding` warning, so what is
// pinned is the SCOPING, not any one comment rule.
const STD_WARN = `export function twice(n: i32): i32 {
  let leftover = 1
  n * 2
}
`;
// The same module with a type error in it: the toolchain-is-broken case.
const STD_ERR = `export function twice(n: i32): i32 {
  const broken: i32 = "not an i32"
  n * 2
}
`;
const MAIN = `import { twice } from "std:probe"
print(twice(21))
`;
// A target carrying a warning of its OWN, to prove suppression is not a blanket.
const MAIN_OWN = `import { twice } from "std:probe"
function go() {
  let mineToFix = 5
  print(twice(21))
}
go()
`;

type Run = { code: number; out: string; err: string };

const setup = async (stdSrc: string, main: string): Promise<string> => {
  const dir = await Deno.makeTempDir({ prefix: "vl_check_stddiag_" });
  await Deno.mkdir(`${dir}/std`);
  await Deno.writeTextFile(`${dir}/std/probe.vl`, stdSrc);
  await Deno.writeTextFile(`${dir}/main.vl`, main);
  return dir;
};

const check = async (dir: string, extra: string[] = []): Promise<Run> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: [
      "check",
      "main.vl",
      "--concise",
      "--severity",
      "info",
      "--compiler",
      COMPILER,
      ...extra,
    ],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
    env: { RUST_BACKTRACE: "0", NO_COLOR: "1", VL_STD: `${dir}/std` },
  }).output();
  return {
    code,
    out: new TextDecoder().decode(stdout),
    err: new TextDecoder().decode(stderr),
  };
};

Deno.test({
  name:
    "vl-check-std-diag: a std warning is withheld, counted nowhere, and announced",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(STD_WARN, MAIN);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (/std:probe/.test(all.replace(/--include-std/g, ""))) {
        throw new Error(`a std diagnostic leaked into the report:\n${all}`);
      }
      if (/leftover/.test(all)) {
        throw new Error(`std's own warning was reported:\n${all}`);
      }
      // Withheld means withheld from the GATE too: nothing else warns here, so a
      // non-zero exit at `--severity info` would mean std failed the build.
      if (r.code !== 0) {
        throw new Error(`a withheld std warning still gated (exit ${r.code}):\n${all}`);
      }
      if (!/no errors/.test(all)) {
        throw new Error(`expected a clean summary:\n${all}`);
      }
      if (!/\(1 std warning hidden — --include-std shows them\)/.test(r.err)) {
        throw new Error(
          `the run must say what it withheld, on stderr; got:\n${all}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-std-diag: --include-std brings the std warning back, gate and all",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(STD_WARN, MAIN);
    try {
      const r = await check(dir, ["--include-std"]);
      const all = r.out + r.err;
      if (!/std:probe: warning \[2:\d+\] Unused variable `leftover`/.test(all)) {
        throw new Error(`--include-std did not show the std warning:\n${all}`);
      }
      if (/std warning hidden/.test(all)) {
        throw new Error(`--include-std must withhold nothing:\n${all}`);
      }
      if (r.code === 0) {
        throw new Error(`the shown warning must gate at --severity info:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-std-diag: the target's own warning is untouched",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(STD_WARN, MAIN_OWN);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (!/main\.vl: warning \[3:\d+\] Unused variable `mineToFix`/.test(all)) {
        throw new Error(`the target's own warning was suppressed:\n${all}`);
      }
      if (/leftover/.test(all)) {
        throw new Error(`std's warning came along with it:\n${all}`);
      }
      if (r.code === 0) {
        throw new Error(`the target's own warning must still gate:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-std-diag: a std ERROR is shown without the flag",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(STD_ERR, MAIN);
    try {
      const r = await check(dir);
      const all = r.out + r.err;
      if (!/std:probe: error \[2:\d+\]/.test(all)) {
        throw new Error(
          `a std error must never be withheld — the toolchain is broken:\n${all}`,
        );
      }
      if (r.code === 0) {
        throw new Error(`a std error must gate:\n${all}`);
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});

Deno.test({
  name: "vl-check-std-diag: --json drops it from the array and says so on stderr",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await setup(STD_WARN, MAIN);
    try {
      const r = await check(dir, ["--json"]);
      const items = JSON.parse(r.out.trim()) as { file: string }[];
      if (items.length !== 0) {
        throw new Error(
          `the JSON array must carry no withheld std diagnostic, got ${r.out}`,
        );
      }
      if (!/\(1 std warning hidden — --include-std shows them\)/.test(r.err)) {
        throw new Error(
          `--json must still announce the withheld count on stderr; got:\n${r.err}`,
        );
      }
      const inc = await check(dir, ["--json", "--include-std"]);
      const incItems = JSON.parse(inc.out.trim()) as { file: string }[];
      if (incItems.length !== 1 || incItems[0].file !== "std:probe") {
        throw new Error(
          `--include-std --json must carry the std diagnostic, got ${inc.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
