// Run a VL file or snippet from the command line.
//
//   deno task run path/to/file.vl      # compile + run a file
//   deno task run -e "let x = 1 ..."    # compile + run an inline snippet
//   echo "..." | deno task run         # compile + run stdin
//
// Prints diagnostics (errors/warnings) to stderr and any __log__ output to
// stdout. Exits non-zero if there are error diagnostics.

import { compile, runWasm, type VLDiagnostic } from "./compile.ts";

const formatDiagnostic = (d: VLDiagnostic): string => {
  const { line, character } = d.range.start;
  return `${d.severity} [${line + 1}:${character + 1}] ${d.message}`;
};

const readSource = async (args: string[]): Promise<string> => {
  const flagIndex = args.indexOf("-e");
  if (flagIndex !== -1) return args[flagIndex + 1] ?? "";

  const file = args.find((a) => !a.startsWith("-"));
  if (file) return await Deno.readTextFile(file);

  // No file/flag: read from stdin.
  const stdin = await new Response(Deno.stdin.readable).text();
  return stdin;
};

const main = async () => {
  const source = await readSource(Deno.args);
  if (source.trim() === "") {
    console.error("usage: deno task run <file.vl> | -e <source> | < stdin");
    Deno.exit(2);
  }

  const { diagnostics, wasm } = await compile(source);
  for (const d of diagnostics) console.error(formatDiagnostic(d));

  if (!wasm) {
    Deno.exit(1);
  }

  const { logs } = await runWasm(wasm);
  for (const log of logs) console.log(log);
};

await main();
