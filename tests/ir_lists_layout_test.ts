// The IR kind lists stay one member per line, so two PRs adding different nodes merge.
//
// The `Rhs` and `IrNode` unions, every match arm over IR kinds with four or more or-patterns
// (compiler/ir.vl, ir_verify.vl, ir_lower.vl), and the lint closed sets mirrored from
// compiler/ir.vl are written one member per line; `vl fmt` keeps that layout but does not
// produce it, so a branch that merged master while keeping its own packed line reintroduces
// the conflict. This test names each packed line. Fix: one member per line, order unchanged.

const ROOT = new URL("../", import.meta.url).pathname;
const ARM_FILES = ["compiler/ir.vl", "compiler/ir_verify.vl", "compiler/ir_lower.vl"];
const UNIONS = ["Rhs", "IrNode"];
const SETS = [
  "klOpnd", "klPushRecv", "klVarKind", "klMapOp", "klStrOp", "klIrNode", "klPrimOp",
  "klRhs", "klIrFamily", "klRawOp", "klRawEff",
];
// An IR kind name: an `R`, `S`, `O` or `P` variant (`RListGet`, `SLet`, `OVar`, `PStaged`).
const KIND = /^[RSOP][A-Z][A-Za-z0-9]*$/;
const ARM_MIN = 4;

// Each packed line of `src` as `line: text`. A line is packed when it holds four or more kind
// names joined by `|`, or two or more on a line that continues a multi-line `|` list (an arm's
// or a union's continuation line).
export function packedArmLines(src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  lines.forEach((raw, i) => {
    const code = raw.replace(/\/\/.*$/, "");
    // A type declaration's own line is not an arm; `Rhs` and `IrNode` are checked by name.
    if (/\btype\s+\w+\s*=/.test(code)) return;
    const head = code.split("=>")[0];
    const parts = head.split("|").map((p) => p.trim()).filter((p) => p.length > 0);
    if (parts.length < 2 || !parts.every((p) => KIND.test(p))) return;
    const prev = i > 0 ? lines[i - 1].replace(/\/\/.*$/, "").trimEnd() : "";
    const continues = /\|\s*$/.test(code.trimEnd()) || /^\s*\|/.test(code) || prev.endsWith("|");
    if (parts.length >= ARM_MIN || continues) out.push(`${i + 1}: ${raw.trim()}`);
  });
  return out;
}

// Each named closed set of `src` whose elements do not sit one per line, as `name: reason`.
export function packedSets(src: string, names: string[]): string[] {
  const out: string[] = [];
  for (const name of names) {
    const m = new RegExp(`^const ${name} = \\[([\\s\\S]*?)\\]`, "m").exec(src);
    if (!m) {
      out.push(`${name}: not found`);
      continue;
    }
    const body = m[1].split("\n").map((l) => l.trim()).filter((l) => l.length > 0);
    const bad = body.filter((l) => !/^"[^"]*",$/.test(l));
    if (body.length === 0 || bad.length > 0) out.push(`${name}: ${bad[0] ?? "one line"}`);
  }
  return out;
}

Deno.test("ir lists layout: the detector reds on a packed arm, union line and set (control)", () => {
  const arm = "  return match r {\n    RA | RB | RC | RD => 1\n  }\n";
  const cont = "    RA |\n      RB | RC |\n      RD => 1\n";
  const union = "export type Rhs = RA\n  | RB | RC\n";
  const three = "    SBr | SReturn | STrap => {\n";
  const kept = "    RA |\n      RB |\n      RC |\n      RD => 1\n";
  const got = [arm, cont, union, three, kept].map((s) => packedArmLines(s).length);
  const want = [1, 1, 1, 0, 0];
  if (got.join() !== want.join()) {
    throw new Error(`packed-line counts: want ${want.join()}, got ${got.join()}`);
  }
  const sets = packedSets('const klA = ["x", "y"]\nconst klB = [\n  "x",\n  "y",\n]\n', [
    "klA",
    "klB",
  ]);
  if (sets.length !== 1 || !sets[0].startsWith("klA")) {
    throw new Error(`packed sets: want [klA], got ${JSON.stringify(sets)}`);
  }
});

Deno.test("ir lists layout: the IR kind lists are one member per line", async () => {
  const found: string[] = [];
  for (const f of ARM_FILES) {
    const src = await Deno.readTextFile(ROOT + f);
    for (const l of packedArmLines(src)) found.push(`${f}:${l}`);
    if (f === "compiler/ir.vl") {
      for (const u of UNIONS) {
        if (!new RegExp(`^export type ${u} = [A-Z]\\w*\\n  \\| `, "m").test(src)) {
          found.push(`${f}: type ${u} is not one member per line`);
        }
      }
    }
  }
  const lint = await Deno.readTextFile(ROOT + "compiler/lint.vl");
  for (const s of packedSets(lint, SETS)) found.push(`compiler/lint.vl: ${s}`);
  if (found.length > 0) {
    throw new Error(
      `want every IR kind list one member per line (order unchanged), got ${found.length} packed:\n` +
        found.join("\n"),
    );
  }
});
