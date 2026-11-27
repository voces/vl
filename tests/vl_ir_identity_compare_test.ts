// THE CLAIMS-ON / CLAIMLESS COMPARISON REDS ON AN INJECTED REFUSAL BYPASS.
//
// `scripts/ir-identity.sh --cases` builds each program under the shipped seed and under a
// same-tree seed with `CLAIMED` empty, then compares. A claim that turns a legacy refusal into a
// build, or into a different refusal, must red there. These controls hand the comparators
// (`--compare`, `--compare-errors`) builds with such a bypass injected and want a red; the same
// builds untouched want a pass. No assertion library, per CLAUDE.md.
//
// Run with:  deno test -A tests/vl_ir_identity_compare_test.ts

import { binaryen, exists } from "./support/tree.ts";

const SCRIPT = new URL("../scripts/ir-identity.sh", import.meta.url).pathname;

type Build = { rc: number; err?: string; wasm?: string; log?: string };

/** Writes `builds` (file name to build) into a fresh dir, as `build_all` leaves them. */
function dir(root: string, name: string, builds: Record<string, Build>): string {
  const d = `${root}/${name}`;
  Deno.mkdirSync(d);
  for (const [f, b] of Object.entries(builds)) {
    const k = f.replaceAll("/", "_");
    Deno.writeTextFileSync(`${d}/${k}.rc`, `${b.rc}\n`);
    Deno.writeTextFileSync(`${d}/${k}.err`, b.err === undefined ? "" : `${b.err}\n`);
    if (b.wasm !== undefined) Deno.writeTextFileSync(`${d}/${k}.wasm`, b.wasm);
    if (b.log !== undefined) Deno.writeTextFileSync(`${d}/${k}.log`, b.log);
  }
  return d;
}

/** Runs `ir-identity.sh <mode>` over `a` and `b`; its exit code and stdout. `bytes` restores the
 * byte gate (`$IR_IDENTITY_BYTES=1`); by default a byte differ is informational. */
