// A FLATTENED record list read out of range traps with the engine's bounds trap, at every rung.
//
// `-O`/`-O3` store a list of never-written records as one array of their fields (D3681), so a
// list index's failure path is rewritten with it. That path is a one-element copy to index
// `len` (SP-056): past the end however the list is laid out, and never by an address sum that
// lands exactly on 2^32, which only an engine checking without wraparound would refuse. Each
// fixture in `tests/fixtures/opt-bounds/` is built plain, at `-O` and at `-O3`; the optimised
// builds must have flattened the list (`$VL_OPT_FLAT_DUMP`), print the same line before the
// trap, and trap with `out of bounds array access`. At `-O` master trapped with `unreachable`.
//
// @test-timing opt
import { ENABLED, ROOT, vl } from "./support/nativeRelease.ts";

const DIR = `${ROOT}/tests/fixtures/opt-bounds`;
const FIXTURES = [
  "flat-index-big",
  "flat-index-negative",
  "flat-readonly",
  "flat-empty",
];
const WANT_OUT = ["12400"];

for (const fx of FIXTURES) {
  for (const rung of ["", "-O", "-O3"]) {
    Deno.test({
      name: `a flattened record list traps on its bounds: ${fx} ${
        rung || "plain"
      }`,
      ignore: !ENABLED,
      fn: async () => {
        const tmp = await Deno.makeTempDir();
        try {
          const out = `${tmp}/m.wasm`;
          const dump = `${tmp}/flat.wasm`;
          const flags = rung === "" ? [] : [rung];
          const b = await vl(
            ["build", `${DIR}/${fx}.vl`, ...flags, "-o", out],
            {
              VL_OPT_FLAT_DUMP: dump,
            },
          );
          if (b.code !== 0) {
            throw new Error(`${fx} ${rung}: vl build failed: ${b.err.trim()}`);
          }
          let flat = true;
          try {
            Deno.statSync(dump);
          } catch {
            flat = false;
          }
          if (rung !== "" && !flat) {
            throw new Error(
              `${fx} ${rung}: the list was not flattened, so this pins nothing`,
            );
          }
          const r = await vl(["run", out]);
          const got = r.out.split("\n").filter((l) => l.length > 0);
          if (r.code === 0) {
            throw new Error(`${fx} ${rung}: exited 0 — the index did not trap`);
          }
          if (JSON.stringify(got) !== JSON.stringify(WANT_OUT)) {
            throw new Error(
              `${fx} ${rung}: the stdout before the trap moved\n  want ${
                JSON.stringify(WANT_OUT)
              }\n  got  ${JSON.stringify(got)}`,
            );
          }
          if (!r.err.includes("wasm trap: out of bounds array access")) {
            throw new Error(
              `${fx} ${rung}: not the engine's bounds trap\n  got ${
                JSON.stringify(r.err)
              }`,
            );
          }
        } finally {
          await Deno.remove(tmp, { recursive: true });
        }
      },
    });
  }
}
