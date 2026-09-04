// Freshness gate for the two CHECKED-IN copies of `std/*.vl` (the goldens
// pattern): both must equal, byte for byte, what `deno task gen-std` would write
// from today's sources.
//
//   std/embedded.ts                      the LSP checkers (via `withStd`) and
//                                        the playground (docs/std-design.md D3)
//   scripts/vl-host/src/std_embedded.rs  the `vl` binary's own std, so a pinned
//                                        toolchain is ONE file (D1573)
//
// One generator writes both, so staleness is one failure and the editor and the
// CLI cannot end up disagreeing about std. This test needs no binary and no
// seed: it is the gate a std edit actually trips, and `deno task gen-std` is the
// whole fix. (Whether a BUILT `vl` carries the current copy is a different
// question — `tests/vl_std_cmd_test.ts` and ci-embed-seed ask that one.)
//
// Run: deno test -A --no-check tests/std_embedded_test.ts
// Fix: deno task gen-std

import {
  collectStdSources,
  renderEmbedded,
  renderEmbeddedRust,
  stdHash,
} from "../scripts/gen-std.ts";
import { STD_SOURCES } from "../std/embedded.ts";

const EMBEDDED = new URL("../std/embedded.ts", import.meta.url);
const EMBEDDED_RS = new URL("../scripts/vl-host/src/std_embedded.rs", import.meta.url);

Deno.test("std/embedded.ts is fresh (regenerate with `deno task gen-std`)", async () => {
  const expected = renderEmbedded(await collectStdSources());
  const actual = await Deno.readTextFile(EMBEDDED);
  if (actual !== expected) {
    throw new Error(
      "std/embedded.ts is stale — `std/*.vl` changed without regenerating. " +
        "Run: deno task gen-std",
    );
  }
});

Deno.test("scripts/vl-host/src/std_embedded.rs is fresh (the same generator)", async () => {
  const expected = renderEmbeddedRust(await collectStdSources());
  const actual = await Deno.readTextFile(EMBEDDED_RS);
  if (actual !== expected) {
    throw new Error(
      "scripts/vl-host/src/std_embedded.rs is stale — `std/*.vl` changed without " +
        "regenerating, so a released `vl` would ship a std the tree no longer has. " +
        "Run: deno task gen-std",
    );
  }
});

Deno.test("both generated copies carry the same modules in the same order", async () => {
  const sources = await collectStdSources();
  const tsKeys = Object.keys(STD_SOURCES);
  const wantKeys = sources.map(([name]) => `std:${name}`);
  if (tsKeys.join(",") !== wantKeys.join(",")) {
    throw new Error(
      `embedded.ts keys disagree with the tree:\n  want ${wantKeys.join(",")}\n  got  ${
        tsKeys.join(",")
      }`,
    );
  }
  const rust = await Deno.readTextFile(EMBEDDED_RS);
  for (const [name, src] of sources) {
    if (!rust.includes(`("${name}", "`)) {
      throw new Error(`std_embedded.rs is missing the module \`${name}\``);
    }
    if (STD_SOURCES[`std:${name}`] !== src) {
      throw new Error(`embedded.ts carries a different source for \`${name}\``);
    }
  }
});

Deno.test("STD_SOURCES keys are well-formed std module keys", () => {
  const keys = Object.keys(STD_SOURCES);
  if (keys.length === 0) throw new Error("embedded std map is empty");
  const SHAPE = /^std:[a-z0-9_]+(\/[a-z0-9_]+)*$/;
  for (const key of keys) {
    if (!SHAPE.test(key)) {
      throw new Error(`embedded key ${JSON.stringify(key)} is not a valid std module key`);
    }
  }
});

Deno.test("stdHash is stable, and separates trees that differ by one byte", () => {
  const a: [string, string][] = [["array", "x"], ["fmt", "y"]];
  const first = stdHash(a);
  if (!/^[0-9a-f]{16}$/.test(first)) {
    throw new Error(`want 16 hex digits, got ${JSON.stringify(first)}`);
  }
  if (stdHash(a) !== first) throw new Error("stdHash is not deterministic");
  const others: [string, string][][] = [
    [["array", "x"], ["fmt", "z"]], // one byte of source
    [["array", "y"], ["fmt", "x"]], // the same bytes, differently placed
    [["arrays", "x"], ["fmt", "y"]], // one byte of NAME
    [["array", "x"]], // a module removed
  ];
  for (const other of others) {
    if (stdHash(other) === first) {
      throw new Error(`stdHash collided: ${JSON.stringify(other)} hashes as the control`);
    }
  }
});
