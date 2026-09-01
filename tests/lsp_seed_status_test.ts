// D9.2 status-bar seed indicator: the server forwards `loadWasmChecker`'s
// origin callback as a `vital/seedOrigin` notification and the extension
// renders it via the pure `seedStatusView` (typeFeatures.ts). The
// server/extension plumbing is Node/VS Code-only, so what's tested here is
// (a) the rendering contract — text, tooltip, degraded state — and (b) the
// loader's origin callback itself, seed-backed: the winning rung is reported
// with its label/detail/bytes, and a ladder with no viable rung reports
// undefined (the degraded state). The seed-backed tests load the real seed
// (`build/vl-compiler.wasm`) and self-ignore when it is absent, the same
// convention as the rest of the wasm suite.

import { seedStatusView } from "../lsp/src/typeFeatures.ts";
import {
  loadWasmChecker,
  type SeedOrigin,
} from "../lsp/src/wasmCheckerNode.ts";

const SEED = new URL("../build/vl-compiler.wasm", import.meta.url).pathname;
const seedExists = (() => {
  try {
    Deno.statSync(SEED);
    return true;
  } catch {
    return false;
  }
})();
const ignore = !seedExists;
const log = (_m: string) => {};

// ---- pure rendering ---------------------------------------------------------

Deno.test("seed-status: a loaded origin renders its rung label, path and size", () => {
  const view = seedStatusView({
    label: "bundled seed",
    detail: "/ext/dist/vl-compiler.wasm",
    bytes: 1_700_000,
  });
  if (view.degraded) throw new Error("a loaded seed is not degraded");
  if (view.text !== "vl: bundled seed") {
    throw new Error(`want "vl: bundled seed", got "${view.text}"`);
  }
  if (!view.tooltip.includes("/ext/dist/vl-compiler.wasm")) {
    throw new Error(`want the detail path in the tooltip, got "${view.tooltip}"`);
  }
  if (!view.tooltip.includes("1.6 MiB")) {
    throw new Error(`want a human size in the tooltip, got "${view.tooltip}"`);
  }
});

Deno.test("seed-status: the no-seed state is degraded, with icon and remedy", () => {
  const view = seedStatusView(null);
  if (!view.degraded) throw new Error("no seed must render degraded");
  if (!view.text.includes("$(warning)") || !view.text.includes("no seed")) {
    throw new Error(`want a warning icon + "no seed", got "${view.text}"`);
  }
  // The tooltip must say what is broken and how to fix it.
  if (
    !view.tooltip.includes("vital.compilerWasm") ||
    !view.tooltip.includes("PATH")
  ) {
    throw new Error(`want the remedy in the tooltip, got "${view.tooltip}"`);
  }
});

Deno.test("seed-status: a sub-MiB seed renders in KiB", () => {
  const view = seedStatusView({ label: "seed", detail: "/x", bytes: 320_000 });
  if (!view.tooltip.includes("313 KiB")) {
    throw new Error(`want "313 KiB" (320000/1024 rounded), got "${view.tooltip}"`);
  }
});

// ---- seed-backed: the loader's origin callback ------------------------------

Deno.test({
  name: "seed-status(wasm): the winning rung reports label, detail and bytes",
  ignore,
}, () => {
  let reported: SeedOrigin | undefined | "never" = "never";
  const checker = loadWasmChecker(SEED, log, undefined, (origin) => {
    reported = origin;
  });
  if (checker === undefined) throw new Error("want a checker from the seed");
  if (reported === "never") throw new Error("want onOrigin to fire on load");
  const origin = reported as SeedOrigin | undefined;
  if (origin === undefined) {
    throw new Error("want a defined origin for a loadable seed");
  }
  // The single-path form labels its one rung "seed"; detail is the path.
  if (origin.label !== "seed") {
    throw new Error(`want label "seed", got "${origin.label}"`);
  }
  if (origin.detail !== SEED) {
    throw new Error(`want detail ${SEED}, got ${origin.detail}`);
  }
  if (origin.bytes <= 0) {
    throw new Error(`want a positive byte count, got ${origin.bytes}`);
  }
});

// No seed required: a ladder of one nonexistent rung fails the same way on
// every machine, so this one is not gated on the seed's presence.
Deno.test("seed-status: a ladder with no viable rung reports undefined (degraded)", () => {
  let reported: SeedOrigin | undefined | "never" = "never";
  const checker = loadWasmChecker(
    [{ kind: "path", label: "workspace build/", path: "/no/such/seed.wasm" }],
    log,
    undefined,
    (origin) => {
      reported = origin;
    },
  );
  if (checker !== undefined) throw new Error("want no checker without a seed");
  if (reported !== undefined) {
    throw new Error(
      `want onOrigin(undefined) for the degraded state, got ${
        JSON.stringify(reported)
      }`,
    );
  }
});
