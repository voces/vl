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
  types: Map<string, { row: number; variant: number; cls: string }>;
  armTwins: number[];
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
  const types = new Map<
    string,
    { row: number; variant: number; cls: string }
  >();
  const armTwins: number[] = [];
  for (const line of text.split("\n")) {
    const row = /^row (\d+) (\S+) decl=(\d) heap=(-?\d+) codes=(\S*)$/.exec(
      line,
    );
    if (row) rows[Number(row[1])] = `${row[2]} decl=${row[3]} codes=${row[5]}`;
    const arm = /^arm (\d+) (\S+) twin=(-?\d+) heap=(-?\d+) codes=(\S*)$/.exec(
      line,
    );
    if (arm) {
      arms.set(arm[2], { twin: Number(arm[3]), codes: arm[5] });
      armTwins[Number(arm[1])] = Number(arm[3]);
    }
    const ty = /^type (\S+) row=(-?\d+) variant=(-?\d+) class=(.*)$/.exec(line);
    if (ty) {
      types.set(ty[1], {
        row: Number(ty[2]),
        variant: Number(ty[3]),
        cls: ty[4],
      });
    }
    if (line !== "" && !row && !arm && !ty) {
      throw new Error(`unparsed dump line: ${JSON.stringify(line)}`);
    }
  }
  return { rc, rows, arms, types, armTwins };
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
    "row classes: a declared record and an arm holding a map each get a row, in both orders",
  ignore: !assertSeed(),
  fn: () => {
    // D15098's witness with the record declared after the holder, then before it.
    const tail = "type A = { n: i32, g: Map<string, R> }\n" +
      "type P = { m: i32 }\ntype U = A | P\nconst g: Map<string, R> = Map()\n" +
      'g.set("x", { r: 7 })\nconst q: Q = { o: { n: 1, g: g } }\nprint(q.o.g.get("x")?.r ?? 0)\n';
    for (
      const head of [
        "type Q = { o: A }\ntype R = { r: i32 }\n",
        "type R = { r: i32 }\ntype Q = { o: A }\n",
      ]
    ) {
      const d = dump(head + tail);
      if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc} for ${head}`);
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
    }
  },
});

Deno.test({
  name:
    "row classes: arms whose direct record fields name different records of one shape share a row",
  ignore: !assertSeed(),
  fn: () => {
    // D15150's witness: `R` and `S` are one record-row class, so `A` and `B` are one layout.
    const d = dump(
      "type R = { r: i32 }\ntype S = { r: i32 }\ntype A = { n: i32, g: R }\n" +
        "type B = { n: i32, g: S }\ntype U = A | B\nconst b: B = { n: 4, g: { r: 1 } }\nprint(b.g.r)\n",
    );
    if (d.rc !== 0) {
      throw new Error(`want the union built (D15150), got rc ${d.rc}`);
    }
    const a = arm(d, "A");
    const b = arm(d, "B");
    if (a.twin < 0 || a.twin !== b.twin) {
      throw new Error(
        `want A and B on one row, got twin=${a.twin} and twin=${b.twin}`,
      );
    }
  },
});

// The row a declared type name builds at: its own row, else its arm's twin row; -1 for neither.
const rowOf = (d: Dump, name: string): number => {
  const t = d.types.get(name);
  if (!t) {
    throw new Error(
      `no type ${name} in the dump: ${JSON.stringify([...d.types.keys()])}`,
    );
  }
  if (t.row >= 0) return t.row;
  if (t.variant < 0) return -1;
  return d.armTwins[t.variant] ?? -1;
};

// D15107's class-A witness: `ap` elaborates once for `C` and `D`, which mono keeps apart as two
// instances. The collect tables give the two records ONE row in both spellings, with and without
// the second union, so the row does not carry what separates the instances.
const CLASS_A =
  "type C = { r: i32 }\ntype S = { s: i32 }\ntype U = C | S\ntype D = { r: i32 }\n" +
  "type V = D | S\nfunction ap<T>(x: T): T { x }\nconst c: C = { r: 1 }\nconst d: D = { r: 2 }\n" +
  "print(ap(c).r)\nprint(ap(d).r)\n";

Deno.test({
  name:
    "row classes: D15107's class-A witness, C and D in different unions, share one row",
  ignore: !assertSeed(),
  fn: () => {
    const d = dump(CLASS_A);
    if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
    const c = rowOf(d, "C");
    const dd = rowOf(d, "D");
    if (c < 0 || c !== dd) {
      throw new Error(`want C and D on one row, got C=${c}, D=${dd}`);
    }
  },
});

Deno.test({
  name: "row classes: D15107's no-union control, C and D share one row",
  ignore: !assertSeed(),
  fn: () => {
    const d = dump(CLASS_A.replace("type V = D | S\n", ""));
    if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
    const c = rowOf(d, "C");
    const dd = rowOf(d, "D");
    if (c < 0 || c !== dd) {
      throw new Error(`want C and D on one row, got C=${c}, D=${dd}`);
    }
  },
});

// D15107's class-A soundness controls: each keeps two record representations apart that differ in
// SHAPE (a nullable field against a plain one), so the row class must keep them apart too, unlike
// the C/D pair above, which differs only by name.
const CASES = new URL("./cases/soundness/", import.meta.url);
const APART: [string, string, string][] = [
  ["identity-fresh-call-keeps-declared-instance-apart.vl", "Col", "J"],
  ["record-literal-through-hole-identity-into-wider-record.vl", "A", "II"],
  ["record-literal-through-identity-ignores-unused-record.vl", "Col", "J"],
  ["returned-binding-built-wider-handed-to-hole-param-runs.vl", "II", "J"],
];

for (const [file, x, y] of APART) {
  Deno.test({
    name: `row classes: ${file} keeps ${x} and ${y} on two rows`,
    ignore: !assertSeed(),
    fn: () => {
      const d = dump(Deno.readTextFileSync(new URL(file, CASES)));
      if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
      const rx = rowOf(d, x);
      const ry = rowOf(d, y);
      if (rx < 0 || ry < 0 || rx === ry) {
        throw new Error(
          `want ${x} and ${y} on two rows, got ${x}=${rx}, ${y}=${ry}`,
        );
      }
    },
  });
}

Deno.test({
  name:
    "row classes: generic-identity-literal-into-union-beside-own-row keeps the literal off J's row",
  ignore: !assertSeed(),
  fn: () => {
    // The one control whose second record is an anonymous literal (`{r: i32}`) beside the arm
    // `J = {r: i32 | null}`: J's row stores the field boxed, and some other row stores it bare.
    const d = dump(
      Deno.readTextFileSync(
        new URL("generic-identity-literal-into-union-beside-own-row.vl", CASES),
      ),
    );
    if (d.rc !== 0) throw new Error(`want rc 0, got ${d.rc}`);
    const j = rowOf(d, "J");
    if (j < 0 || !d.rows[j]?.endsWith("codes=16")) {
      throw new Error(
        `want J on a row storing r boxed (16), got ${j}: ${d.rows[j]}`,
      );
    }
    const bare = d.rows.findIndex((r, i) => i !== j && r?.endsWith(" codes=0"));
    if (bare < 0) {
      throw new Error(
        `want a second row storing r bare (0), got ${JSON.stringify(d.rows)}`,
      );
    }
  },
});

// The record-row class (`recordRowClassOf`), computed before the elaboration: the classes must
// agree with the rows wherever the rows say "one" or "two" (D15152).
const classOf = (d: Dump, name: string): string => {
  const c = d.types.get(name)?.cls ?? "";
  if (c === "") {
    throw new Error(
      `no class for ${name}: ${JSON.stringify([...d.types.entries()])}`,
    );
  }
  return c;
};

Deno.test({
  name: "row classes: C and D are one class with and without the second union",
  ignore: !assertSeed(),
  fn: () => {
    for (const src of [CLASS_A, CLASS_A.replace("type V = D | S\n", "")]) {
      const d = dump(src);
      if (classOf(d, "C") !== classOf(d, "D")) {
        throw new Error(
          `want C and D one class, got ${classOf(d, "C")} vs ${
            classOf(d, "D")
          }`,
        );
      }
    }
  },
});

for (const [file, x, y] of APART) {
  Deno.test({
    name: `row classes: ${file} gives ${x} and ${y} two classes`,
    ignore: !assertSeed(),
    fn: () => {
      const d = dump(Deno.readTextFileSync(new URL(file, CASES)));
      if (classOf(d, x) === classOf(d, y)) {
        throw new Error(
          `want ${x} and ${y} two classes, got ${classOf(d, x)} for both`,
        );
      }
    },
  });
}

Deno.test({
  name: "row classes: an intersection alias answers its record's class",
  ignore: !assertSeed(),
  fn: () => {
    const d = dump(
      "type AB = { a: i32 } & { b: i32 }\ntype C = { a: i32, b: i32 }\n" +
        "const x: AB = { a: 1, b: 2 }\nconst y: C = { a: 3, b: 4 }\nprint(x.a + y.b)\n",
    );
    if (classOf(d, "AB") !== classOf(d, "C")) {
      throw new Error(
        `want AB and C one class, got ${classOf(d, "AB")} vs ${
          classOf(d, "C")
        }`,
      );
    }
  },
});

Deno.test({
  name: "row classes: a field-order pair is one class",
  ignore: !assertSeed(),
  fn: () => {
    const d = dump(
      'type PA = { a: i32, b: string }\ntype PB = { b: string, a: i32 }\nconst pa: PA = { a: 1, b: "x" }\n' +
        'const pb: PB = { b: "y", a: 2 }\nprint(pa.a + pb.a)\n',
    );
    if (classOf(d, "PA") !== classOf(d, "PB")) {
      throw new Error(
        `want PA and PB one class, got ${classOf(d, "PA")} vs ${
          classOf(d, "PB")
        }`,
      );
    }
  },
});

Deno.test({
  name: "row classes: an inline union's layout family is one class (D15152)",
  ignore: !assertSeed(),
  fn: () => {
    // `A = {kind: K, r}` and `B = {kind: string, r}` meet only in a function's `A | B`; the
    // re-lay stores the field at the string for both.
    const d = dump(
      Deno.readTextFileSync(
        new URL(
          "./cases/unions/layout-family-literal-set-beside-string.vl",
          import.meta.url,
        ),
      ),
    );
    if (classOf(d, "A") !== classOf(d, "B")) {
      throw new Error(
        `want A and B one class, got ${classOf(d, "A")} vs ${classOf(d, "B")}`,
      );
    }
  },
});

Deno.test({
  name:
    "row classes: two arms of one union whose literal discriminants differ are one class",
  ignore: !assertSeed(),
  fn: () => {
    // The union literal re-lay (D1050): the two sets meet on the atom, so the arms build at one row.
    const d = dump(
      'type A = { kind: "a", x: i32 }\ntype B = { kind: "b" | "c", x: i32 }\ntype U = A | B\n' +
        'const a: A = { kind: "a", x: 1 }\nconst u: U = a\nprint(u.x)\n',
    );
    if (classOf(d, "A") !== classOf(d, "B")) {
      throw new Error(
        `want A and B one class, got ${classOf(d, "A")} vs ${classOf(d, "B")}`,
      );
    }
  },
});
