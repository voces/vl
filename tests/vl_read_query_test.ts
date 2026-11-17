// The read query (`compiler/elab_reads.vl`, `elabReadFns`): check asks it after `elabPrepare`, mono's
// rewrite asks it before re-pointing a read. Armed with `$VL_REP_SHADOW`, check's answer for each
// callee read is saved and every mono ask is compared with it (`repAB/mfr … -> call/same`); a
// `changed` means the two disagree. The iface dump's `reads` line counts the saved answers, and it
// prints from `vl check --codegen` even where the build is refused, which is what STORE's
// check-time refusal for D16881 reads.
//
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-read-query] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();

const run = async (
  args: string[],
  env: Record<string, string>,
): Promise<string> => {
  const { stderr } = await new Deno.Command(VL, {
    args: [...args, "--compiler", COMPILER],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1", ...env }),
  }).output();
  return dec.decode(stderr);
};

// Corpus programs whose callee reads cover the answering rungs: slot flow, a const list's
// element, literal-index steps and a loop variable's slot flow.
const AGREE = [
  "tests/cases/generics/fn-value-generic-container-read-listed-or-stored.vl",
  "tests/cases/closures/generic-list-sliced-called-at-two-types.vl",
];

Deno.test({
  name: "read query: mono's ask gets check's saved answer, call by call",
  ignore: !ENABLED,
  fn: async () => {
    for (const f of AGREE) {
      const dir = await Deno.makeTempDir({ prefix: "vl_read_query_" });
      try {
        const err = await run(["build", f, "-o", `${dir}/out.wasm`], {
          VL_REP_SHADOW: "1",
        });
        const asks = err.split("\n").filter((l) => l.includes("repAB/mfr "));
        const calls = asks.filter((l) => / -> call\//.test(l));
        if (calls.length === 0) {
          throw new Error(
            `${f}: want mono to ask about a callee read, got none`,
          );
        }
        const bad = calls.filter((l) => !/ -> call\/same x/.test(l));
        if (bad.length > 0) {
          throw new Error(
            `${f}: want every ask same as check, got:\n${bad.join("\n")}`,
          );
        }
      } finally {
        await Deno.remove(dir, { recursive: true });
      }
    }
  },
});

const HOLDER = "function inc0(a) { return a + 1 }\n" +
  "function half(a) { return a / 2.0 }\n" +
  "function id2(x) { return x }\n" +
  "function app(o) { return o.l[0](3) }\n" +
  "const ll = id2([half, inc0])\n";

// D16881's witness and D16878's same-order spelling: check's answer for `o.l[0]` is several
// functions where the instances hand the list in two orders, one where they agree.
const SPLIT: { name: string; src: string; want: RegExp }[] = [
  {
    name: "two orders",
    src: HOLDER +
      "print(app({ l: [inc0, half] }))\nprint(app({ l: [half, inc0] }))\n",
    want: /^reads one 0 many 1 /,
  },
  {
    name: "one order",
    src: HOLDER +
      "print(app({ l: [inc0, half] }))\nprint(app({ l: [inc0, half] }))\n",
    want: /^reads one 1 many 0 /,
  },
];

Deno.test({
  name: "read query: check answers D16881's callee read on a refused build",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_read_query_" });
    try {
      for (const c of SPLIT) {
        const file = `${dir}/p.vl`;
        await Deno.writeTextFile(file, c.src);
        const err = await run(["check", "--codegen", file], {
          VL_REP_SHADOW: "1",
          VL_IFACES: "1",
        });
        const pre = `[iface] ${file}: reads `;
        const line = err.split("\n").find((l) => l.startsWith(pre));
        const got = line === undefined
          ? ""
          : line.slice(pre.length - "reads ".length);
        if (!c.want.test(got)) {
          throw new Error(
            `${c.name}: want ${c.want}, got ${JSON.stringify(got)}\n${err}`,
          );
        }
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
