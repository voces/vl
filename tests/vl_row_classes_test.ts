// THE RECORD ROWS THE COLLECT PASSES DECIDE, read back after a compile (`rowDumpBuild`).
//
// This is the instrument the up-front record-row pass is graded against: each case pins a fact
// about today's rows that the pass must reproduce, or explain where it does not. A case that
// stops matching is a change in which records share a heap row, whether or not any program's
// output moved.
import { assertSeed, seedExports } from "./support/sharedInstance.ts";

type Dump = {
  rc: number;
  rows: string[];
  arms: Map<string, { twin: number; codes: string }>;
};

const dump = (src: string): Dump => {
  const e = seedExports();
  if (typeof e.rowDumpBuild !== "function") {
    throw new Error(
      "the seed has no rowDumpBuild export; run scripts/refresh-compiler.sh",
    );
  }
  e.modReset();
  e.srcReset();
  for (const ch of src) e.srcPush(ch.codePointAt(0)!);
  const rc = e.compileSrc();
  const n = e.rowDumpBuild();
  let text = "";
  for (let i = 0; i < n; i++) text += String.fromCharCode(e.rowDumpAt(i));
  const rows: string[] = [];
  const arms = new Map<string, { twin: number; codes: string }>();
  for (const line of text.split("\n")) {
    const row = /^row (\d+) (\S+) decl=(\d) codes=(\S*)$/.exec(line);
    if (row) rows[Number(row[1])] = `${row[2]} decl=${row[3]} codes=${row[4]}`;
    const arm = /^arm \d+ (\S+) twin=(-?\d+) codes=(\S*)$/.exec(line);
    if (arm) arms.set(arm[1], { twin: Number(arm[2]), codes: arm[3] });
    if (line !== "" && !row && !arm) {
      throw new Error(`unparsed dump line: ${JSON.stringify(line)}`);
    }
  }
  return { rc, rows, arms };
};

const arm = (d: Dump, name: string) => {
  const a = d.arms.get(name);
  if (!a) {
    throw new Error(
      `no arm ${name} in the dump: ${JSON.stringify([...d.arms.keys()])}`,
    );
  }
  return a;
};

Deno.test({
  name: "row classes: two arms of one shape share one row",
  ignore: !assertSeed(),
  fn: () => {
    const d = dump(
      "type A = { n: i32 }\ntype B = { n: i32 }\ntype U = A | B\n" +
        "const b: B = { n: 4 }\nconst u: U = b\nif u is A { print(1) } else { print(2) }\n",
    );
    if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
    const a = arm(d, "A");
    const b = arm(d, "B");
    if (a.twin < 0 || a.twin !== b.twin) {
      throw new Error(
        `want A and B on one row, got A twin=${a.twin}, B twin=${b.twin}`,
      );
    }
  },
});

Deno.test({
  name:
    "row classes: a declared record and an arm holding a map each get a row",
  ignore: !assertSeed(),
  fn: () => {
    // D15098's witness in the order that runs: the record declared after the holder.
    const d = dump(
      "type Q = { o: A }\ntype R = { r: i32 }\ntype A = { n: i32, g: Map<string, R> }\n" +
        "type P = { m: i32 }\ntype U = A | P\nconst g: Map<string, R> = Map()\n" +
        'g.set("x", { r: 7 })\nconst q: Q = { o: { n: 1, g: g } }\nprint(q.o.g.get("x")?.r ?? 0)\n',
    );
    if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
    const a = arm(d, "A");
    if (a.codes !== "19,0") {
      throw new Error(`want A's codes 19,0 (map, i32), got ${a.codes}`);
    }
    if (a.twin < 0 || !d.rows[a.twin]) {
      throw new Error(`want A on a row, got twin=${a.twin}`);
    }
    for (const nm of ["Q", "R"]) {
      if (!d.rows.some((r) => r?.startsWith(`${nm} decl=1 `))) {
        throw new Error(
          `want a declared row ${nm}, got ${JSON.stringify(d.rows)}`,
        );
      }
    }
  },
});

Deno.test({
  name:
    "row classes: arms whose direct record fields name different records have no row",
  ignore: !assertSeed(),
  fn: () => {
    // D15150's witness: refused, and neither arm reaches a row.
    const d = dump(
      "type R = { r: i32 }\ntype S = { r: i32 }\ntype A = { n: i32, g: R }\n" +
        "type B = { n: i32, g: S }\ntype U = A | B\nconst b: B = { n: 4, g: { r: 1 } }\nprint(b.g.r)\n",
    );
    if (d.rc === 0) {
      throw new Error("want the union refused (D15150), got rc 0");
    }
    for (const nm of ["A", "B"]) {
      const a = arm(d, nm);
      if (a.twin !== -1) {
        throw new Error(`want ${nm} with no row, got twin=${a.twin}`);
      }
    }
  },
});
