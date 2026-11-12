// THE CHANGELOG FOLD, PINNED — `scripts/changelog-fold.vl` on a fixture checkout.
//
// The fold moves each `changelog.d/` entry to the head of its CHANGELOG section in file-name
// order, rewrites the `FOLDED` pin and deletes the entries; `--check` writes nothing and
// refuses a CHANGELOG.md the pin does not match. It resolves paths against the working
// directory, so this runs it in a temporary directory and never touches the real tree.
// No assertion library, per CLAUDE.md.
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-changelog-fold] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
const pinOf = (bytes: Uint8Array) => {
  let h = 2166136261;
  for (const x of bytes) h = Math.imul(h ^ x, 16777619) >>> 0;
  return `bytes ${bytes.length} fnv1a32 ${h}`;
};

const fold = async (cwd: string, args: string[]) => {
  const { code, stdout } = await new Deno.Command(VL, {
    args: ["run", `${ROOT}/scripts/changelog-fold.vl`, "--", ...args],
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout) };
};

const want = (label: string, w: unknown, g: unknown) => {
  if (w !== g) {
    throw new Error(
      `${label}: want ${JSON.stringify(w)}, got ${JSON.stringify(g)}`,
    );
  }
};

Deno.test({
  name: "changelog-fold round-trips two entries and refuses a direct edit",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-changelog-fold-" });
    try {
      const log = `${dir}/CHANGELOG.md`;
      Deno.mkdirSync(`${dir}/changelog.d`);
      Deno.writeTextFileSync(
        log,
        "# T\n\n## Alpha\n\n- old a\n\n## Beta\n\n- old b\n",
      );
      Deno.writeTextFileSync(
        `${dir}/changelog.d/FOLDED`,
        pinOf(Deno.readFileSync(log)) + "\n",
      );
      Deno.writeTextFileSync(`${dir}/changelog.d/README.md`, "not an entry\n");
      Deno.writeTextFileSync(
        `${dir}/changelog.d/b.md`,
        "## Beta\n\n- two\n  more\n",
      );
      Deno.writeTextFileSync(
        `${dir}/changelog.d/a.md`,
        "\n## Alpha\n- one\n\n",
      );

      const c = await fold(dir, ["--check"]);
      want("--check exit", 0, c.code);
      want(
        "--check leaves the entries",
        true,
        Deno.statSync(`${dir}/changelog.d/a.md`).isFile,
      );

      const f = await fold(dir, []);
      want("fold exit", 0, f.code);
      want(
        "folded CHANGELOG.md",
        "# T\n\n## Alpha\n\n- one\n- old a\n\n## Beta\n\n- two\n  more\n- old b\n",
        Deno.readTextFileSync(log),
      );
      want(
        "entries deleted, README kept",
        "FOLDED,README.md",
        [...Deno.readDirSync(`${dir}/changelog.d`)].map((e) => e.name).sort()
          .join(","),
      );
      want("pin rewritten", 0, (await fold(dir, ["--check"])).code);

      Deno.writeTextFileSync(log, Deno.readTextFileSync(log) + "- direct\n");
      const d = await fold(dir, ["--check"]);
      want("a direct edit is refused", 1, d.code);
      want(
        "the refusal says so",
        true,
        d.out.includes("edited outside the fold"),
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
