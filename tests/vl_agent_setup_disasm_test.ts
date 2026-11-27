// `agent-setup.sh --host-check` stops on a worktree whose `node_modules/.bin/wasm-dis` is missing:
// disassembly is how a codegen fix is graded. The passing control gives it a stub, and
// the check moves on to the host (which then fails on the missing seed, a different message).
//
// Run with:  deno test -A tests/vl_agent_setup_disasm_test.ts

const SCRIPT = new URL("../scripts/agent-setup.sh", import.meta.url).pathname;
const MISSING = "node_modules/.bin/wasm-dis is not executable here";

/** Runs `agent-setup.sh --host-check` in a fresh dir, optionally with a stub disassembler. */
function hostCheck(withDis: boolean) {
  const root = Deno.makeTempDirSync();
  try {
    if (withDis) {
      Deno.mkdirSync(`${root}/node_modules/.bin`, { recursive: true });
      Deno.writeTextFileSync(`${root}/node_modules/.bin/wasm-dis`, "#!/bin/sh\n");
      Deno.chmodSync(`${root}/node_modules/.bin/wasm-dis`, 0o755);
    }
    const out = new Deno.Command("bash", {
      args: [SCRIPT, "--host-check"],
      cwd: root,
      env: { MAIN_CHECKOUT: root },
      stdout: "piped",
      stderr: "piped",
    }).outputSync();
    return { code: out.code, err: new TextDecoder().decode(out.stderr) };
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
}

Deno.test("agent-setup --host-check: a worktree with no wasm-dis fails, naming the link", () => {
  const r = hostCheck(false);
  if (r.code === 0 || !r.err.includes(MISSING) || !r.err.includes("ln -s")) {
    throw new Error(`want a failure naming the missing wasm-dis and the link, got exit ${r.code}:\n${r.err}`);
  }
});

Deno.test("agent-setup --host-check: with wasm-dis the check moves on to the host", () => {
  const r = hostCheck(true);
  if (r.err.includes(MISSING) || !r.err.includes("no seed at build/vl-compiler.wasm")) {
    throw new Error(`want the host check's own no-seed message, got exit ${r.code}:\n${r.err}`);
  }
});
