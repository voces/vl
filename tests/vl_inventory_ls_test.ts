// THE INVENTORY QUEUE, PINNED — `scripts/inventory/ls.vl` on a fixture checkout.
//
// `ls.vl` lists filed rows in id order with their declared outcome, filters them by
// `--status`, and hands out the next free id while skipping every range `RESERVED.md` holds.
// It resolves every path, `RESERVED.md` included, against the working directory, so this
// runs it in a temporary directory shaped like a checkout: the real tree's reservations are
// never touched. The listing was graded beside the Python script it replaced, flag by flag,
// before that was deleted; what is pinned here is that agreed behaviour.
//
// No assertion library, per CLAUDE.md.
// @test-timing native

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER);
if (GATED && !ENABLED) {
  console.warn("[vl-inventory-ls] skipped — missing vl binary or seed wasm.");
}

const dec = new TextDecoder();
type Out = { code: number; out: string; err: string };

const run = async (cwd: string, args: string[]): Promise<Out> => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args,
    cwd,
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv({ NO_COLOR: "1" }),
  }).output();
  return { code, out: dec.decode(stdout), err: dec.decode(stderr) };
};

// The script is built once and the build run per case: each case is then one instantiation.
let WASM = "";
const ls = (cwd: string, argv: string[]) =>
  run(cwd, ["run", WASM, "--", ...argv]);

const ROWS: Record<string, string> = {
  D2: "### D2 — a closed row\n**closed · runs**\n",
  D10: "### D10 — a silent row\n**check-clean invalid wasm**\n",
  D3: "### D3 — a loud row\n**loud emit reject**\n",
  D7: "### D7 — a negated status\n**not closed by D2**\n",
  D4: "### D4 — a trap\n**loads then traps**\n",
};

// Everything above the marker is kept as written; the ranges below it are rewritten sorted.
const RESERVED_HEAD = "# Reserved inventory id ranges\n\n" +
  "<!-- reservations below; the marker is what --reserve/--release edit around -->\n\n";

const check = (
  label: string,
  got: Out,
  code: number,
  out: string,
  err = "",
) => {
  if (got.code !== code || got.out !== out || got.err !== err) {
    throw new Error(
      `${label}: want exit ${code}, stdout:\n${out}stderr:\n${err}\n` +
        `got exit ${got.code}, stdout:\n${got.out}stderr:\n${got.err}`,
    );
  }
};

Deno.test({
  name:
    "inventory ls: listing, filters, --next and reservations on a fixture checkout",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl_inv_ls_" });
    try {
      WASM = `${dir}/ls.wasm`;
      const built = await run(ROOT, [
        "build",
        "scripts/inventory/ls.vl",
        "--compiler",
        COMPILER,
        "-o",
        WASM,
      ]);
      if (built.code !== 0) {
        throw new Error(`building ls.vl:\n${built.out}${built.err}`);
      }
      const inv = `${dir}/docs/internals/inventory`;
      await Deno.mkdir(inv, { recursive: true });
      await Deno.mkdir(`${dir}/docs/internals/inventory-2`);
      for (const [id, row] of Object.entries(ROWS)) {
        await Deno.writeTextFile(`${inv}/${id}.md`, row);
      }
      await Deno.writeTextFile(
        `${dir}/docs/internals/inventory-2/D1.md`,
        "### D1 — the second inventory\n**closed**\n",
      );
      const reserved = `${inv}/RESERVED.md`;
      await Deno.writeTextFile(reserved, RESERVED_HEAD);

      // Id order across both default targets, D2 before D10; a negated status files "?".
      check(
        "no arguments",
        await ls(dir, []),
        0,
        "D1   runs                   the second inventory\n" +
          "D2   runs                   a closed row\n" +
          "D3   emit_reject            a loud row\n" +
          "D4   trap_loads             a trap\n" +
          "D7   ?                      a negated status\n" +
          "D10  silent_invalid_wasm    a silent row\n\n" +
          "6 of 6 rows · docs/internals/inventory, docs/internals/inventory-2\n",
      );
      check(
        "--status silent",
        await ls(dir, ["--status", "silent", "docs/internals/inventory"]),
        0,
        "D10  silent_invalid_wasm    a silent row\n\n" +
          "1 of 5 rows · --status silent · docs/internals/inventory\n",
      );
      check(
        "--status open --tail 2",
        await ls(dir, [
          "--status",
          "open",
          "--tail",
          "2",
          "docs/internals/inventory",
        ]),
        0,
        "D7   ?                      a negated status\n" +
          "D10  silent_invalid_wasm    a silent row\n\n" +
          "2 of 5 rows · --status open · docs/internals/inventory\n",
      );

      // --next is one past the highest id in the first inventory, skipping reservations.
      check("--next", await ls(dir, ["--next"]), 0, "D11\n");
      const date = new Date().toLocaleDateString("sv-SE");
      check(
        "--reserve",
        await ls(dir, [
          "--reserve",
          "D11-D12",
          "a holder",
          "a note, with commas",
        ]),
        0,
        "reserved D11-D12\n",
      );
      const line = `D11-D12  a holder  ${date}  a note, with commas\n`;
      const after = await Deno.readTextFile(reserved);
      if (after !== RESERVED_HEAD + line) {
        throw new Error(
          `--reserve: want RESERVED.md to gain\n${line}got:\n${after}`,
        );
      }
      check(
        "--next past a reservation",
        await ls(dir, ["--next"]),
        0,
        "D13\n",
        `  skipped D11-D12 — a holder, ${date}, a note, with commas\n`,
      );
      check(
        "--reserve over a held range",
        await ls(dir, ["--reserve", "D12-D14", "me"]),
        1,
        `ls.vl: D12-D14 overlaps D11-D12, held by a holder since ${date} (a note, with commas)\n`,
      );
      check(
        "--release of a range not held exactly",
        await ls(dir, ["--release", "D11-D13"]),
        2,
        "ls.vl: no reservation exactly D11-D13 to release\n",
      );
      check(
        "--release",
        await ls(dir, ["--release", "D11-D12"]),
        0,
        "released D11-D12\n",
      );
      if (await Deno.readTextFile(reserved) !== `${RESERVED_HEAD}\n`) {
        throw new Error(`--release: want RESERVED.md back to its header`);
      }
      check(
        "a malformed range",
        await ls(dir, ["--reserve", "D12-X", "me"]),
        2,
        "ls.vl: range must read D<lo>-D<hi>, got 'D12-X'\n",
      );
      check(
        "a backwards range",
        await ls(dir, ["--reserve", "D20-D10", "me"]),
        2,
        "ls.vl: D20-D10 runs backwards\n",
      );
      const usage = await ls(dir, ["--bogus"]);
      if (usage.code !== 2 || !usage.out.startsWith("usage:")) {
        throw new Error(
          `an unknown flag: want exit 2 and the usage, got ${usage.code}:\n${usage.out}`,
        );
      }
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
