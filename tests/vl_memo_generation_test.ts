// A NEW MEMO MAY NOT JOIN THE TREE UNGRADED.
//
// D1655 was a classifier memo whose staleness key read the arena epoch and four collect-table
// LENGTHS, while its value read `fRetKind` — a column `computeRetInference` refines IN PLACE,
// which moves none of those. `vl check` rc 0, invalid module. #2690's fix is a generation:
// `emitPassGen` counts pass-table rows, so a memo answer may not outlive its own pass.
//
// `scripts/memo-generation-probe.py --list` derives every generation stamp in `compiler/*.vl`
// and fails on one its ROWS table does not classify, or on a row whose guard was reworded out
// from under it. This test is that check, run on every PR in milliseconds — the BEHAVIOURAL
// half (disable every memo, re-grade the capability family, `tests/cases` and the corpus) is
// `--run`, which compiles, and its readings live in
// `docs/internals/memo-generation-census-2026-09.md`.
//
// No assertion library, per CLAUDE.md: the failure throws with want and got.
import { pythonBin, ROOT } from "./support/tree.ts";

Deno.test("every memo staleness key in compiler/*.vl is classified", async () => {
  const { code, stdout, stderr } = await new Deno.Command(pythonBin(), {
    args: ["scripts/memo-generation-probe.py", "--list"],
    cwd: ROOT,
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (code !== 0) {
    throw new Error(
      `memo-generation-probe.py --list exited ${code}, want 0.\n` +
        `A generation stamp in compiler/*.vl is not classified in the script's ROWS table, or ` +
        `a row's guard was reworded. Add the row (verdict + a disable edit unless its key ` +
        `already reads \`emitPassGen\`) and re-grade per ` +
        `docs/internals/memo-generation-census-2026-09.md.\n` +
        new TextDecoder().decode(stdout) + new TextDecoder().decode(stderr),
    );
  }
});
