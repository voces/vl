// `scripts/std-math/trig-grade.vl` and `math-grade.vl`, held to fixed output over small
// transcripts.
//
// The graders were `trig-grade.py` and `math-grade.py` (mpmath) until T3 of the architecture
// refactor. The ports were graded by running both, output for output, before the Python was
// deleted: stdout and exit code were byte-identical on the real `trig-check.sh` transcript
// (2,880,081 points) and the real `math-check.sh` one (12,535,598 points), on every pow and
// atan2 edge-case line of the latter, and on the four fixtures below — whose expected output
// is the Python's, recorded. The `bad` fixtures each break the bound one way: a sin 2 ulp off,
// sin(-0) giving +0, sin/cos(inf) not NaN; exp(inf) giving 0, and 2^3 one ulp off 8 (an
// inexact exact power). Two of the four run with `GRADE_CHUNK` lowered, so the chunked
// fan-out and its merge are graded too. Where they could not agree, pinned here as the
// port's own behaviour:
//
//   1. THE LOUD FAILURE. VL has no stderr sink, so a missing argument prints one usage line to
//      stdout and exits 2, where the Python raised an IndexError traceback and exited 1.
//   2. THE ORDER OF THE BOUND-MISSED LIST. The Python listed keys in the order its pool
//      happened to return chunks; the port lists them in transcript order, which is what the
//      Python printed whenever the pool returned chunks in order.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-std-math-grade] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

const lines = (...ls: string[]): string => ls.join("\n") + "\n";

const TRIG_OK = lines(
  "D -4545474616758849532 4605453951608041457 -4619891188414346354",
  "F -950413478 1062128223 -1089017642",
  "D 4694792537898989047 4607018905127411736 -4627370143590368487",
  "F 1228539779 1065116644 -1104454841",
  "D 0 0 4607182418800017408",
  "D -9223372036854775808 -9223372036854775808 4607182418800017408",
  "D 9218868437227405312 9221120237041090560 9221120237041090560",
  "D 8619534387940637409 -4616510588976640038 4598437782216459378",
  "F 1070141403 1065353216 -1287930578",
  "F 1287487014 1053274883 1064024442",
);

const TRIG_BAD = lines(
  "D -4545474616758849532 4605453951608041457 -4619891188414346354",
  "D 4686817321231093972 4607128064053902533 4592568702516317270",
  "D -9223372036854775808 0 4607182418800017408",
  "F 2139095040 0 2143289344",
  "F 1287487014 1053274883 1064024442",
);

const MATH_OK = lines(
  "E -4589974340733669776 4228471788589730620",
  "E 4515299888829478650 4607182422231654492",
  "e -1039069355 625814664",
  "e -1097134461 1060969556",
  "E 9218868437227405312 9218868437227405312",
  "L 9151272702460695668 4649363034924165118",
  "l 1073025048 1059472542",
  "P 4612591167999192145 -4592133192179669297 4362428397359728540",
  "p 1077057135 1106241560 1437112027",
  "P 4611686018427387904 4613937818241073152 4620693217682128896",
  "P -4605064244369957856 -9223372036854775808 4607182418800017408",
  "A -7164318709035832793 -7164318709035832793",
  "a 1059946419 1058568890",
  "S 4607182414171158446 4609748491124714563",
  "C 4607182414171158446 4562318202058790015",
  "s 1065337723 1069780869",
  "c -1100950906 1071998274",
  "T 4621158893314139596 -4603150785959342929 4612317372242922867",
  "t 1811949273 1238766495 1070141403",
  "H 8927166154174574457 1106349642260734100 8927166154174574457",
  "h -1064525242 1071925020 1083688369",
);

const MATH_BAD = lines(
  "E -4589974340733669776 4228471788589730620",
  "E 9218868437227405312 0",
  "P 4611686018427387904 4613937818241073152 4620693217682128897",
  "h -1064525242 1071925020 1083688369",
);

type Case = {
  kind: "trig" | "math";
  input: string | null;
  chunk: string | null;
  code: number;
  out: string;
};

