// The ALLOCATION-MELT rows of the release suite (`MELT_TABLE`). Its own file so
// `deno test --parallel` can run it beside the shape/loop/case rows rather than
// after them; the machinery and the table are in the shared support module.
//
// @test-timing opt
import {
  ENABLED,
  MELT,
  MELT_TABLE,
  buildAndCount,
  logsOf,
} from "./support/nativeRelease.ts";

for (const row of MELT_TABLE) {
  Deno.test({
    name: `native-release: ${row.fixture} — allocation sites melt ${row.none}/${row.O}/${row.O3} at (none)/-O/-O3`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${MELT}/${row.fixture}.vl`;
      const want = logsOf(Deno.readTextFileSync(src));
      const tmp = await Deno.makeTempDir();
      try {
        const got: Record<string, number> = {};
        for (const [label, flags] of [["none", []], ["-O", ["-O"]], ["-O3", ["-O3"]]] as const) {
          const r = await buildAndCount(src, [...flags], tmp);
          got[label] = r.sites;
          if (JSON.stringify(r.out) !== JSON.stringify(want)) {
            throw new Error(
              `${row.fixture}: ${label} changed behavior\n  want ${JSON.stringify(want)}\n  got  ${
                JSON.stringify(r.out)
              }`,
            );
          }
        }
        const wantT = { none: row.none, "-O": row.O, "-O3": row.O3 };
        if (JSON.stringify(got) !== JSON.stringify(wantT)) {
          throw new Error(
            `${row.fixture}: allocation-site count moved\n` +
              `  want ${JSON.stringify(wantT)}\n  got  ${JSON.stringify(got)}\n` +
              "  A count that went DOWN is a finding, not a break: re-measure and update\n" +
              "  MELT_TABLE + docs/internals/opt-profile-design.md §3 in the same change.",
          );
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}
