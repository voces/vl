// A `vl check --batch` wave compiles many programs on one compiler instance, so each program's
// verdict must not depend on the one before it. The frame's local registry (`localIsRef`,
// `localSlotOfDecl`, ...) is filled per function by `buildLocals`, and passes before the first
// frame read it. A program whose emit fails inside a function left that frame's registry behind,
// and the next program's mono read its locals as closures. `emitProgramReset` now empties it.
//
// The pair is the one that found it: the alias-chain refusal fails while 70 closure locals are
// registered, and the escaping-list case then refused at a different site than it does alone.

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const FIRST =
  `${ROOT}/tests/cases/closures/error-hole-lambda-alias-chain-too-long.vl`;
const SECOND =
  `${ROOT}/tests/cases/closures/listed-hole-fn-escaping-list-reject.vl`;

type Rec = { file: string; exit: number; diagnostics: { message: string }[] };

const batch = async (files: string[]): Promise<Rec[]> => {
  const { stdout } = await new Deno.Command(VL, {
    args: [
      "check",
      "--batch",
      "--json",
      "--codegen",
      ...files,
      "--compiler",
      COMPILER,
    ],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  return new TextDecoder().decode(stdout).split("\n").filter((l) =>
    l.trim() !== ""
  ).map(
    (l) => JSON.parse(l) as Rec,
  );
};

const verdict = (r: Rec | undefined): string =>
  r
    ? `${r.exit}: ${r.diagnostics.map((d) => d.message).join(" | ")}`
    : "<no record>";

Deno.test({
  name:
    "check --batch: a program after an emit failure inside a function gets its solo verdict",
  ignore: !exists(VL) || !exists(COMPILER),
  fn: async () => {
    const alone = verdict((await batch([SECOND]))[0]);
    const after = verdict((await batch([FIRST, SECOND]))[1]);
    if (after !== alone) {
      throw new Error(
        `want the solo verdict after ${FIRST}\n  want: ${alone}\n  got:  ${after}`,
      );
    }
  },
});
