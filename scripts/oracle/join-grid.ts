// The acceptance grid for spec T3.6's literal-adoption rule (owner ruling 4.3): one program per
// literal × typed member × join form, each printing the literal arm's runtime type. A `.want`
// file beside each program holds the type the rule gives; the oracle agrees with every one.
//
//   deno run -A scripts/oracle/join-grid.ts <out-dir>
//   vl run --batch --out-dir <outs> <out-dir>/*.vl && deno run -A scripts/oracle/oracle.ts diff <out-dir> <outs>

const KIND = `function kind<T>(v: T): string {
  if v is i32 { return "i32" }
  if v is i64 { return "i64" }
  if v is f32 { return "f32" }
  if v is f64 { return "f64" }
  return "other"
}`;
const ARG: Record<string, string> = { i32: "3", i64: "3000000000", f32: "1.5", f64: "1.5" };

// An integer literal adopts a type that holds it exactly; a float literal adopts f32 or f64.
export function want(lit: string, t: string): string {
  if (lit.includes(".")) return t === "f32" ? "f32" : "f64";
  const n = BigInt(lit);
  const dflt = n >= -2147483648n && n <= 2147483647n ? "i32" : "i64";
  if (t === "i32") return dflt;
  if (t === "i64") return "i64";
  const v = t === "f32" ? Math.fround(Number(n)) : Number(n);
  return BigInt(v) === n ? t : dflt;
}

export function grid(): { name: string; src: string; want: string }[] {
  const out = [];
  for (const lit of ["5", "2.5", "9000000000", "0.1"]) {
    for (const t of ["i32", "i64", "f32", "f64"]) {
      const forms: Record<string, string> = {
        iflit: `function f(c: boolean, x: ${t}) { print(kind(if c { ${lit} } else { x })) }\nf(true, ${ARG[t]})`,
        ifvar: `function f(c: boolean, x: ${t}) { print(kind(if c { x } else { ${lit} })) }\nf(false, ${ARG[t]})`,
        coal: `function f(x: ${t} | null) { print(kind(x ?? ${lit})) }\nf(null)`,
        list: `function f(x: ${t}) {\n  const v = [${lit}, x]\n  print(kind(v[0]))\n}\nf(${ARG[t]})`,
      };
      for (const [form, body] of Object.entries(forms)) {
        out.push({ name: `jg_${form}_lit${lit.replace(".", "p")}_${t}`, src: `${KIND}\n${body}\n`, want: want(lit, t) });
      }
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
