// THE SEED'S STAT MEMO — `<seed>.key` lets a `vl` process name the seed's `.cwasm` sidecar
// without reading or hashing the seed, and the facts below are the contract:
//
//   1. A seed changed less than two seconds ago gets no memo.
//   2. An older one gets a memo naming its content key and SHA-256 against its stat.
//   3. A memo whose stat matches is believed: a forged key is caught when the bytes are
//      read, refused loudly, and deleted, so the next run recovers.
//   4. A memo whose stat does not match is ignored, and rewritten from the bytes.
//
// The seed is COPIED (a hard link would move the real seed's ctime) and its sidecars are
// symlinked, so no case compiles the seed. DECISIONS.md, "The seed's identity is memoised
// by its stat".
//
// The `vl_` prefix puts this in `ci-native` (tests/ci_seed_coverage_test.ts). Gated on
// `SELFHOST_NATIVE_ALIGN=1` plus a built binary and seed; the memo is Unix only.
//
// @test-timing native

import { COMPILER, VL, exists, nativeEnv } from "./support/tree.ts";

const GATED = Deno.env.get("SELFHOST_NATIVE_ALIGN") === "1";
const ENABLED = GATED && exists(VL) && exists(COMPILER) && Deno.build.os !== "windows";
if (GATED && !ENABLED) {
  console.warn("[vl-seed-memo] skipped — missing vl binary or seed wasm, or not Unix.");
}

const expect = (got: unknown, want: unknown, what: string) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g !== w) throw new Error(`${what}\n  want ${w}\n  got  ${g}`);
};

const check = async (dir: string) => {
  const { code, stdout, stderr } = await new Deno.Command(VL, {
    args: ["check", "--compiler", `${dir}/seed.wasm`, `${dir}/main.vl`],
    stdout: "piped",
    stderr: "piped",
    env: nativeEnv(),
  }).output();
  const dec = new TextDecoder();
  return { code, out: dec.decode(stdout) + dec.decode(stderr) };
};

/** The memo's fields, or null when there is none. */
const memo = (dir: string): string[] | null => {
  try {
    return Deno.readTextFileSync(`${dir}/seed.wasm.key`).trimEnd().split(" ");
  } catch {
    return null;
  }
};

const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");

Deno.test({
  name: "native seed memo: written once the seed is settled, believed by stat, rejected when stale",
  ignore: !ENABLED,
  fn: async () => {
    const dir = await Deno.makeTempDir({ prefix: "vl-seedmemo-" });
    try {
      const bytes = await Deno.readFile(COMPILER);
      await Deno.writeFile(`${dir}/seed.wasm`, bytes);
      const seedDir = COMPILER.replace(/\/[^/]*$/, ""), stem = COMPILER.slice(seedDir.length + 1);
      const sidecars = [...Deno.readDirSync(seedDir)].map((e) => e.name)
        .filter((n) => n.startsWith(`${stem}.`) && n.endsWith(".cwasm"));
      for (const n of sidecars) {
        await Deno.symlink(`${seedDir}/${n}`, `${dir}/seed.wasm.${n.slice(stem.length + 1)}`);
      }
      await Deno.writeTextFile(`${dir}/main.vl`, "print(1 + 2)\n");

      const fresh = await check(dir);
      expect([fresh.code, memo(dir)], [0, null], "1: a seed changed just now gets no memo");

      await new Promise((r) => setTimeout(r, 2100));
      const settled = await check(dir);
      const m = memo(dir);
      const st = Deno.statSync(`${dir}/seed.wasm`);
      const sha = hex(await crypto.subtle.digest("SHA-256", bytes));
      expect(
        [settled.code, m?.length, m?.[0], m?.[2], m?.[3], m?.[9]],
        [0, 10, "vlseedkey1", String(st.ino), String(bytes.length), sha],
        "2: a settled seed gets a memo of its stat and SHA-256",
      );
      const key = m![8];
      expect(
        sidecars.some((n) => n.startsWith(`${stem}.${key}.`)),
        true,
        `2: the memo's key ${key} names the seed's sidecars`,
      );

      const forged = [...m!];
      forged[8] = "00000000deadbeef";
      await Deno.writeTextFile(`${dir}/seed.wasm.key`, forged.join(" ") + "\n");
      const caught = await check(dir);
      expect(
        [caught.code, /changed while this run was loading it/.test(caught.out), memo(dir)],
        [1, true, null],
        "3: a believed memo with a forged key is refused loudly and deleted",
      );
      const recovered = await check(dir);
      expect([recovered.code, memo(dir)?.[8]], [0, key], "3: the next run recovers");

      const stale = [...memo(dir)!];
      stale[2] = String(Number(stale[2]) + 1);
      stale[8] = "00000000deadbeef";
      await Deno.writeTextFile(`${dir}/seed.wasm.key`, stale.join(" ") + "\n");
      const ignored = await check(dir);
      expect(
        [ignored.code, memo(dir)?.[2], memo(dir)?.[8]],
        [0, String(st.ino), key],
        "4: a memo whose stat does not match is ignored and rewritten",
      );
    } finally {
      await Deno.remove(dir, { recursive: true });
    }
  },
});
