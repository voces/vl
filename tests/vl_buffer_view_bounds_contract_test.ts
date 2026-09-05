// The P1.4 CONTRACT rows of the view-bounds suite — three assertions that hold
// whatever the exact counts in `TABLE` are. Its own file so `deno test --parallel`
// runs it beside the table rows; the machinery is in the shared support module.
//
// @test-timing opt
import {
  ENABLED,
  shapeOf,
} from "./support/viewBoundsShape.ts";

// The P1.4 CONTRACT itself, stated as three assertions that hold no matter what
// the exact counts above are. These are what a kernel author is told, so they are
// checked directly rather than inferred from the table.
Deno.test({
  name: "view-bounds contract: fenced checks survive -O3, the fast pattern is bare",
  ignore: !ENABLED,
  fn: async () => {
    for (const shape of ["scale", "reduce", "axpy", "rows"]) {
      const view = await shapeOf(`${shape}-view`, "-O3");
      const buf = await shapeOf(`${shape}-buf`, "-O3");
      const hoist = await shapeOf(`${shape}-hoist`, "-O3");
      // (1) The fence is NOT eliminated by the release profile.
      if (view.trap === 0) {
        throw new Error(
          `${shape}-view has no trap left inside its loop at -O3 — the per-access ` +
            `bounds check was eliminated. That is a real improvement and a real ` +
            `documentation change: buffer-design.md §M and webcraft-requirements.md ` +
            `P1.4 both state that it survives.`,
        );
      }
      // (2) The unfenced twin has no check, so the delta is the fence and nothing else.
      if (buf.trap !== 0) {
        throw new Error(
          `${shape}-buf has ${buf.trap} trap(s) inside its loop at -O3 — the ` +
            `"unfenced twin" is no longer unfenced, so (view - buf) stops measuring ` +
            `the fence.`,
        );
      }
      // (3) The stated fast pattern really is bare: no call and no check.
      if (hoist.trap !== 0 || hoist.call !== 0) {
        throw new Error(
          `${shape}-hoist is not bare at -O3: [trap,call] = [${hoist.trap},${hoist.call}]. ` +
            `The fast pattern documented in §M5 must lower to the intrinsic with ` +
            `nothing per access.`,
        );
      }
    }
  },
});
