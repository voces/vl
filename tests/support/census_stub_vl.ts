// A stand-in `vl` for the census graders' tests (`$VL`): it answers `check`, `check --batch
// --json`, `run`, `run --batch --out-dir` and `build` for a cell from `//! key: value` lines
// in the cell itself, so no graded outcome depends on a live compiler defect. Keys:
// `check-err` (a check error message), `run-out`, `run-err`, `run-rc`, `built: 1` (a
// `vl build` writes a module) and `cached: 1` (a batch run under `VL_CACHE_TRACE=1` traces
// a module-cache hit, else a miss). A literal `\n` in a value is a newline.

const args = Deno.args;
const enc = new TextEncoder();

function directives(file: string): Record<string, string> {
  const o: Record<string, string> = {};
  for (const l of Deno.readTextFileSync(file).split("\n")) {
    const at = l.indexOf(": ");
    if (l.startsWith("//! ") && at >= 0) {
      o[l.slice(4, at)] = l.slice(at + 2).replaceAll("\\n", "\n");
    }
  }
  return o;
}

const files = () => args.slice(1).filter((x) => x.endsWith(".vl"));
const out = (s: string) => Deno.stdout.writeSync(enc.encode(s));
const err = (s: string) => Deno.stderr.writeSync(enc.encode(s));

if (args[0] === "check" && args.includes("--batch")) {
  for (const f of files()) {
    const m = directives(f)["check-err"];
    const diagnostics = m ? [{ severity: "error", message: m }] : [];
    out(JSON.stringify({ exit: m ? 1 : 0, diagnostics }) + "\n");
  }
} else if (args[0] === "check") {
  const m = directives(args[1])["check-err"];
  out(m ? `[ERROR]: ${m}\n` : "Checked 1 file, no errors.\n");
  Deno.exit(m ? 1 : 0);
} else if (args[0] === "run" && args.includes("--batch")) {
  const od = args[args.indexOf("--out-dir") + 1];
  for (const f of files()) {
    const c = directives(f);
    const n = `${od}/${f.slice(f.lastIndexOf("/") + 1)}`;
    Deno.writeTextFileSync(`${n}.out`, c["run-out"] ?? "");
    if (Number(c["run-rc"] ?? "0") !== 0) {
      Deno.writeTextFileSync(`${n}.err`, c["run-err"] ?? "");
    }
    if (Deno.env.get("VL_CACHE_TRACE") === "1") {
      err(`vl: module cache ${c["cached"] === "1" ? "hit" : "miss"}: ${n}\n`);
    }
  }
} else if (args[0] === "run") {
  const c = directives(args[1]);
  out(c["run-out"] ?? "");
  err(c["run-err"] ?? "");
  Deno.exit(Number(c["run-rc"] ?? "0"));
} else if (args[0] === "build") {
  if (directives(args[1])["built"] === "1") {
    Deno.writeFileSync(args[args.indexOf("-o") + 1], enc.encode("\0asm"));
  }
} else {
  Deno.exit(64);
}
