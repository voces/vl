// The I8 holdouts (`scripts/ir-i8-census/holdouts.tsv`, read as `scripts/lib/holdouts.vl` reads
// it): programs the IR does not claim yet. A grader expects each one refused with
// `cannot yet lower` and fails when one is not, so the list only shrinks. Keys are
// checkout-relative paths (`tests/cases/...`). Side-effect free apart from one file read.

export const HOLDOUTS_PATH = "scripts/ir-i8-census/holdouts.tsv";
export const HOLDOUT_REFUSAL = "cannot yet lower";

const FILE = new URL(`../../${HOLDOUTS_PATH}`, import.meta.url);

/** Each holdout's program mapped to its class; empty when the file is absent. */
export const HOLDOUTS: ReadonlyMap<string, string> = (() => {
  const out = new Map<string, string>();
  let text = "";
  try {
    text = Deno.readTextFileSync(FILE);
  } catch {
    return out;
  }
  for (const line of text.split("\n")) {
    if (line === "" || line.startsWith("#")) continue;
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
    return `holdout ${prog} is no longer refused: remove its line from ${HOLDOUTS_PATH}`;
  }
  if (!err.includes(HOLDOUT_REFUSAL)) {
    return `holdout ${prog} fails without \`${HOLDOUT_REFUSAL}\`: ${err}`;
  }
  return "";
};
