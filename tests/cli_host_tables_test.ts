// The two tables the CLI's VL brain (`compiler/cli.vl`) and its Rust host
// (`scripts/vl-host/src/main.rs`) each spell for themselves, held to one answer.
// A pure source scan: no seed, no binary.
//
// 1. Exit codes. `cli.vl` names its codes in `CliExit` and the `EXIT_*` consts;
//    the host owns `EXIT_COMPILER_BUG`; `docs/internals/cli-design.md` §Exit codes
//    is the table a caller reads. All three must list the same codes, and no
//    `cliExit` write in `cli.vl` may go back to a bare number.
// 2. Value-taking flags. The host's `value_flags` decides which token a help scan
//    skips as a flag's VALUE; `cliParseArgs` decides which flags take one. A flag
//    the VL side takes a value for and the host does not list makes
//    `vl check <flag> --help` print help instead of the usage error.

import { ROOT } from "./support/tree.ts";

const CLI_VL = Deno.readTextFileSync(`${ROOT}/compiler/cli.vl`);
const MAIN_RS = Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`);
const DESIGN = Deno.readTextFileSync(`${ROOT}/docs/internals/cli-design.md`);

function same(what: string, want: string[], got: string[]) {
  const w = [...new Set(want)].sort().join(", ");
  const g = [...new Set(got)].sort().join(", ");
  if (w !== g) throw new Error(`${what}\n  want: ${w}\n  got:  ${g}`);
}

// The body of a top-level `function <name>(` in `src`, up to the next line that
// is a lone `}` at column 0.
function body(src: string, head: RegExp, what: string): string {
  const m = head.exec(src);
  if (!m) throw new Error(`${what}: not found`);
  const rest = src.slice(m.index);
  const end = rest.search(/\n}\n/);
  if (end < 0) throw new Error(`${what}: no closing brace`);
  return rest.slice(0, end);
}

Deno.test("exit codes: cli.vl, the host and cli-design.md list one table", () => {
  const union = /^type CliExit = ([0-9 |]+)$/m.exec(CLI_VL);
  if (!union) throw new Error("cli.vl: `type CliExit = …` not found");
  const members = union[1].split("|").map((s) => s.trim());

  const consts = new Map<string, string>();
  for (const m of CLI_VL.matchAll(/^const (EXIT_[A-Z_]+) = (\d+)/gm)) {
    consts.set(m[1], m[2]);
  }
  same("cli.vl: the EXIT_* consts against CliExit", members, [
    ...consts.values(),
  ]);

  const from = DESIGN.indexOf("## Exit codes");
  const to = DESIGN.indexOf("\n## ", from + 1);
  const doc = DESIGN.slice(from, to < 0 ? DESIGN.length : to);
  const rows = [...doc.matchAll(/^\| (\d+) \|/gm)].map((m) => m[1]);
  if (rows.length === 0) {
    throw new Error("cli-design.md: no rows under `## Exit codes`");
  }
  same("cli-design.md §Exit codes against CliExit", members, rows);

  const host = /^const EXIT_COMPILER_BUG: i32 = (\d+);$/m.exec(MAIN_RS);
  if (!host) throw new Error("main.rs: `const EXIT_COMPILER_BUG` not found");
  if (consts.get("EXIT_COMPILER_BUG") !== host[1]) {
    throw new Error(
      `EXIT_COMPILER_BUG: cli.vl ${consts.get("EXIT_COMPILER_BUG")}, main.rs ${
        host[1]
      }`,
    );
  }

  const bare = [...CLI_VL.matchAll(/^.*\b(cliExit|exit) = \d+.*$/gm)]
    .map((m) => m[0].trim());
  if (bare.length > 0) {
    throw new Error(`cli.vl writes a bare exit code:\n  ${bare.join("\n  ")}`);
  }
});

// The flags each subcommand's `cliParseArgs` arm takes a value for: an arm that
// advances `i`. An arm with no `sub == "…"` test applies to every subcommand.
function vlValueFlags(): Map<string, string[]> {
  const parse = body(CLI_VL, /^function cliParseArgs\(\)/m, "cliParseArgs");
  const loop = parse.slice(parse.indexOf("let i = 1"));
  const arms = loop.split(/\n {4}} else if |\n {4}if /).slice(1);
  const out = new Map<string, string[]>();
  for (const sub of ["check", "fmt", "test"]) out.set(sub, []);
  for (const whole of arms) {
    const close = whole.indexOf("\n    }");
    const arm = close < 0 ? whole : whole.slice(0, close);
    const open = arm.indexOf("{\n");
    const cond = arm.slice(0, open);
    if (!/\bi = i \+ 1\b/.test(arm.slice(open))) continue;
    const subs = [...cond.matchAll(/sub == "([a-z]+)"/g)].map((m) => m[1]);
    const flags = [...cond.matchAll(/\ba == "([^"]+)"/g)].map((m) => m[1]);
    if (flags.length === 0) throw new Error(`no flag in arm: ${cond}`);
    for (const sub of subs.length > 0 ? subs : [...out.keys()]) {
      out.get(sub)!.push(...flags);
    }
  }
  return out;
}

function hostValueFlags(sub: string): string[] {
  const fn = body(MAIN_RS, /^fn value_flags\(/m, "value_flags");
  const arm = new RegExp(`"${sub}" => &\\[([^\\]]*)\\]`).exec(fn);
  if (!arm) throw new Error(`value_flags: no "${sub}" arm`);
  return [...arm[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

// The host strips `--extern` before the VL parser sees the argv
// (`take_test_externs`), so only the host lists it. Every other flag is in both
// tables: the token after a value-taking flag is always its value (owner ruling
// 2026-10-14), so `vl check --budget --help` is the same usage error, exit 2, as
// `vl check --severity --help`.
const HOST_ONLY: Record<string, string[]> = { test: ["--extern"] };

Deno.test("value-taking flags: value_flags agrees with cliParseArgs", () => {
  const vl = vlValueFlags();
  if (!vl.get("check")!.includes("--severity")) {
    throw new Error("the cliParseArgs scan lost `--severity`; it is broken");
  }
  for (const [sub, flags] of vl) {
    const host = hostValueFlags(sub).filter((f) =>
      !(HOST_ONLY[sub] ?? []).includes(f)
    );
    same(`\`vl ${sub}\`: value_flags against cliParseArgs`, flags, host);
  }
});
