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
) => {
  const rel = await Deno.makeTempDir({ prefix: "vl-fetch-seed-" });
  try {
    for (const [name, body] of Object.entries(files)) {
      if (typeof body === "string") {
        await Deno.writeTextFile(`${rel}/${name}`, body);
      } else await Deno.writeFile(`${rel}/${name}`, body);
    }
    const out = `${rel}/out/${ASSET}`;
    const { code, stderr } = await new Deno.Command("bash", {
      args: [SCRIPT],
      env: { VL_SEED_BASE: `file://${rel}`, VL_SEED_TAG: tag, SEED: out },
      stdout: "piped",
      stderr: "piped",
    }).output();
    let installed: Uint8Array | null = null;
    try {
      installed = await Deno.readFile(out);
    } catch { /* not installed */ }
    return { code, err: new TextDecoder().decode(stderr), installed };
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