function compare(
  mode: string,
  a: Record<string, Build>,
  b: Record<string, Build>,
  baseline = "",
  bytes = false,
) {
  const root = Deno.makeTempDirSync();
  try {
    const list = `${root}/list`;
    Deno.writeTextFileSync(list, Object.keys(a).join("\n") + "\n");
    const keep = `${root}/keep`;
    Deno.writeTextFileSync(`${root}/baseline.txt`, baseline);
    const out = new Deno.Command("bash", {
      args: [SCRIPT, mode, list, dir(root, "a", a), dir(root, "b", b)],
      env: {
        IR_IDENTITY_KEEP: keep,
        IR_DIVERGENCE_BASELINE: `${root}/baseline.txt`,
        IR_IDENTITY_BYTES: bytes ? "1" : "0",
      },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    let kept: string[] = [];
    try {
      kept = [...Deno.readDirSync(keep)].map((e) => e.name).sort();
    } catch {
      kept = [];
    }
    return { code: out.code, text: new TextDecoder().decode(out.stdout), kept };
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

const REFUSAL = "t/r.vl:3:7: emitProgram: a returned container of functions is built at another storage";

// Legacy refuses `t/r.vl`; the shipped seed agrees, and `t/ok.vl` builds the same bytes.
const CASES: Record<string, Build> = {
  "t/ok.vl": { rc: 0, wasm: "bytes" },
  "t/r.vl": { rc: 1, err: REFUSAL },
};

Deno.test("ir-identity --compare: the same builds pass", () => {
  const r = compare("--compare", CASES, CASES);
  if (r.code !== 0 || !r.text.includes("cases: identical 1, fail under both 1, differ 0, timeout 0")) {
    throw new Error(`want a pass, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare: a refusal the claims seed builds reds", () => {
  const r = compare("--compare", { ...CASES, "t/r.vl": { rc: 0, wasm: "built" } }, CASES);
  if (r.code !== 1 || !r.text.includes("DIFF t/r.vl (exit 0 vs 1)")) {
    throw new Error(`want t/r.vl to red on its exit code, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare: a holdout the claims seed builds is newly claimed, not a differ", () => {
  const base = { ...CASES, "t/r.vl": { rc: 1, err: "t/r.vl:3:7: emitProgram: the compiler cannot yet lower this statement (c)" } };
  const r = compare("--compare", { ...CASES, "t/r.vl": { rc: 0, wasm: "built" } }, base);
  if (r.code !== 0 || !r.text.includes("newly claimed t/r.vl") || r.text.includes("DIFF")) {
    throw new Error(`want t/r.vl newly claimed, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare: a refusal the claims seed turns into another reds", () => {
  const r = compare("--compare", { ...CASES, "t/r.vl": { rc: 1, err: "t/r.vl:1:1: trap" } }, CASES);
  if (r.code !== 1 || !r.text.includes("DIFF t/r.vl (first error:")) {
    throw new Error(`want t/r.vl to red on its first error, got exit ${r.code}:\n${r.text}`);
  }
});

// Two filed emit-reject witnesses legacy refuses, and one that builds today.
const ERRORS: Record<string, Build> = {
  "t/e1.vl": { rc: 1, err: "t/e1.vl:2:3: undeclared identifier 'x'" },
  "t/e2.vl": { rc: 1, err: REFUSAL },
  "t/e3.vl": { rc: 0, wasm: "bytes" },
};

Deno.test("ir-identity --compare-errors: the same refusals pass", () => {
  const r = compare("--compare-errors", ERRORS, ERRORS);
  if (r.code !== 0 || !r.text.includes("errors: same 3, differ 0")) {
    throw new Error(`want a pass, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare-errors: a witness the claims seed builds reds", () => {
  const r = compare("--compare-errors", { ...ERRORS, "t/e2.vl": { rc: 0 } }, ERRORS);
  if (r.code !== 1 || !r.text.includes("DIFF t/e2.vl (exit 0 vs 1)")) {
    throw new Error(`want t/e2.vl to red on its exit code, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare-errors: a witness refused for another reason reds", () => {
  const r = compare("--compare-errors", { ...ERRORS, "t/e1.vl": { rc: 1, err: "t/e1.vl:9:9: other" } }, ERRORS);
  if (r.code !== 1 || !r.text.includes("DIFF t/e1.vl (first error:")) {
    throw new Error(`want t/e1.vl to red on its first error, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare-errors: the same refusal at another position, or a holdout's, is informational", () => {
  const moved = { ...ERRORS, "t/e1.vl": { rc: 1, err: "t/e1.vl:7:1: undeclared identifier 'x'" } };
  const held = { ...ERRORS, "t/e1.vl": { rc: 1, err: "t/e1.vl:2:3: the compiler cannot yet lower this statement (c)" } };
  for (const side of [moved, held]) {
    const r = compare("--compare-errors", side, ERRORS);
    if (r.code !== 0 || !r.text.includes("refusal text t/e1.vl (informational:")) {
      throw new Error(`want t/e1.vl informational, got exit ${r.code}:\n${r.text}`);
    }
  }
});

Deno.test("ir-identity --compare-errors: under the byte gate, a witness both seeds build to other bytes reds", () => {
  const r = compare("--compare-errors", { ...ERRORS, "t/e3.vl": { rc: 0, wasm: "other" } }, ERRORS, "", true);
  if (r.code !== 1 || !r.text.includes("DIFF t/e3.vl\n")) {
    throw new Error(`want t/e3.vl to red on its bytes, got exit ${r.code}:\n${r.text}`);
  }
});

// Byte identity is not a gate (coordinator ruling 2026-11-25): a byte differ is counted and handed
// to the behaviour check, never a DIFF by itself.
Deno.test("ir-identity --compare-errors: by default a witness both seeds build to other bytes is informational", () => {
  const r = compare("--compare-errors", { ...ERRORS, "t/e3.vl": { rc: 0, wasm: "other" } }, ERRORS);
  if (r.code !== 0 || r.text.includes("DIFF") || !r.text.includes("bytes differ 1 (informational)")) {
    throw new Error(`want a pass counting one byte differ, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare: by default a program both build to other bytes is informational", () => {
  const r = compare("--compare", { ...CASES, "t/ok.vl": { rc: 0, wasm: "other" } }, CASES);
  if (r.code !== 0 || r.text.includes("DIFF") || !r.text.includes("bytes differ 1 (informational)")) {
    throw new Error(`want a pass counting one byte differ, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test("ir-identity --compare: a one-sided timeout is a TIMEOUT, refused, never a DIFF", () => {
  const r = compare("--compare", { ...CASES, "t/ok.vl": { rc: 124, err: "", log: "partial" } }, CASES);
  if (
    r.code !== 3 || !r.text.includes("TIMEOUT t/ok.vl (a)") || r.text.includes("DIFF") ||
    !r.text.includes("differ 0, timeout 1") || !r.text.includes("Rerun on a quiet box")
  ) {
    throw new Error(`want exit 3 and a TIMEOUT, got exit ${r.code}:\n${r.text}`);
  }
  if (!r.kept.includes("a.t_ok.vl.log")) {
    throw new Error(`want the timed-out build's log kept, got ${JSON.stringify(r.kept)}`);
  }
});

Deno.test("ir-identity --compare: under the byte gate, a differ beside a timeout still reds as a differ", () => {
  const r = compare(
    "--compare",
    { "t/ok.vl": { rc: 0, wasm: "one" }, "t/r.vl": { rc: 1, err: REFUSAL, log: "x" } },
    { "t/ok.vl": { rc: 0, wasm: "two", log: "y" }, "t/r.vl": { rc: 124, err: "" } },
    "",
    true,
  );
  if (r.code !== 1 || !r.text.includes("DIFF t/ok.vl") || !r.text.includes("TIMEOUT t/r.vl (b)")) {
    throw new Error(`want exit 1 with the DIFF and the TIMEOUT, got exit ${r.code}:\n${r.text}`);
  }
  if (!r.kept.includes("b.t_ok.vl.log") || !r.kept.includes("a.t_r.vl.log")) {
    throw new Error(`want both non-identical files' logs kept, got ${JSON.stringify(r.kept)}`);
  }
});

Deno.test("ir-identity --compare-errors: a timeout is refused there too", () => {
  const r = compare("--compare-errors", { "t/e1.vl": { rc: 124, err: "" } }, { "t/e1.vl": { rc: 1, err: "t/e1.vl:1:1: x" } });
  if (r.code !== 3 || !r.text.includes("TIMEOUT t/e1.vl (a)") || !r.text.includes("errors: same 0, differ 0, timeout 1")) {
    throw new Error(`want exit 3 and a TIMEOUT, got exit ${r.code}:\n${r.text}`);
  }
});

// A `legacy-wrong:` line (O3) lets the claims seed build what the claimless one refuses; the same
// exit differ under any other mechanism, or the claims seed refusing, still reds.
const LEGACY_WRONG = "t/r.vl\tf@1\tlegacy-wrong: legacy refuses a shape the IR builds\t#0\n";
for (const mode of ["--compare", "--compare-errors"]) {
  Deno.test(`ir-identity ${mode}: a legacy-wrong program the claims seed alone builds passes`, () => {
    const r = compare(mode, { "t/r.vl": { rc: 0, wasm: "bytes" } }, { "t/r.vl": { rc: 1, err: REFUSAL } }, LEGACY_WRONG);
    if (r.code !== 0 || !r.text.includes("expected divergence t/r.vl (legacy-wrong: claimless exit 1)")) {
      throw new Error(`want a pass naming legacy-wrong, got exit ${r.code}:\n${r.text}`);
    }
  });
  Deno.test(`ir-identity ${mode}: the same exit differ under another mechanism reds`, () => {
    const r = compare(
      mode,
      { "t/r.vl": { rc: 0, wasm: "bytes" } },
      { "t/r.vl": { rc: 1, err: REFUSAL } },
      LEGACY_WRONG.replace("legacy-wrong: ", ""),
    );
    if (r.code !== 1 || !r.text.includes("DIFF t/r.vl (exit 0 vs 1)")) {
      throw new Error(`want a DIFF, got exit ${r.code}:\n${r.text}`);
    }
  });
  Deno.test(`ir-identity ${mode}: a legacy-wrong program the claims seed refuses reds`, () => {
    const r = compare(mode, { "t/r.vl": { rc: 1, err: REFUSAL } }, { "t/r.vl": { rc: 0, wasm: "bytes" } }, LEGACY_WRONG);
    if (r.code !== 1 || !r.text.includes("DIFF t/r.vl (exit 1 vs 0)")) {
      throw new Error(`want a DIFF, got exit ${r.code}:\n${r.text}`);
    }
  });
}

// A listed divergence (`ir-divergence-baseline.txt`, Q57): a byte differ passes as `expected
// divergence` only when every function whose body differs is listed for that program.
// Binaryen as every suite finds it: the native release `$VL_BINARYEN` names (ci-native has no
// node_modules and sets it), else npm's. With neither, these three ignore themselves, saying so.
const AS = binaryen("wasm-as");
const DIS = binaryen("wasm-dis");
const noBinaryen = !exists(AS) || !exists(DIS);
if (noBinaryen) {
  console.warn(`[ir-identity-compare] divergence tests skipped — no binaryen at ${AS}: set \$VL_BINARYEN (scripts/fetch-binaryen.sh) or run npm ci`);
}

/** The wasm of a module whose `$f@1` returns `n`, beside an unchanged `$g@1`, with names kept. */
function wat(root: string, n: number): string {
  const p = `${root}/m${n}.wat`;
  Deno.writeTextFileSync(
    p,
    `(module (func $f@1 (result i32) (i32.const ${n})) (func $g@1 (result i32) (i32.const 7)))\n`,
  );
  const out = new Deno.Command(AS, { args: ["-g", p, "-o", `${p}.wasm`] }).outputSync();
  if (out.code !== 0) throw new Error(`wasm-as failed: ${new TextDecoder().decode(out.stderr)}`);
  return new TextDecoder("latin1").decode(Deno.readFileSync(`${p}.wasm`));
}

/** `--compare` of `t/ok.vl` built to two modules whose `$f@1` differs, under `baseline`. */
function diverged(baseline: string, dis: string = DIS) {
  return divergedAt(baseline, () => "t/ok.vl", dis);
}

/** `diverged` for the program `file(root)` names; `$IR_IDENTITY_WIT` is `<root>/wit`. */
function divergedAt(baseline: string, file: (root: string) => string, dis: string = DIS) {
  const root = Deno.makeTempDirSync();
  try {
    const b = `${root}/baseline.txt`;
    Deno.writeTextFileSync(b, baseline);
    const one = wat(root, 1), two = wat(root, 2);
    const list = `${root}/list`;
    const f = file(root);
    Deno.writeTextFileSync(list, `${f}\n`);
    const k = f.replaceAll("/", "_");
    const a = `${root}/a`, c = `${root}/b`;
    for (const [d, w] of [[a, one], [c, two]]) {
      Deno.mkdirSync(d);
      Deno.writeTextFileSync(`${d}/${k}.rc`, "0\n");
      Deno.writeTextFileSync(`${d}/${k}.err`, "");
      Deno.writeFileSync(`${d}/${k}.wasm`, Uint8Array.from(w, (ch) => ch.charCodeAt(0)));
    }
    const out = new Deno.Command("bash", {
      args: [SCRIPT, "--compare", list, a, c],
      env: {
        IR_IDENTITY_KEEP: `${root}/keep`,
        IR_DIVERGENCE_BASELINE: b,
        WASM_DIS: dis,
        IR_IDENTITY_WIT: `${root}/wit`,
        // A listed divergence is read through wasm-dis only under the byte gate.
        IR_IDENTITY_BYTES: "1",
      },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    const dec = new TextDecoder();
    return { code: out.code, text: dec.decode(out.stdout), err: dec.decode(out.stderr) };
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test({ name: "ir-identity --compare: a listed function's differ is an expected divergence", ignore: noBinaryen }, () => {
  const r = diverged("t/ok.vl\tf@1\ttest mechanism\t#0\n");
  if (r.code !== 0 || !r.text.includes("expected divergence t/ok.vl (f@1)") || !r.text.includes("expected divergence 1")) {
    throw new Error(`want a pass naming f@1, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test({ name: "ir-identity --compare: a differ in a function the baseline does not list reds", ignore: noBinaryen }, () => {
  const r = diverged("t/ok.vl\tg@1\ttest mechanism\t#0\n");
  if (r.code !== 1 || !r.text.includes("DIFF t/ok.vl (unlisted: f@1)")) {
    throw new Error(`want t/ok.vl to red naming f@1, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test({ name: "ir-identity --compare: a differ in a program the baseline does not list reds", ignore: noBinaryen }, () => {
  const r = diverged("t/other.vl\tf@1\ttest mechanism\t#0\n");
  if (r.code !== 1 || !r.text.includes("DIFF t/ok.vl\n")) {
    throw new Error(`want t/ok.vl to red, got exit ${r.code}:\n${r.text}`);
  }
});

// An inventory witness, extracted under `$IR_IDENTITY_WIT/inv<k>/<id>/` afresh each run, is listed by
// its row's file: `inv1` is docs/internals/inventory, `inv2` docs/internals/inventory-2.
Deno.test({ name: "ir-identity --compare: an inventory witness is listed by its row's file", ignore: noBinaryen }, () => {
  const r = divergedAt("docs/internals/inventory/D1.md\tf@1\ttest mechanism\t#0\n", (root) => `${root}/wit/inv1/D1/w.vl`);
  if (r.code !== 0 || !r.text.includes("expected divergence") || !r.text.includes("(f@1)")) {
    throw new Error(`want an expected divergence naming f@1, got exit ${r.code}:\n${r.text}`);
  }
});

Deno.test({ name: "ir-identity --compare: an inventory witness whose row the baseline does not list reds", ignore: noBinaryen }, () => {
  const r = divergedAt("docs/internals/inventory-2/D1.md\tf@1\ttest mechanism\t#0\n", (root) => `${root}/wit/inv1/D1/w.vl`);
  if (r.code !== 1 || !r.text.includes("DIFF ")) {
    throw new Error(`want the witness to red, got exit ${r.code}:\n${r.text}`);
  }
});

// Without the disassembler a listed program's functions cannot be compared, and it would read as a
// plain differ with no reason: the script stops before building instead.
Deno.test({ name: "ir-identity: a listed divergence with no wasm-dis stops loudly", ignore: noBinaryen }, () => {
  const r = diverged("t/ok.vl\tf@1\ttest mechanism\t#0\n", "/nonexistent/wasm-dis");
  if (r.code !== 2 || !r.err.includes("/nonexistent/wasm-dis is not executable")) {
    throw new Error(`want exit 2 naming the missing wasm-dis, got exit ${r.code}:\n${r.text}${r.err}`);
  }
});
