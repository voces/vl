// Pure text helpers the two editor hosts share — the VS Code language server
// (`server.ts`) and the browser playground (`lspAdapter.ts`). Both drove
// byte-identical private copies of these before; they live here so a fix to one
// cannot skip the other. Monaco-free and seed-free: plain string arithmetic over
// LSP 0-based coordinates.

// The identifier `[A-Za-z_][A-Za-z0-9_]*` immediately to the LEFT of `character`
// on `line`, or null — the `<name>.` member-completion receiver. A numeric run is
// rejected (an identifier cannot start with a digit).
export const wordEndingBefore = (
  line: string,
  character: number,
): string | null => {
  const isWordChar = (c: string) => /[A-Za-z0-9_]/.test(c);
  const end = character;
  let start = end;
  while (start > 0 && isWordChar(line[start - 1])) start--;
  if (start === end) return null;
  const word = line.slice(start, end);
  return /^[A-Za-z_]/.test(word) ? word : null;
};

// `text` with the single character at (0-based `line`, 0-based `col`) removed —
// used to strip a trailing `.` so the member-completion path resolves the
// receiver as a bare expression (the native parser is not error-tolerant for
// `receiver.`). A no-op if the position is out of range.
export const removeCharAt = (text: string, line: number, col: number): string => {
  const lines = text.split("\n");
  if (line < 0 || line >= lines.length) return text;
  const l = lines[line];
  if (col < 0 || col >= l.length) return text;
  lines[line] = l.slice(0, col) + l.slice(col + 1);
  return lines.join("\n");
};
