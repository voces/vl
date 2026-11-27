// The I8 holdouts (`scripts/ir-i8-census/holdouts/`, one `<slug>.tsv` per program, read as
// `scripts/lib/holdouts.vl` reads it): programs the IR does not claim yet. A grader expects each one refused with
// `cannot yet lower` and fails when one is not, so the list only shrinks. Keys are
// checkout-relative paths (`tests/cases/...`), or `tests/<file>.ts#<case>` for a program a test
// writes inline. Side-effect free apart from reading the directory.

export const HOLDOUTS_DIR = "scripts/ir-i8-census/holdouts";
export const HOLDOUT_REFUSAL = "cannot yet lower";

const DIR = new URL(`../../${HOLDOUTS_DIR}/`, import.meta.url);

/** The file a holdout row for `prog` lives in, checkout-relative. */
export const holdoutFile = (prog: string): string =>
  `${HOLDOUTS_DIR}/${prog.replace(/[^A-Za-z0-9._-]/g, "_")}.tsv`;

/** Every row of the directory, one per `.tsv` file, as `[file name, line]`, sorted by file. */
export const holdoutRows = (): [string, string][] => {
  const out: [string, string][] = [];
  let names: string[] = [];
  try {
    names = [...Deno.readDirSync(DIR)].filter((e) =>
      e.isFile && e.name.endsWith(".tsv")
    )
      .map((e) => e.name);
  } catch {
    return out;
  }
  for (const n of names.sort()) {
    for (const line of Deno.readTextFileSync(new URL(n, DIR)).split("\n")) {
      if (line !== "") out.push([n, line]);
    }
  }
  return out;
};

/** Each holdout's program mapped to its class; empty when the directory is absent. */
export const HOLDOUTS: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  for (const [, line] of holdoutRows()) {
    const f = line.split("\t");
    out.set(f[0], f[2] ?? "");
  }
  return out;
})();

/** "" when holdout `prog`'s build was refused with `cannot yet lower`, else why it fails. */
export const holdoutVerdict = (
  prog: string,
  refused: boolean,
  err: string,
): string => {
  if (!refused) {
    return `holdout ${prog} is no longer refused: delete its file, ${
      holdoutFile(prog)
    }`;
  }
  if (!err.includes(HOLDOUT_REFUSAL)) {
    return `holdout ${prog} fails without \`${HOLDOUT_REFUSAL}\`: ${err}`;
  }
  return "";
};

/**
 * For a test that builds program `key` itself: null when `key` is not a holdout (grade it as
 * usual), else "" when its build failed with `cannot yet lower`, or why it fails. `failed` says
 * the build failed; `err` is its error text.
 */
export const holdoutCheck = (
  key: string,
  failed: boolean,
  err: string,
): string | null => HOLDOUTS.has(key) ? holdoutVerdict(key, failed, err) : null;

/**
 * `fn` as a test body graded as holdout `key` (`tests/<file>.ts#<test name>`) when that key is
 * listed: it passes only while it fails with `cannot yet lower`, and fails once it passes. An
 * unlisted key runs `fn` unchanged.
 */
export const holdoutTest =
  (key: string, fn: () => void | Promise<void>): () => Promise<void> =>
  async () => {
    if (!HOLDOUTS.has(key)) return await fn();
    let err = "";
    try {
      await fn();
    } catch (e) {
      err = e instanceof Error ? e.message : String(e);
    }
    const why = holdoutVerdict(key, err !== "", err);
    if (why !== "") throw new Error(why);
  };
