// The acceptance grid for spec T2.3's float-context rule (owner ruling 4.1, revised): a radix
// literal in a float context is the value its digits spell, rounded to the float. One program per
// literal × position; a `.want` beside each holds the oracle's answer under the rule.
//
//   deno run -A scripts/oracle/radix-float-grid.ts <out-dir>
//   vl run --batch --out-dir <outs> <out-dir>/*.vl && deno run -A scripts/oracle/oracle.ts diff <out-dir> <outs>
import { interpret } from "./oracle.ts";

const LITS = [
  "0x0", "0x7F", "0xFF", "0x7FFFFFFF", "0x80000000", "0x80000001", "0xC0000000", "0xFFFFFF00",
  "0xFFFFFF01", "0xFFFFFFF0", "0xFFFFFFFE", "0xFFFFFFFF", "0x00FFFFFF", "0x01FFFFFF",
  "0x1_0000_0000", "0x1_0000_0001", "0xFFFF_FFFF_FF", "0x7FFFFFFFFFFFFFFF", "0x8000000000000000",
  "0xFFFFFFFFFFFFF800", "0xFFFFFFFFFFFFFC00", "0xFFFFFFFFFFFFFFFE", "0xFFFFFFFFFFFFFFFF", "0b1111",
  "0o777", "0b11111111111111111111111111111111",
];
// A constant tree (`(h + 0) as f64`) is ruling 4.2's, not this grid's.
const POSITIONS: Record<string, (h: string) => string> = {
  asf32: (h) => `print(${h} as f32)`,
  asf64: (h) => `print(${h} as f64)`,
  peeradd: (h) => `print(1.5 + ${h})`,
  peermul: (h) => `print(${h} * 0.5)`,
  bindf64: (h) => `const a: f64 = ${h}\nprint(a)`,
  argf64: (h) => `function f(x: f64): f64 { return x }\nprint(f(${h}))`,
  bindf32: (h) => `const b: f32 = ${h}\nprint(b)`,
};

export function grid(): { name: string; src: string; want: string }[] {
  const out = [];
  for (const [i, h] of LITS.entries()) {
    for (const [pos, mk] of Object.entries(POSITIONS)) {
      const src = mk(h) + "\n";
      const o = interpret(src);
      out.push({ name: `rf_${String(i).padStart(2, "0")}_${pos}`, src, want: o.kind === "ok" ? o.out.join("\n") : `(${o.kind})` });
    }
  }
  return out;
}

if (import.meta.main) {
  const dir = Deno.args[0];
  Deno.mkdirSync(dir, { recursive: true });
  for (const c of grid()) {
    Deno.writeTextFileSync(`${dir}/${c.name}.vl`, c.src);
    Deno.writeTextFileSync(`${dir}/${c.name}.want`, c.want + "\n");
  }
}
