// The LSP's per-document check scheduler (`lsp/src/latestWins.ts`, wired in `server.ts`): a
// burst of edits runs one check and publishes once, carrying the last version; an edit during a
// running check drops that check's result and runs one more. The last case loads the real seed:
// a hover in the debounce window, after an edit no check has seen, answers from a consistent
// staging, the one a fresh checker builds for the text the hover reads.

import {
  CHECK_DEBOUNCE_MS,
  isCurrent,
  latestWins,
  type Timers,
} from "../lsp/src/latestWins.ts";
import { filePath } from "./support/filePath.ts";
import { loadWasmChecker } from "../lsp/src/wasmCheckerNode.ts";
import { seedPresent } from "./support/tree.ts";

const want = (what: string, got: unknown, expected: unknown) => {
  if (JSON.stringify(got) !== JSON.stringify(expected)) {
    throw new Error(
      `${what}: want ${JSON.stringify(expected)}, got ${JSON.stringify(got)}`,
    );
  }
};

// A manual clock: `tick` fires every armed timer, in arming order.
const manualClock = () => {
  let next = 0;
  const armed = new Map<number, () => void>();
  const timers: Timers = {
    set: (f) => {
      armed.set(++next, f);
      return next;
    },
    clear: (h) => {
      armed.delete(h as number);
    },
  };
  const tick = () => {
    const due = [...armed.values()];
    armed.clear();
    for (const f of due) f();
  };
  return { timers, tick, pending: () => armed.size };
};

// `server.ts`'s `checkDocument` in shape: read the version, check (here a promise the test
// settles), publish only while the document is still at that version.
const harness = () => {
  const clock = manualClock();
  const version = new Map<string, number>();
  const published: { uri: string; version: number }[] = [];
  const settle: (() => void)[] = [];
  let runs = 0;
  const checks = latestWins(
    async (uri) => {
      const v = version.get(uri) ?? 0;
      runs++;
      await new Promise<void>((r) => settle.push(r));
      if (isCurrent(v, version.get(uri))) published.push({ uri, version: v });
    },
    CHECK_DEBOUNCE_MS,
    clock.timers,
  );
  const edit = (uri: string) => {
    version.set(uri, (version.get(uri) ?? 0) + 1);
    checks.schedule(uri);
  };
  const drain = async () => {
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
      settle.splice(0).forEach((r) => r());
      await new Promise((r) => setTimeout(r, 0));
    }
  };
  return { clock, checks, edit, drain, published, runs: () => runs, settle };
};

Deno.test("latest-wins: a burst of edits is one check and one publish of the last version", async () => {
  const h = harness();
  for (let i = 0; i < 5; i++) h.edit("a.vl");
  want("one timer armed for the burst", h.clock.pending(), 1);
  want("nothing runs before the pause", h.runs(), 0);
  h.clock.tick();
  await h.drain();
  want("checks run", h.runs(), 1);
  want("publishes", h.published, [{ uri: "a.vl", version: 5 }]);
});

Deno.test("latest-wins: an edit during a running check drops its result and runs once more", async () => {
  const h = harness();
  h.edit("a.vl");
  h.clock.tick();
  await Promise.resolve();
  want("the first check is running", h.runs(), 1);
  // Two edits land while it runs; the debounce fires once, owing one more check.
  h.edit("a.vl");
  h.edit("a.vl");
  h.clock.tick();
  await h.drain();
  want("checks run", h.runs(), 2);
  want("only the last version publishes", h.published, [{
    uri: "a.vl",
    version: 3,
  }]);
});

Deno.test("latest-wins: documents debounce apart, and a closed one runs nothing", async () => {
  const h = harness();
  h.edit("a.vl");
  h.edit("b.vl");
  h.checks.cancel("b.vl");
  h.clock.tick();
  await h.drain();
  want("publishes", h.published, [{ uri: "a.vl", version: 1 }]);
});

const SEED = filePath(new URL("../build/vl-compiler.wasm", import.meta.url));
const KEY = "/proj/main.vl";
const v1 = "const r = 1\nprint(r)\n";
const v2 = 'const r = "one"\nprint(r)\n';
const read = (_key: string) => undefined;

Deno.test({
  name:
    "latest-wins: a hover in the debounce window answers from the text it reads",
  ignore: !seedPresent(SEED),
}, async () => {
  const c = loadWasmChecker(SEED, () => {})!;
  await c.check(v1, KEY, read);
  want(
    "`r` after the check of v1",
    await c.hoverTypeAt(v1, KEY, read, 0, 6),
    "i32",
  );
  // The edit to v2: the server bumps the reader generation and arms the debounce; no check of v2
  // has run when the hover arrives.
  c.bumpReaderGeneration();
  const during = await c.hoverTypeAt(v2, KEY, read, 0, 6);
  const fresh = await loadWasmChecker(SEED, () => {})!.hoverTypeAt(
    v2,
    KEY,
    read,
    0,
    6,
  );
  want("the hover over v2 is a fresh checker's", during, fresh);
  want("which is v2's type", during, '"one"');
  // The debounced check of v2, then the same hover: unchanged.
  await c.check(v2, KEY, read);
  want(
    "`r` after the check of v2",
    await c.hoverTypeAt(v2, KEY, read, 0, 6),
    '"one"',
  );
});
