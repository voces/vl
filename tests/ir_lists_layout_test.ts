// The IR kind lists stay one member per line, so two PRs adding different nodes merge.
//
// The `Rhs` and `IrNode` unions, every match arm over IR kinds with four or more or-patterns
// (compiler/ir.vl, ir_verify.vl, ir_lower.vl), and the lint closed sets mirrored from
// compiler/ir.vl are written one member per line; `vl fmt` keeps that layout but does not
// produce it, so a branch that merged master while keeping its own packed line reintroduces
// the conflict. Each list is also kept in sorted order, so two PRs adding different members
// insert at different lines. This test names each packed or out-of-order list. Fix: one member
// per line, in sorted order.

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

// The first member of `names` out of sorted order, as `prev > next`, or null when sorted.
function firstUnsorted(names: string[]): string | null {
  for (let i = 1; i < names.length; i++) {
    if (names[i - 1] > names[i]) return `${names[i - 1]} > ${names[i]}`;
  }
  return null;
}

// Each multi-line or-pattern arm of `src` (`A |`, `  B |`, `  C => …`) whose patterns are not
// sorted, as `line: prev > next`.
export function unsortedArms(src: string): string[] {
  const out: string[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const first = /^\s+([A-Z]\w*) \|$/.exec(lines[i]);
    if (!first || !KIND.test(first[1]) || /\|$/.test(lines[i - 1] ?? "")) continue;
    const pats = [first[1]];
    for (let j = i + 1; j < lines.length; j++) {
      const m = /^\s+([A-Z]\w*)( \||\s*=>)/.exec(lines[j]);
      if (!m) break;
      pats.push(m[1]);
      if (m[2] !== " |") break;
    }
    const bad = pats.every((p) => KIND.test(p)) ? firstUnsorted(pats) : null;
    if (bad) out.push(`${i + 1}: ${bad}`);
  }
  return out;
}

// The members of union `name` in `src`, in source order.
function unionMembers(src: string, name: string): string[] {
  const m = new RegExp(`^export type ${name} = ([\\s\\S]*?)(?=\\n\\n|\\n(?:export |//|const |function ))`, "m")
    .exec(src);
  return m ? m[1].split("|").map((x) => x.trim()) : [];
}

// The elements of closed set `name` in `src`, in source order.
function setMembers(src: string, name: string): string[] {
  const m = new RegExp(`^const ${name} = \\[([\\s\\S]*?)\\]`, "m").exec(src);
  return m ? m[1].split(",").map((x) => x.trim()).filter((x) => x.length > 0) : [];
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
  const order = [
    "    RA |\n      RC |\n      RB => 1\n",
    "    RA |\n      RB |\n      RC => 1\n",
  ].map((s) => unsortedArms(s).length);
  if (order.join() !== "1,0") throw new Error(`unsorted arms: want 1,0, got ${order.join()}`);
  if (firstUnsorted(["RB", "RA"]) === null || firstUnsorted(["RA", "RB"]) !== null) {
    throw new Error("firstUnsorted: want RB > RA named and RA, RB sorted");
  }
});

Deno.test("ir lists layout: the IR kind lists are one member per line, sorted", async () => {
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
  for (const f of ARM_FILES) {
    const src = await Deno.readTextFile(ROOT + f);
    for (const l of unsortedArms(src)) found.push(`${f}:${l} (arm not sorted)`);
    if (f === "compiler/ir.vl") {
      for (const u of UNIONS) {
        const bad = firstUnsorted(unionMembers(src, u));
        if (bad) found.push(`${f}: type ${u} not sorted (${bad})`);
      }
    }
  }
  for (const n of SETS) {
    const bad = firstUnsorted(setMembers(lint, n));
    if (bad) found.push(`compiler/lint.vl: ${n} not sorted (${bad})`);
  }
  if (found.length > 0) {
    throw new Error(
      `want every IR kind list one member per line in sorted order, got ${found.length}:\n` +
        found.join("\n"),
    );
  }
});
