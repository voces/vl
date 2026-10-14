// Each of ci.yml's two matrix jobs and scripts/ci-shard.sh must agree on the shard count,
// and the shards must partition the set: a file in no shard runs nowhere in CI, a file in two
// runs twice. Pure: it reads ci.yml and runs the shell script, no seed needed.

import { ROOT } from "./support/tree.ts";

const ci = Deno.readTextFileSync(`${ROOT}/.github/workflows/ci.yml`);

async function shard(
  ...args: string[]
): Promise<{ code: number; text: string }> {
  const out = await new Deno.Command("bash", {
    args: [`${ROOT}/scripts/ci-shard.sh`, ...args],
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return {
    code: out.code,
    text: dec.decode(out.stdout) + dec.decode(out.stderr),
  };
}

for (const set of ["native", "release"]) {
  Deno.test(`ci-shard: the ${set} matrix and ci-shard.sh agree, and the shards partition`, async () => {
    const call = ci.match(
      new RegExp(`ci-shard\\.sh ${set} \\$\\{\\{ matrix\\.shard \\}\\} (\\d+)`),
    );
    if (!call) {
      throw new Error(
        `ci.yml no longer runs \`ci-shard.sh ${set} \${{ matrix.shard }} <n>\``,
      );
    }
    const n = Number(call[1]);
    // The matrix is the nearest `shard: [...]` above the call, in the same job.
    const before = ci.slice(0, call.index);
    const matrices = [...before.matchAll(/shard: \[([0-9, ]+)\]/g)];
    if (matrices.length === 0) {
      throw new Error(`no \`shard: [...]\` matrix above the ${set} call`);
    }
    const listed = matrices[matrices.length - 1][1].split(",").map((s) =>
      Number(s.trim())
    );
    const want = Array.from({ length: n }, (_, i) => i + 1);
    if (JSON.stringify(listed) !== JSON.stringify(want)) {
      throw new Error(
        `the ${set} matrix lists ${
          JSON.stringify(listed)
        } but ci-shard.sh is told ${n}`,
      );
    }
    const check = await shard("--check", set, String(n));
    if (check.code !== 0) {
      throw new Error(
        `ci-shard.sh --check ${set} ${n} exited ${check.code}:\n${check.text}`,
      );
    }
    for (const k of want) {
      const files = await shard(set, String(k), String(n));
      if (files.code !== 0 || files.text.trim() === "") {
        throw new Error(
          `${set} shard ${k} of ${n} is empty or failed:\n${files.text}`,
        );
      }
    }
  });
}

// A SELF_SHARDED file divides its cases by `$VL_CI_SHARD=<k>/<n>`; a stale <n> would assert
// some shares twice and others never.
Deno.test("ci-shard: the native step's VL_CI_SHARD names the native shard count", () => {
  const n = ci.match(/ci-shard\.sh native \$\{\{ matrix\.shard \}\} (\d+)/)?.[1];
  const env = [...ci.matchAll(/VL_CI_SHARD: \$\{\{ matrix\.shard \}\}\/(\d+)/g)].map((m) => m[1]);
  if (!n || env.length !== 1 || env[0] !== n) {
    throw new Error(`want one \`VL_CI_SHARD: \${{ matrix.shard }}/${n}\` in ci.yml, got ${JSON.stringify(env)}`);
  }
});

Deno.test("ci-shard: no file is in both the native and the release set", async () => {
  const native = await shard("native", "1", "1");
  const release = await shard("release", "1", "1");
  if (native.code !== 0 || release.code !== 0) {
    throw new Error(`${native.text}\n${release.text}`);
  }
  const r = new Set(release.text.trim().split("\n"));
  const both = native.text.trim().split("\n").filter((f) => r.has(f));
  if (both.length > 0) throw new Error(`in both sets:\n  ${both.join("\n  ")}`);
});