const CASES: Case[] = [
  {
    kind: "trig",
    input: TRIG_OK,
    chunk: null,
    code: 0,
    out: lines(
      "w  fn  section            points   max ulp  mean ulp  >0.5ulp  worst x",
      "D  cos nonfinite               1    0.0000    0.0000        0  inf",
      "D  cos pi/4<|x|<1.6e6          2    0.2224    0.1195        0  -55767.35211595896",
      "D  cos |x|<=pi/4               2    0.0000    0.0000        0  -0.0",
      "D  cos |x|>=1.6e6              1    0.1000    0.1000        0  1.5857980448259778e+268",
      "D  sin nonfinite               1    0.0000    0.0000        0  inf",
      "D  sin pi/4<|x|<1.6e6          2    0.5912    0.3678        1  -55767.35211595896",
      "D  sin |x|<=pi/4               2    0.0000    0.0000        0  -0.0",
      "D  sin |x|>=1.6e6              1    0.3695    0.3695        0  1.5857980448259778e+268",
      "F  cos pi/4<|x|<1.6e6          3    0.4828    0.2035        0  1.5707963705062866",
      "F  cos |x|>=1.6e6              1    0.3607    0.3607        0  99348784.0",
      "F  sin pi/4<|x|<1.6e6          3    0.4726    0.2685        0  761976.1875",
      "F  sin |x|>=1.6e6              1    0.0261    0.0261        0  99348784.0",
      "all points within the documented 1-ulp bound",
    ),
  },
  {
    kind: "trig",
    input: TRIG_BAD,
    chunk: "2",
    code: 1,
    out: lines(
      "w  fn  section            points   max ulp  mean ulp  >0.5ulp  worst x",
      "D  cos pi/4<|x|<1.6e6          2    0.2224    0.2003        0  -55767.35211595896",
      "D  cos |x|<=pi/4               1    0.0000    0.0000        0  -0.0",
      "D  sin pi/4<|x|<1.6e6          2    1.8943    1.2427        2  220528.69879258296",
      "D  sin |x|<=pi/4               1       inf       inf        1  -0.0",
      "F  cos nonfinite               1       inf       inf        1  inf",
      "F  cos |x|>=1.6e6              1    0.3607    0.3607        0  99348784.0",
      "F  sin nonfinite               1       inf       inf        1  inf",
      "F  sin |x|>=1.6e6              1    0.0261    0.0261        0  99348784.0",
      "BOUND MISSED (>= 1 ulp): [('D', 'sin', 'pi/4<|x|<1.6e6'), ('D', 'sin', '|x|<=pi/4'), ('F', 'sin', 'nonfinite'), ('F', 'cos', 'nonfinite')]",
    ),
  },
  {
    kind: "math",
    input: MATH_OK,
    chunk: "3",
    code: 0,
    out: lines(
      "fn    w  section      points   max ulp  mean ulp  >0.5ulp",
      "atan  32 normal            1    0.4943    0.4943        0",
      "atan  64 normal            1    0.0000    0.0000        0",
      "acos  32 normal            1    0.3053    0.3053        0",
      "acos  64 normal            1    0.0037    0.0037        0",
      "exp   32 normal            2    0.3065    0.2208        0",
      "exp   64 edge              1    0.0000    0.0000        0",
      "exp   64 normal            2    0.3429    0.2976        0",
      "hypot 32 normal            1    0.1621    0.1621        0",
      "hypot 64 normal            1    0.0000    0.0000        0",
      "log   32 normal            1    0.0789    0.0789        0",
      "log   64 normal            1    0.2266    0.2266        0",
      "pow   32 normal            1    0.4503    0.4503        0",
      "pow   64 edge              1    0.0000    0.0000        0",
      "pow   64 normal            2    0.4635    0.2317        0",
      "asin  32 normal            1    0.2922    0.2922        0",
      "asin  64 normal            1    0.1517    0.1517        0",
      "atan2 32 normal            1    0.3667    0.3667        0",
      "atan2 64 normal            1    0.2530    0.2530        0",
      "all points within the documented 1-ulp bound; every edge case as IEEE 754 specifies",
    ),
  },
  {
    kind: "math",
    input: MATH_BAD,
    chunk: null,
    code: 1,
    out: lines(
      "fn    w  section      points   max ulp  mean ulp  >0.5ulp",
      "exp   64 edge              1       inf       inf        1",
      "exp   64 normal            1    0.3429    0.3429        0",
      "hypot 32 normal            1    0.1621    0.1621        0",
      "pow   64 normal            1    1.0000    1.0000        1",
      "BOUND MISSED (>= 1 ulp, or a wrong edge case): [('E', 64, 'edge'), ('P', 64, 'normal')] inexact exact powers: 1",
    ),
  },
  {
    kind: "math",
    input: null,
    chunk: null,
    code: 2,
    out: lines("usage: vl run scripts/std-math/math-grade.vl -- <transcript>"),
  },
];

Deno.test({
  name:
    "std-math graders: trig and math transcripts, in one piece and fanned out",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_std_math_grade_" });
    try {
      for (const [i, c] of CASES.entries()) {
        const args = [
          "run",
          `scripts/std-math/${c.kind}-grade.vl`,
          "--compiler",
          COMPILER,
          "--",
        ];
        if (c.input !== null) {
          const path = `${dir}/t${i}.txt`;
          await Deno.writeTextFile(path, c.input);
          args.push(path);
        }
        const extra: Record<string, string> = { VL, SEED: COMPILER };
        if (c.chunk !== null) extra.GRADE_CHUNK = c.chunk;
        const { code, stdout } = await new Deno.Command(VL, {
          args,
          cwd: ROOT,
          stdout: "piped",
          stderr: "piped",
          env: nativeEnv(extra),
        }).output();
        const out = dec.decode(stdout);
        const name = `${c.kind} case ${i}`;
        if (code !== c.code) {
          throw new Error(
            `[${name}] want exit ${c.code}, got ${code}:\n${out}`,
          );
        }
        if (out !== c.out) {
          throw new Error(`[${name}] want:\n${c.out}\ngot:\n${out}`);
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
