// The TABLE rows of the view-bounds shape suite — one test per
// `bench/buffer-view-bounds/` fixture, graded at all three optimizer rungs. The
// P1.4 contract moved to `vl_buffer_view_bounds_contract_test.ts` so `deno test
// --parallel` can run the two concurrently; the machinery and the table (with the
// prose that explains every cell) are in the shared support module.
//
// @test-timing opt
import {
  ENABLED,
  RUNGS,
  TABLE,
  shapeOf,
} from "./support/viewBoundsShape.ts";

for (const [fixture, row] of Object.entries(TABLE)) {
  Deno.test({
    name: `view-bounds shape: ${fixture}`,
    ignore: !ENABLED,
    fn: async () => {
      const seen: string[] = [];
      const bad: string[] = [];
      for (const rung of RUNGS) {
        const got = await shapeOf(fixture, rung.flag);
        const want = row[rung.name];
        seen.push(`${rung.name}=[${got.trap},${got.call},${got.sget}]`);
        if (got.trap !== want.trap || got.call !== want.call || got.sget !== want.sget) {
          bad.push(
            `${rung.name}: [trap,call,sget] = [${got.trap},${got.call},${got.sget}], ` +
              `want [${want.trap},${want.call},${want.sget}]`,
          );
        }
      }
      if (bad.length) {
        throw new Error(
          `${fixture} loop shape moved — ${bad.join("; ")}\n` +
            `  observed: ${seen.join(" ")}\n` +
            `  A moved cell is a P1.4 finding: re-derive it from the disassembly and\n` +
            `  re-justify buffer-design.md §M in the same commit.`,
        );
      }
    },
  });
}
