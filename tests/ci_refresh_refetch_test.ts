// scripts/refresh-compiler.sh with a seed that cannot compile the source fails loud and leaves the
// seed as it was; only --allow-refetch swaps in a fetched `seed-latest`. A silent swap built the
// source with another compiler and passed for a fixpoint. `VL=/bin/false` fails every build at
// once, so no compiler runs and nothing is fetched.

const ROOT = new URL("../", import.meta.url).pathname;

Deno.test("refresh-compiler: a seed that cannot compile the source exits 1 and is left as it was", async () => {
  const dir = await Deno.makeTempDir({ prefix: "refresh_refetch_" });
  try {
    const seed = `${dir}/seed.wasm`;
    await Deno.writeTextFile(seed, "not a compiler");
    const out = await new Deno.Command("bash", {
      args: ["scripts/refresh-compiler.sh", "--no-fuel-sidecars"],
      cwd: ROOT,
      env: { VL: "/bin/false", SEED: seed, OUT: seed },
      stdout: "piped",
      stderr: "piped",
    }).output();
    const text = new TextDecoder().decode(out.stdout) +
      new TextDecoder().decode(out.stderr);
    if (out.code !== 1) {
      throw new Error(`want exit 1, got ${out.code}:\n${text}`);
    }
    if (text.includes("re-fetching")) {
      throw new Error(
        `want no re-fetch without --allow-refetch, got:\n${text}`,
      );
    }
    if (!text.includes("--allow-refetch")) {
      throw new Error(
        `want the message to name --allow-refetch, got:\n${text}`,
      );
    }
    const kept = await Deno.readTextFile(seed);
    if (kept !== "not a compiler") {
      throw new Error(`want the seed unchanged, got ${JSON.stringify(kept)}`);
    }
  } finally {
    await Deno.remove(dir, { recursive: true });
  }
});
