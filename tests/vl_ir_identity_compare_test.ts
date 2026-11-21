// THE CLAIMS-ON / CLAIMLESS COMPARISON REDS ON AN INJECTED REFUSAL BYPASS.
//
// `scripts/ir-identity.sh --cases` builds each program under the shipped seed and under a
// same-tree seed with `CLAIMED` empty, then compares. A claim that turns a legacy refusal into a
// build, or into a different refusal, must red there. These controls hand the comparators
// (`--compare`, `--compare-errors`) builds with such a bypass injected and want a red; the same
// builds untouched want a pass. No assertion library, per CLAUDE.md.
//
// Run with:  deno test -A tests/vl_ir_identity_compare_test.ts

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

/** Runs `ir-identity.sh <mode>` over `a` and `b`; its exit code and stdout. */
function compare(mode: string, a: Record<string, Build>, b: Record<string, Build>) {
  const root = Deno.makeTempDirSync();
  try {
    const list = `${root}/list`;
    Deno.writeTextFileSync(list, Object.keys(a).join("\n") + "\n");
    const keep = `${root}/keep`;
    const out = new Deno.Command("bash", {
      args: [SCRIPT, mode, list, dir(root, "a", a), dir(root, "b", b)],
      env: { IR_IDENTITY_KEEP: keep },
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

Deno.test("ir-identity --compare-errors: a witness both seeds build to other bytes reds", () => {
  const r = compare("--compare-errors", { ...ERRORS, "t/e3.vl": { rc: 0, wasm: "other" } }, ERRORS);
  if (r.code !== 1 || !r.text.includes("DIFF t/e3.vl\n")) {
    throw new Error(`want t/e3.vl to red on its bytes, got exit ${r.code}:\n${r.text}`);
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

Deno.test("ir-identity --compare: a differ beside a timeout still reds as a differ", () => {
  const r = compare(
    "--compare",
    { "t/ok.vl": { rc: 0, wasm: "one" }, "t/r.vl": { rc: 1, err: REFUSAL, log: "x" } },
    { "t/ok.vl": { rc: 0, wasm: "two", log: "y" }, "t/r.vl": { rc: 124, err: "" } },
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
