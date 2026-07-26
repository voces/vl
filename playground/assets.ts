// Content-addressed asset naming, shared by build.ts / serve.ts / verify.ts.
//
// WHY (the DX problem this exists to solve): the page's entry points used to be
// served under STABLE names — `dist/playground.js`, `dist/playground.css`, and
// `dist/vl-compiler.wasm`. A browser that has any of them cached keeps serving
// the cached copy, so shipping a change did not reliably reach a returning
// visitor; you had to hard-reload. The seed (`vl-compiler.wasm`) is the sharp
// edge, because it is rebuilt on every compiler merge.
//
// The fix is content hashing, not a `?v=<timestamp>` query: a timestamp changes
// the URL on EVERY build, so it also throws away the cache for the (many) builds
// where nothing the browser holds actually changed. A content hash changes the
// URL exactly when the bytes change, which is the property we want in both
// directions.
//
// Header-based cache control is NOT an alternative here: the deployed site is
// GitHub Pages (.github/workflows/pages.yml), which serves its own
// `Cache-Control` and offers no way to configure it. Renaming the file is the
// only lever a static-host deploy actually has.

const HERE = new URL(".", import.meta.url);

/**
 * 8 uppercase-hex characters of SHA-256 over the bytes. Short like esbuild's own
 * `[hash]` (and drawn from a subset of its alphabet, so `HASHED_ASSET` below
 * recognizes both), and far more than enough to separate the handful of assets
 * one build emits.
 */
export const contentHash = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", bytes as BufferSource);
  return Array.from(new Uint8Array(digest).slice(0, 4))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
};

// `<stem>-<HASH>.<ext>` (optionally `.map`). Matches esbuild's `chunk-2BRMWJCO.js`
// and `playground-1A2B3C4D.css` as well as our `vl-compiler-1A2B3C4D.wasm`;
// deliberately does NOT match `index.html` or any un-hashed leftover.
const HASHED_ASSET = /-[0-9A-Z]{8}\.[a-z0-9]+(\.map)?$/;

/** Is this output name content-addressed (and therefore safe to cache forever)? */
export const isHashedAsset = (path: string): boolean => HASHED_ASSET.test(path);

/**
 * The `Cache-Control` a static host should send. Hashed assets are immutable —
 * their URL changes when their bytes do — while `index.html` (the one un-hashed
 * document, which POINTS AT the hashed names) must be revalidated every load or
 * the whole scheme is defeated by a stale pointer.
 */
export const cacheControl = (path: string): string =>
  isHashedAsset(path)
    ? "public, max-age=31536000, immutable"
    : "no-cache, must-revalidate";

// ---------------------------------------------------------------------------
// index.html: template in, resolved page out
// ---------------------------------------------------------------------------

/**
 * `playground/index.html` is the hand-maintained TEMPLATE; the resolved page is
 * written to `playground/dist/index.html` by build.ts. It is deliberately not
 * rewritten in place: the hashed names change whenever the bundle's bytes do, so
 * an in-place rewrite would dirty a tracked file on every build and put a
 * meaningless, conflict-prone hash into git. `dist/` is already git-ignored.
 */
export const TEMPLATE = new URL("index.html", HERE);

/**
 * Substitute the asset placeholders. Throws — loudly, failing the build — if a
 * placeholder went missing (someone hand-edited the tag back to a literal name,
 * silently un-busting the cache) or if one was left unsubstituted.
 */
export const renderIndexHtml = (
  template: string,
  assets: { js: string; css: string },
): string => {
  let out = template;
  for (const [token, value] of [["{{JS}}", assets.js], ["{{CSS}}", assets.css]]) {
    if (!out.includes(token)) {
      throw new Error(
        `playground/index.html is missing the ${token} placeholder — the entry ` +
          `reference must stay a placeholder or the built page will point at a ` +
          `stale, un-hashed name.`,
      );
    }
    out = out.replaceAll(token, value);
  }
  const leftover = out.match(/\{\{[A-Z_]+\}\}/);
  if (leftover) {
    throw new Error(
      `playground/index.html has an unsubstituted placeholder ${leftover[0]}`,
    );
  }
  return out;
};

// ---------------------------------------------------------------------------
// The compiler seed's hashed name, handed to the bundle as a generated module
// ---------------------------------------------------------------------------

/** The generated module `wasmCheckerBrowser.ts` imports the seed's name from. */
export const SEED_MODULE = new URL("src/generated/seedName.ts", HERE);

/** The name used when there is no seed to hash (fresh clone, no `build/`). */
export const SEED_FALLBACK = "vl-compiler.wasm";

/**
 * Write the generated module that pins the seed's hashed filename into the
 * bundle. A generated module (rather than a string-replace over
 * `wasmCheckerBrowser.ts`, or an esbuild `define`) means a missing name is a
 * BUILD error — an unresolved import — instead of a runtime 404 discovered by a
 * visitor. It is git-ignored (see playground/.gitignore); build.ts and verify.ts
 * both call this before bundling so it always exists when esbuild needs it.
 */
export const writeSeedModule = async (seedName: string): Promise<void> => {
  await Deno.mkdir(new URL(".", SEED_MODULE), { recursive: true });
  await Deno.writeTextFile(
    SEED_MODULE,
    "// GENERATED by playground/build.ts — do not edit, do not commit.\n" +
      "// The content-hashed filename of the compiler seed sitting in playground/dist/.\n" +
      `export const SEED_NAME = ${JSON.stringify(seedName)};\n`,
  );
};

/**
 * Hash `build/vl-compiler.wasm` into its deployed filename. Returns the bytes so
 * the caller can write them under that name without re-reading. `undefined` when
 * the seed isn't built — the page then degrades its seed-backed features exactly
 * as it did before, rather than failing the build.
 */
export const hashedSeed = async (
  seed: URL,
): Promise<{ name: string; bytes: Uint8Array } | undefined> => {
  let bytes: Uint8Array;
  try {
    bytes = await Deno.readFile(seed);
  } catch {
    return undefined;
  }
  return { name: `vl-compiler-${await contentHash(bytes)}.wasm`, bytes };
};

/**
 * Empty `playground/dist/` (files only, one level) before a build. Without this,
 * hashed names ACCUMULATE: every past build's entry, chunks and seed pile up, so
 * `dist/` stops being a snapshot of the current build and the deploy step would
 * upload megabytes of dead assets. Confined to the given directory.
 */
export const cleanDist = async (dist: URL): Promise<void> => {
  await Deno.mkdir(dist, { recursive: true });
  // Resolve children against a trailing-slash base: `new URL("a.js", ".../dist")`
  // would resolve to `.../a.js` — a sibling of dist, i.e. deleting the wrong tree.
  const base = dist.href.endsWith("/") ? dist : new URL(`${dist.href}/`);
  for await (const entry of Deno.readDir(dist)) {
    if (entry.isFile) await Deno.remove(new URL(entry.name, base));
  }
};
