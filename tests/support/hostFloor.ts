// The host floor's rows as the Deno side reads them: `FS_FLOOR` in
// compiler/check_intrinsics.vl, the compiler's one statement of every import beneath
// `std:fs`, `std:args`, `std:process` and `std:env`. The Deno harness stubs exactly these
// names, read here at load time, so a row added to or renamed in the table reaches it with
// no second list to edit. Deno-only: it reads the checkout it is imported from.

import { filePath } from "./filePath.ts";

/** One `FS_FLOOR` row: the import name, its signature, and whether it touches memory. */
export type FloorRow = { name: string; sig: string; memory: boolean };

/**
 * The rows of the `FS_FLOOR` table in `src` (the text of check_intrinsics.vl), in slot
 * order. Throws naming the line when a quoted line in the table is not a row, when a name
 * repeats, or when the table is missing, so a malformed table is never read as a short one.
 */
export function parseFloorRows(src: string): FloorRow[] {
  const head = "const FS_FLOOR:";
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`check_intrinsics.vl: \`${head}\` not found`);
  const body = src.slice(at);
  const end = body.search(/\n\]\n/);
  if (end < 0) throw new Error("check_intrinsics.vl: FS_FLOOR has no end");
  const rows: FloorRow[] = [];
  const seen = new Set<string>();
  for (const line of body.slice(0, end).split("\n").slice(1)) {
    if (!line.startsWith('  "')) continue;
    const m = /^ {2}"(__[a-z_]+__)", "(\([^"]*\) => [^"]+)", "(|memory)",$/
      .exec(
        line,
      );
    if (m === null) {
      throw new Error(
        `check_intrinsics.vl FS_FLOOR: not a row \`"name", "(params) => result", "" | "memory",\`: ${line}`,
      );
    }
    if (seen.has(m[1])) {
      throw new Error(`check_intrinsics.vl FS_FLOOR: ${m[1]} listed twice`);
    }
    seen.add(m[1]);
    rows.push({ name: m[1], sig: m[2], memory: m[3] === "memory" });
  }
  if (rows.length === 0) {
    throw new Error("check_intrinsics.vl FS_FLOOR: no rows");
  }
  return rows;
}

/** The text of the check_intrinsics.vl beside this checkout. */
export const INTRINSICS_SRC = Deno.readTextFileSync(
  filePath(new URL("../../compiler/check_intrinsics.vl", import.meta.url)),
);

/** Every floor import name, in slot order. */
export const FLOOR_NAMES: readonly string[] = parseFloorRows(INTRINSICS_SRC)
  .map(
    (r) => r.name,
  );
