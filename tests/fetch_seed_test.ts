// SEED FETCH FAILS CLOSED — scripts/fetch-seed.sh installs a seed only when its SHA-256
// equals the release's `.sha256` sidecar, and for `seed-v0` also the hash committed in
// scripts/seed-v0.sha256. A missing, empty or mismatched checksum exits non-zero and
// leaves no seed behind. The release is a `file://` directory through `$VL_SEED_BASE`,
// so this needs no network and no seed. No assertion library, per CLAUDE.md.

import { ROOT } from "./support/tree.ts";

const SCRIPT = `${ROOT}/scripts/fetch-seed.sh`;
const ASSET = "vl-compiler.wasm";

const sha256 = async (bytes: Uint8Array): Promise<string> =>
  [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((b) => b.toString(16).padStart(2, "0")).join("");

/** Run fetch-seed.sh against a release dir holding `files`; report exit and what landed. */
const fetchFrom = async (
  files: Record<string, Uint8Array | string>,
  tag = "seed-latest",
  present:
    | { bytes: Uint8Array; src?: boolean; env?: Record<string, string> }
    | null = null,
) => {
  const rel = await Deno.makeTempDir({ prefix: "vl-fetch-seed-" });
  try {
    for (const [name, body] of Object.entries(files)) {
      if (typeof body === "string") {
        await Deno.writeTextFile(`${rel}/${name}`, body);
      } else await Deno.writeFile(`${rel}/${name}`, body);
    }
    const out = `${rel}/out/${ASSET}`;
    if (present) {
      await Deno.mkdir(`${rel}/out`);
      await Deno.writeFile(out, present.bytes);
      if (present.src) await Deno.writeTextFile(`${out}.src`, "fold 1\n");
    }
    const { code, stdout, stderr } = await new Deno.Command("bash", {
      args: [SCRIPT],
      env: {
        VL_SEED_BASE: `file://${rel}`,
        VL_SEED_TAG: tag,
        SEED: out,
        ...(present?.env ?? {}),
      },
      stdout: "piped",
      stderr: "piped",
    }).output();
    let installed: Uint8Array | null = null;
    try {
      installed = await Deno.readFile(out);
    } catch { /* not installed */ }
    const dec = new TextDecoder();
    return {
      code,
      out: dec.decode(stdout),
      err: dec.decode(stderr),
      installed,
    };
  } finally {
    await Deno.remove(rel, { recursive: true });
  }
};

const expect = (ok: boolean, what: string, err: string) => {
  if (!ok) throw new Error(`${what}\n  stderr: ${err.trim()}`);
};

const seed = new TextEncoder().encode("\0asm not really a seed");

Deno.test("fetch-seed installs a seed whose published checksum matches", async () => {
  const r = await fetchFrom({
    [ASSET]: seed,
    [`${ASSET}.sha256`]: `${await sha256(seed)}  ${ASSET}\n`,
  });
  expect(
    r.code === 0 && r.installed?.length === seed.length,
    "want exit 0 and the seed installed",
    r.err,
  );
});

Deno.test("fetch-seed refuses a release with no checksum", async () => {
  const r = await fetchFrom({ [ASSET]: seed });
  expect(
    r.code !== 0 && r.installed === null,
    "want non-zero and no seed",
    r.err,
  );
});

Deno.test("fetch-seed refuses an empty or malformed checksum", async () => {
  for (const sum of ["", `deadbeef  ${ASSET}\n`]) {
    const r = await fetchFrom({ [ASSET]: seed, [`${ASSET}.sha256`]: sum });
    expect(
      r.code !== 0 && r.installed === null,
      `want non-zero and no seed for ${JSON.stringify(sum)}`,
      r.err,
    );
  }
});

Deno.test("fetch-seed refuses a checksum mismatch", async () => {
  const r = await fetchFrom({
    [ASSET]: seed,
    [`${ASSET}.sha256`]: `${"0".repeat(64)}  ${ASSET}\n`,
  });
  expect(
    r.code !== 0 && r.installed === null,
    "want non-zero and no seed",
    r.err,
  );
});

Deno.test("fetch-seed holds seed-v0 to the committed hash, not the published one", async () => {
  const r = await fetchFrom(
    { [ASSET]: seed, [`${ASSET}.sha256`]: `${await sha256(seed)}  ${ASSET}\n` },
    "seed-v0",
  );
  expect(
    r.code !== 0 && r.installed === null,
    "want non-zero: the bytes are not the pinned seed-v0",
    r.err,
  );
  const pinned =
    (await Deno.readTextFile(`${ROOT}/scripts/seed-v0.sha256`)).split(/\s+/)[0];
  expect(
    /^[0-9a-f]{64}$/.test(pinned),
    "scripts/seed-v0.sha256 pins one SHA-256",
    pinned,
  );
});

// A seed already present is checked against the release, not trusted for being there.
const fresh = new TextEncoder().encode("\0asm the current seed");
const stale = new TextEncoder().encode("\0asm an old seed");
const same = (a: Uint8Array | null, b: Uint8Array) =>
  a !== null && a.length === b.length && a.every((x, i) => x === b[i]);

Deno.test("fetch-seed keeps a present seed whose hash is the release's", async () => {
  const sum = `${await sha256(fresh)}  ${ASSET}\n`;
  const r = await fetchFrom({ [`${ASSET}.sha256`]: sum }, "seed-latest", {
    bytes: fresh,
  });
  expect(
    r.code === 0 && same(r.installed, fresh) &&
      r.out.includes("seed up to date"),
    `want exit 0, the seed kept and "seed up to date"; got ${r.code}: ${r.out}`,
    r.err,
  );
});

Deno.test("fetch-seed refetches a present seed whose hash is not the release's", async () => {
  const sum = `${await sha256(fresh)}  ${ASSET}\n`;
  const r = await fetchFrom(
    { [ASSET]: fresh, [`${ASSET}.sha256`]: sum },
    "seed-latest",
    { bytes: stale },
  );
  expect(
    r.code === 0 && same(r.installed, fresh) &&
      r.out.includes("refetching: ") && r.out.includes(await sha256(stale)),
    `want exit 0, the release's seed installed and "refetching" naming the old hash; got ${r.code}: ${r.out}`,
    r.err,
  );
});

Deno.test("fetch-seed fails on a present seed it cannot check, unless told it is offline", async () => {
  // A release with no checksum stands for one that cannot be reached.
  const r = await fetchFrom({}, "seed-latest", { bytes: stale });
  expect(
    r.code !== 0 && same(r.installed, stale) && r.err.includes("may be stale"),
    `want non-zero, the seed untouched and "may be stale"; got ${r.code}`,
    r.err,
  );
  const off = await fetchFrom({}, "seed-latest", {
    bytes: stale,
    env: { VL_SEED_OFFLINE: "1" },
  });
  expect(
    off.code === 0 && same(off.installed, stale) &&
      off.err.includes("VL_SEED_OFFLINE=1"),
    `want exit 0 and the seed kept under VL_SEED_OFFLINE=1; got ${off.code}`,
    off.err,
  );
});

Deno.test("fetch-seed leaves a seed refresh-compiler.sh built alone", async () => {
  const r = await fetchFrom({}, "seed-latest", { bytes: stale, src: true });
  expect(
    r.code === 0 && same(r.installed, stale) && r.out.includes("local build"),
    `want exit 0, the seed kept and "local build"; got ${r.code}: ${r.out}`,
    r.err,
  );
});
