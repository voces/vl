// The `native` job's matrix and scripts/ci-shard.sh must agree on the shard count, and the
// shards must partition the native-suite population: a file in no shard runs nowhere in CI,
// a file in two runs twice. Pure: it reads ci.yml and runs the shell script, no seed needed.

import { ROOT } from "./support/tree.ts";

Deno.test("ci-shard: the native matrix and ci-shard.sh agree, and the shards partition", async () => {
  const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);
  const call = ci.match(/ci-shard\.sh \$\{\{ matrix\.shard \}\} (\d+)/);
  if (!call) throw new Error("ci.yml no longer runs `ci-shard.sh ${{ matrix.shard }} <n>`");
  const n = Number(call[1]);
  const matrix = ci.match(/shard: \[([0-9, ]+)\]/);
  if (!matrix) throw new Error("ci.yml has no `shard: [...]` matrix");
  const listed = matrix[1].split(",").map((s) => Number(s.trim()));
  const want = Array.from({ length: n }, (_, i) => i + 1);
  if (JSON.stringify(listed) !== JSON.stringify(want)) {
    throw new Error(`the matrix lists shards ${JSON.stringify(listed)} but ci-shard.sh is told ${n}`);
  }
  const out = await new Deno.Command("bash", {
    args: [`${ROOT}/scripts/ci-shard.sh`, "--check", String(n)],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const text = new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
  if (out.code !== 0) throw new Error(`ci-shard.sh --check ${n} exited ${out.code}:\n${text}`);
  for (const k of want) {
    const shard = await new Deno.Command("bash", {
      args: [`${ROOT}/scripts/ci-shard.sh`, String(k), String(n)],
      stdout: "piped",
    }).output();
    if (new TextDecoder().decode(shard.stdout).trim() === "") {
      throw new Error(`shard ${k} of ${n} is empty`);
    }
  }
});
