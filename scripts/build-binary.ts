#!/usr/bin/env -S deno run -A
// Builds the native `vl` binary via `deno compile` (roadmap C5 / H-M1).
//
//   deno task compile                 # build for the host into dist/vl[.exe]
//   deno run -A scripts/build-binary.ts --target x86_64-apple-darwin
//   deno run -A scripts/build-binary.ts --all   # every supported target
//
// Why a script (not a bare `deno compile` task): we want host-vs-cross naming,
// the `--all` fan-out for the release workflow, and one place that documents
// the flags. The compiled binary embeds the binaryen npm module (a single-file
// Emscripten build with the wasm inlined), so it loads with no out-of-band
// asset — verified to run/build/check inside the compiled binary. See
// DECISIONS.md "Parser, distribution & bootstrapping".

// The five targets `deno compile --target` understands. Versionless per the C5
// decision: the artifact name carries only the target, never a version.
const TARGETS = [
  "x86_64-unknown-linux-gnu",
  "aarch64-unknown-linux-gnu",
  "x86_64-apple-darwin",
  "aarch64-apple-darwin",
  "x86_64-pc-windows-msvc",
] as const;
type Target = typeof TARGETS[number];

const ENTRY = "compiler/cli.ts";
const OUT_DIR = "dist";

const isWindows = (t: Target) => t.includes("windows");

/** Build artifact name for a target, e.g. `vl-x86_64-apple-darwin`. */
const artifactName = (target: Target): string =>
  `vl-${target}${isWindows(target) ? ".exe" : ""}`;

const compile = async (output: string, target?: Target): Promise<void> => {
  const args = ["compile", "-A", "--no-check", "--output", output];
  if (target) args.push("--target", target);
  args.push(ENTRY);

  const cmd = new Deno.Command(Deno.execPath(), {
    args,
    stdout: "inherit",
    stderr: "inherit",
  });
  const { code } = await cmd.output();
  if (code !== 0) {
    console.error(`deno compile failed for ${target ?? "host"} (exit ${code})`);
    Deno.exit(code);
  }
  console.error(`built ${output}`);
};

const main = async (): Promise<void> => {
  await Deno.mkdir(OUT_DIR, { recursive: true });
  const args = Deno.args;

  if (args.includes("--all")) {
    for (const target of TARGETS) {
      await compile(`${OUT_DIR}/${artifactName(target)}`, target);
    }
    return;
  }

  const ti = args.indexOf("--target");
  if (ti !== -1) {
    const target = args[ti + 1] as Target;
    if (!TARGETS.includes(target)) {
      console.error(
        `unknown --target ${target}; one of:\n  ${TARGETS.join("\n  ")}`,
      );
      Deno.exit(2);
    }
    await compile(`${OUT_DIR}/${artifactName(target)}`, target);
    return;
  }

  // Default: build for the host into a plain `dist/vl` (what brew installs).
  const hostExe = Deno.build.os === "windows" ? "vl.exe" : "vl";
  await compile(`${OUT_DIR}/${hostExe}`);
};

await main();
