// Freshness gate for `std/embedded.ts` (the goldens pattern): the checked-in
// generated file must equal, byte for byte, what `deno task gen-std` would
// write from today's `std/*.vl` sources. The embedded map is what the LSP
// checkers and the playground serve `std:` imports from (docs/std-design.md
// D3) — a stale map means the editor and the CLI disagree about std.
//
// Run: deno test -A --no-check tests/std_embedded_test.ts
// Fix: deno task gen-std

import { collectStdSources, renderEmbedded } from "../scripts/gen-std.ts";
import { STD_SOURCES } from "../std/embedded.ts";

const EMBEDDED = new URL("../std/embedded.ts", import.meta.url);

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
