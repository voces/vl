// THE MEMARG OFFSET reaches the instruction — simd-design.md §G1 "Offsets".
//
// A memory intrinsic's offset form (`__load_i64__(p, 16)`) writes its offset into the access's
// memarg, and the compiler moves a constant part of an ordinary address there itself only where
// the i32 add provably cannot wrap. The fixtures under tests/cases/intrinsics/memarg-offset-*
// grade the VALUES; this reads the disassembly, at no rung and at `-O`, since a value cannot
// tell `offset=16` from an `i32.add` of 16.
//
// GATING: needs the built binary, the seed and binaryen (`node_modules`). A missing
// prerequisite self-ignores rather than fails, so read the suite's IGNORED COUNT.
//
// @test-timing opt

import { COMPILER, exists, nativeEnv, ROOT, VL } from "./support/tree.ts";

const WASM_OPT = `${ROOT}/node_modules/.bin/wasm-opt`;
const WASM_DIS = `${ROOT}/node_modules/.bin/wasm-dis`;
const ENABLED = exists(VL) && exists(COMPILER) && exists(WASM_OPT) && exists(WASM_DIS);
if (!ENABLED) console.warn("[memarg-offset] skipped — missing vl, the seed or binaryen");

const PRE = ["const D = 0x0c000000"];

// name → [program, instructions that must appear, instructions that must not]
const CASES: Record<string, [string[], string[], string[]]> = {
  explicitLoad: [
    ["function f(p: i32) { __load_i64__(p, 16) }", "print(f(__load_i32__(0)))"],
    ["i64.load offset=16"],
    [],
  ],
  explicitStore: [
    ["function f(p: i32, v: i32) { __store_i32__(p, 8, v) }", "f(__load_i32__(0), 1)"],
    ["i32.store offset=8"],
    [],
  ],
  constOffset: [
    ["function f(p: i32) { __load_f64__(p, D + 8) }", "print(f(__load_i32__(0)))"],
    ["f64.load offset=201326600"],
    [],
  ],
  largest: [
    ["function f(p: i32) { __load_u8__(p, 4294967295) }", "print(f(__load_i32__(0)))"],
    ["i32.load8_u offset=4294967295"],
    [],
  ],
  vector: [
    ["function f(p: i32) { __store_v128__(p, 32, __load_v128__(p, 16)) }", "f(__load_i32__(0))"],
    ["v128.load offset=16", "v128.store offset=32"],
    [],
  ],
  atomic: [
    ["function f(p: i32) { __atomic_rmw_cmpxchg_i64__(p, 24, 0 as i64, 1 as i64) }", "print(f(__load_i32__(0)))"],
    ["i64.atomic.rmw.cmpxchg offset=24"],
    [],
  ],
  // `(x & 1023) * 8` is at most 8184, so `D + (x & 1023) * 8` never wraps and D moves.
  provedFold: [
    ["function f(x: i32) { __load_i64__(D + (x & 1023) * 8) }", "print(f(__load_i32__(0)))"],
    ["i64.load offset=201326592"],
    [],
  ],
  // `x * 8` is unbounded, so the add can wrap and must stay an add.
  unprovedStays: [
    ["function f(x: i32) { __load_i64__(D + x * 8) }", "print(f(__load_i32__(0)))"],
    ["i64.load\n"],
    ["offset="],
  ],
};

const count = (s: string, needle: string): number => s.split(needle).length - 1;

const dis = async (dir: string, name: string, rung: string[]): Promise<string> => {
  const out = `${dir}/${name}${rung.join("")}.wasm`;
  const b = await new Deno.Command(VL, {
    args: ["build", `${dir}/${name}.vl`, "-o", out, "--compiler", COMPILER, ...rung],
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  if (!b.success) {
    throw new Error(`vl build ${name} ${rung} failed: ${new TextDecoder().decode(b.stderr)}`);
  }
  const d = await new Deno.Command(WASM_DIS, {
    args: ["--enable-simd", "--enable-threads", out],
    stdout: "piped",
  }).output();
  return new TextDecoder().decode(d.stdout);
};

Deno.test({
  name: "memarg offset: the offset form and the proved fold write the memarg",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-offset-" });
    try {
      for (const [name, [prog, want, notWant]] of Object.entries(CASES)) {
        Deno.writeTextFileSync(`${dir}/${name}.vl`, [...PRE, ...prog].join("\n") + "\n");
        for (const rung of [[], ["-O"]]) {
          const wat = await dis(dir, name, rung);
          for (const w of want) {
            if (count(wat, w) < 1) {
              throw new Error(`${name} ${rung}: want \`${w.trim()}\`, got\n${wat}`);
            }
          }
          for (const w of notWant) {
            if (count(wat, w) > 0) {
              throw new Error(`${name} ${rung}: want no \`${w}\`, got\n${wat}`);
            }
          }
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// `--low-memory-unused` is opt-in: with it, `-O` folds `p + 16` (an add that may wrap, so the
// compiler leaves it) into the offset; without it, the add stays. Alone it is a usage error.
Deno.test({
  name: "memarg offset: --low-memory-unused folds a small added constant at -O only when asked",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-" });
    try {
      Deno.writeTextFileSync(
        `${dir}/lmu.vl`,
        "function f(p: i32) { __load_i32__(p + 16) }\nprint(f(__load_i32__(0)))\n",
      );
      const off = await dis(dir, "lmu", ["-O"]);
      if (count(off, "offset=16") !== 0) throw new Error(`-O alone folded the add:\n${off}`);
      const on = await dis(dir, "lmu", ["-O", "--low-memory-unused"]);
      if (count(on, "i32.load offset=16") !== 1) {
        throw new Error(`-O --low-memory-unused did not fold:\n${on}`);
      }
      const bare = await new Deno.Command(VL, {
        args: ["build", `${dir}/lmu.vl`, "-o", `${dir}/x.wasm`, "--compiler", COMPILER, "--low-memory-unused"],
        env: nativeEnv({ VL_WASM_OPT: WASM_OPT }),
        stdout: "piped",
        stderr: "piped",
      }).output();
      if (bare.code !== 2) throw new Error(`want exit 2 without -O, got ${bare.code}`);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// Runs `vl` with `args`, answering its exit code and its stdout and stderr together.
const vl = async (args: string[]): Promise<[number, string]> => {
  const r = await new Deno.Command(VL, {
    args,
    env: nativeEnv({ VL_WASM_OPT: WASM_OPT, VL_WASM_DIS: WASM_DIS }),
    stdout: "piped",
    stderr: "piped",
  }).output();
  const td = new TextDecoder();
  return [r.code, td.decode(r.stdout) + td.decode(r.stderr)];
};

// The function bodies of a disassembly, without the module's own name for anything.
const bodies = (wat: string): string =>
  wat.split("\n").filter((l) => !/^ \((export|type|memory|import|global|data)/.test(l)).join("\n");

// PL-061: under the promise, an i64 address `(p + C) as% i32` takes C as its memarg offset the
// way `p as% i32` with an explicit offset does, and so does an i32 `q + C`. The fold stops at the
// promise's size: C plus the access's offset has to be below it (DECISIONS.md, "PL-061").
Deno.test({
  name: "memarg offset: --low-memory-unused[=<bytes>] folds `p + C` below the promised size",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-sized-" });
    try {
      const put = (name: string, src: string) => Deno.writeTextFileSync(`${dir}/${name}.vl`, src + "\n");
      put("f", "export function f(p: i64): i64 { __load_i64__((p + 32) as% i32) }");
      put("g", "export function f(p: i64): i64 { __load_i64__(p as% i32, 32) }");
      for (const rung of [["-O", "--low-memory-unused"], ["-O", "--low-memory-unused=65536"]]) {
        const f = bodies(await dis(dir, "f", rung));
        const g = bodies(await dis(dir, "g", rung));
        if (f !== g) throw new Error(`${rung}: \`(p + 32) as% i32\` is not the offset form:\n${f}\nwant\n${g}`);
      }
      const plain = bodies(await dis(dir, "f", ["-O"]));
      if (count(plain, "offset=") !== 0) throw new Error(`-O alone folded the i64 add:\n${plain}`);
      // name → [promise (0: the bare flag), the offsets that must fold, the ones that must not]
      const edges: [string, number, number[], number[]][] = [
        ["bare", 0, [1, 1023], [1024]],
        ["k64", 65536, [1, 1023, 1024, 65535], [65536]],
      ];
      for (const [name, bytes, fold, keep] of edges) {
        const cs = [...fold, ...keep];
        put(
          name,
          [
            ...cs.map((c) => `export function a${c}(p: i64) { __load_i32__((p + ${c}) as% i32) }`),
            ...cs.map((c) => `export function b${c}(q: i32, v: f64) { __store_f64__(q + ${c}, v) }`),
          ].join("\n"),
        );
        const flag = bytes === 0 ? "--low-memory-unused" : `--low-memory-unused=${bytes}`;
        const wat = await dis(dir, name, ["-O", flag]);
        for (const c of fold) {
          for (const op of ["i32.load", "f64.store"]) {
            if (count(wat, `${op} offset=${c}\n`) !== 1) {
              throw new Error(`${flag}: want \`${op} offset=${c}\`:\n${wat}`);
            }
          }
        }
        for (const c of keep) {
          if (count(wat, `offset=${c}\n`) !== 0) throw new Error(`${flag}: folded ${c}, past the promise:\n${wat}`);
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// Folding changes no value a program that keeps the promise can print: every scalar width at
// C in {0, 1, 1023, 1024, 65535, 65536}, from an i64 and an i32 base above every promise, prints
// the same at every rung. And the promise is a promise: the wrapping fixture, which reads low
// memory, keeps its values without it and traps with it.
Deno.test({
  name: "memarg offset: --low-memory-unused keeps every value of a program that keeps the promise",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-eq-" });
    try {
      const widths: [string, string, string][] = [
        ["i64", "1234605616436508552 as i64", "__load_i64__"],
        ["i32", "-8", "__load_i32__"],
        ["i16", "-9", "__load_i16__"],
        ["i8", "-10", "__load_i8__"],
        ["f64", "0.25", "__load_f64__"],
        ["f32", "0.5 as f32", "__load_f32__"],
      ];
      const cs = [0, 1, 1023, 1024, 65535, 65536];
      const lines = ["const B = 0x40000", "function run(p: i64, q: i32) {"];
      widths.forEach(([w, v, load], i) => {
        cs.forEach((c, j) => {
          const at = (i * cs.length + j) * 0x20000;
          lines.push(`  __store_${w}__((p + ${at + c}) as% i32, ${v})`);
          lines.push(`  print(${load}((p + ${at + c}) as% i32) == ${load}(q + ${at + c}))`);
          lines.push(`  __store_${w}__(q + ${at + c}, ${v})`);
          lines.push(`  print(${load}(q + ${at + c}))`);
        });
      });
      lines.push("}", "__memory_grow__(128)", "run(B as i64 + __load_i32__(0) as i64, B + __load_i32__(0))");
      Deno.writeTextFileSync(`${dir}/eq.vl`, lines.join("\n") + "\n");
      const rungs = [
        [],
        ["-O"],
        ["-O", "--low-memory-unused"],
        ["-O", "--low-memory-unused=65536"],
        ["-O3", "--low-memory-unused=131072"],
      ];
      let want = "";
      for (const rung of rungs) {
        const out = `${dir}/eq${rung.join("")}.wasm`;
        const [bc, bo] = await vl(["build", `${dir}/eq.vl`, "-o", out, "--compiler", COMPILER, ...rung]);
        if (bc !== 0) throw new Error(`build ${rung}: ${bo}`);
        const [rc, ro] = await vl(["run", out]);
        if (rc !== 0) throw new Error(`run ${rung}: exit ${rc}: ${ro}`);
        if (want === "") want = ro;
        if (ro !== want) throw new Error(`${rung} printed\n${ro}\nwant\n${want}`);
      }
      if (count(want, "true") !== widths.length * cs.length) throw new Error(`a width disagreed:\n${want}`);
      const wraps = `${ROOT}/tests/cases/intrinsics/memarg-i64-address-wraps.vl`;
      const wrapRungs: [string[], boolean][] = [[["-O"], false], [["-O", "--low-memory-unused"], true]];
      for (const [rung, trap] of wrapRungs) {
        const out = `${dir}/wraps${rung.join("")}.wasm`;
        const [bc, bo] = await vl(["build", wraps, "-o", out, "--compiler", COMPILER, ...rung]);
        if (bc !== 0) throw new Error(`build wraps ${rung}: ${bo}`);
        const [rc, ro] = await vl(["run", out]);
        if (trap !== (rc !== 0)) throw new Error(`wraps ${rung}: exit ${rc}, want a trap: ${trap}\n${ro}`);
        if (!trap && ro !== "11\n11\n22\n22\n") throw new Error(`wraps ${rung} printed\n${ro}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// The sized promise is parsed strictly, and a heap window that starts inside it contradicts it.
Deno.test({
  name: "memarg offset: --low-memory-unused=<bytes> refuses a bad size and a heap inside it",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-cli-" });
    try {
      Deno.writeTextFileSync(`${dir}/p.vl`, "print(__load_i32__(0x10000))\n");
      Deno.writeTextFileSync(
        `${dir}/buf.vl`,
        'import { Buffer, store8, loadU8 } from "std:buffer"\nconst b = Buffer(16)\nstore8(b, 0, 7)\nprint(loadU8(b, 0))\n',
      );
      const cases: [string, string[], number][] = [
        ["p", ["-O", "--low-memory-unused=0"], 2],
        ["p", ["-O", "--low-memory-unused=64k"], 2],
        ["p", ["-O", "--low-memory-unused", "--low-memory-unused=65536"], 2],
        ["p", ["--low-memory-unused=65536"], 2],
        ["p", ["-O", "--low-memory-unused=65536", "--heap-base=0x1000"], 2],
        ["buf", ["-O", "--low-memory-unused=65536"], 2],
        ["buf", ["-O", "--low-memory-unused=0x10000", "--heap-base=0x10000"], 0],
        ["buf", ["-O", "--low-memory-unused"], 0],
      ];
      for (const [name, flags, want] of cases) {
        const [code, out] = await vl([
          "build",
          `${dir}/${name}.vl`,
          "-o",
          `${dir}/x.wasm`,
          "--compiler",
          COMPILER,
          ...flags,
        ]);
        if (code !== want) throw new Error(`${name} ${flags}: want exit ${want}, got ${code}: ${out}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// plumb's src/rt.vl accessors, verbatim: the helpers its generated code calls for every access.
const RT = [
  "export const M32: i64 = 4294967295",
  "export function ld8(a: i64): i64 { __load_u8__(a as% i32) as% i64 }",
  "export function ld16(a: i64): i64 { __load_u16__(a as% i32) as% i64 }",
  "export function ld32(a: i64): i64 { (__load_i32__(a as% i32) as% i64) & M32 }",
  "export function ld64(a: i64): i64 { __load_i64__(a as% i32) }",
  "export function st8(a: i64, v: i64) { __store_i8__(a as% i32, v as% i32) }",
  "export function st16(a: i64, v: i64) { __store_i16__(a as% i32, v as% i32) }",
  "export function st32(a: i64, v: i64) { __store_i32__(a as% i32, v as% i32) }",
  "export function st64(a: i64, v: i64) { __store_i64__(a as% i32, v) }",
].join("\n");
const RT_IMPORT = 'import { M32, ld8, ld16, ld32, ld64, st8, st16, st32, st64 } from "./rt"';

// PL-061, part 2: under the promise, a call of a trivial accessor with a constant-offset address
// builds to the same wasm as the intrinsic's offset form, one shape at a time and all together.
Deno.test({
  name: "memarg offset: --low-memory-unused folds a trivial accessor's address like the offset form",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-acc-" });
    try {
      Deno.writeTextFileSync(`${dir}/rt.vl`, RT + "\n");
      // shape → [the helper call, the direct spelling]
      const shapes: [string, string, string][] = [
        ["ld8", "ld8(p + 60000)", "__load_u8__(p as% i32, 60000) as% i64"],
        ["ld16", "ld16(p + 2)", "__load_u16__(p as% i32, 2) as% i64"],
        ["ld32", "ld32(p + 8)", "(__load_i32__(p as% i32, 8) as% i64) & M32"],
        ["ld64", "ld64(p + 32)", "__load_i64__(p as% i32, 32)"],
        ["st8", "st8(p + 0x2ae, v)", "__store_i8__(p as% i32, 0x2ae, v as% i32)"],
        ["st16", "st16(p + 8, v)", "__store_i16__(p as% i32, 8, v as% i32)"],
        ["st32", "st32(p + 4000, v)", "__store_i32__(p as% i32, 4000, v as% i32)"],
        ["st64", "st64(p + 8 + 24, v)", "__store_i64__(p as% i32, 32, v)"],
      ];
      const put = (name: string, src: string) => Deno.writeTextFileSync(`${dir}/${name}.vl`, `${RT_IMPORT}\n${src}\n`);
      for (const [name, helper, direct] of shapes) {
        const fn = (e: string) =>
          name.startsWith("st")
            ? `export function f(p: i64, v: i64) { ${e} }`
            : `export function f(p: i64): i64 { ${e} }`;
        put(`h_${name}`, fn(helper));
        put(`d_${name}`, fn(direct));
      }
      const stores = shapes.filter(([n]) => n.startsWith("st"));
      const loads = shapes.filter(([n]) => n.startsWith("ld"));
      for (const [tag, i] of [["h", 1], ["d", 2]] as const) {
        put(
          `${tag}_all`,
          [
            "export function f(p: i64, v: i64): i64 {",
            ...stores.map((s) => `  ${s[i]}`),
            `  ${loads.map((s) => `(${s[i]})`).join(" + ")}`,
            "}",
          ].join("\n"),
        );
      }
      for (const rung of [["-O", "--low-memory-unused=65536"], ["-O3", "--low-memory-unused=65536"]]) {
        for (const name of [...shapes.map(([n]) => n), "all"]) {
          const h = bodies(await dis(dir, `h_${name}`, rung));
          const d = bodies(await dis(dir, `d_${name}`, rung));
          if (h !== d) throw new Error(`${rung} ${name}: the helper call is not the offset form:\n${h}\nwant\n${d}`);
          if (count(h, "offset=") < 1) throw new Error(`${rung} ${name}: nothing folded:\n${h}`);
        }
      }
      // Past the promise the helper's address stays an add: 60000 is not below 1 KiB.
      const bare = bodies(await dis(dir, "h_ld8", ["-O", "--low-memory-unused"]));
      if (count(bare, "offset=") !== 0) throw new Error(`the bare promise folded 60000:\n${bare}`);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// Only a TRIVIAL accessor is inlined: a parameter read twice, a second statement, a computed
// mask, parameters in the other order, or an operator the fold does not cover all stay calls, so
// their constant stays an add after `-O`. Each prints what an unoptimized build prints.
Deno.test({
  name: "memarg offset: --low-memory-unused leaves an accessor that is not trivial a call",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-nontrivial-" });
    try {
      Deno.writeTextFileSync(
        `${dir}/nt.vl`,
        [
          "let n = 0",
          "function twice(a: i64): i64 { __load_i64__(a as% i32) + a }",
          "function effect(a: i64): i64 { n = n + 1; __load_i64__(a as% i32) }",
          "function masked(a: i64, m: i64): i64 { __load_i64__(a as% i32) & m }",
          "function swapped(v: i64, a: i64) { __store_i64__(a as% i32, v) }",
          "function plus(a: i64): i64 { __load_i64__(a as% i32) + 1 }",
          "function run(p: i64) {",
          "  __store_i64__(p as% i32, 48, 5 as i64)",
          "  swapped(7 as i64, p + 56)",
          "  print(twice(p + 48) - p)",
          "  print(effect(p + 56))",
          "  print(masked(p + 48, 4 as i64))",
          "  print(plus(p + 48))",
          "  print(n)",
          "}",
          "__memory_grow__(8)",
          "run(0x40000 as i64 + __load_i32__(0) as i64)",
        ].join("\n") + "\n",
      );
      const wat = await dis(dir, "nt", ["-O", "--low-memory-unused=65536"]);
      if (count(wat, "offset=56") !== 0) throw new Error(`a non-trivial accessor folded:\n${wat}`);
      for (const rung of [[], ["-O", "--low-memory-unused=65536"]]) {
        const out = `${dir}/nt${rung.join("")}.wasm`;
        const [bc, bo] = await vl(["build", `${dir}/nt.vl`, "-o", out, "--compiler", COMPILER, ...rung]);
        if (bc !== 0) throw new Error(`build ${rung}: ${bo}`);
        const [rc, ro] = await vl(["run", out]);
        if (rc !== 0 || ro !== "53\n7\n4\n6\n1\n") throw new Error(`${rung}: exit ${rc}, printed\n${ro}`);
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// Inlining changes no value a program that keeps the promise can print: every accessor at
// constants around both promises' edges, from an i64 base whose high 32 bits are set, and from
// one whose low half wraps past 2^32 at a constant past every promise (the only way a wrapping
// address keeps one), with accessor calls nested in another's address and value.
Deno.test({
  name: "memarg offset: --low-memory-unused keeps every value an inlined accessor reads or writes",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-acc-eq-" });
    try {
      Deno.writeTextFileSync(`${dir}/rt.vl`, RT + "\n");
      const B = 0x40000n;
      const widths: [string, (at: bigint) => string][] = [
        ["8", (at) => `(__load_u8__(${at}) as% i64)`],
        ["16", (at) => `(__load_u16__(${at}) as% i64)`],
        ["32", (at) => `((__load_i32__(${at}) as% i64) & M32)`],
        ["64", (at) => `__load_i64__(${at})`],
      ];
      // [base, constants]: high bits set with the low half below the target, and a low half
      // that wraps to the target (so the constant exceeds it, and every promise).
      const bases: [bigint, bigint[]][] = [
        [0x1234n << 32n, [1n, 8n, 1023n, 1024n, 1025n, 65535n, 65536n, 65584n, 131071n]],
        [1n << 32n, [0x50000n, 0x50008n]],
      ];
      const lines = [RT_IMPORT, "function run(z: i64, v: i64) {"];
      let j = 0n;
      let cells = 0;
      for (const [w, direct] of widths) {
        for (const [base, cs] of bases) {
          for (const c of cs) {
            const at = B + j * 16n;
            const p = BigInt.asIntN(64, base + at - c);
            lines.push(`  const p${j} = z + (${p} as i64)`);
            lines.push(`  st${w}(p${j} + ${c}, v)`);
            lines.push(`  print(ld${w}(p${j} + ${c}) == ${direct(at)})`);
            lines.push(`  print(ld${w}(p${j} + ${c}))`);
            j++;
            cells++;
          }
        }
      }
      const q = B + j * 16n;
      lines.push(`  const q = z + (${q} as i64)`);
      lines.push("  st64(q + 24, q)");
      lines.push("  st64(q + 8, ld64(q + 24) + 1)");
      lines.push("  print(ld64(ld64(q + 24) + 8) - q)");
      lines.push("}", "__memory_grow__(128)", "run(__load_i32__(0) as i64, 1234605616436508552 as i64)");
      Deno.writeTextFileSync(`${dir}/eq.vl`, lines.join("\n") + "\n");
      const rungs = [
        [],
        ["-O"],
        ["-O", "--low-memory-unused"],
        ["-O", "--low-memory-unused=65536"],
        ["-O3", "--low-memory-unused=131072"],
      ];
      let want = "";
      for (const rung of rungs) {
        const out = `${dir}/eq${rung.join("")}.wasm`;
        const [bc, bo] = await vl(["build", `${dir}/eq.vl`, "-o", out, "--compiler", COMPILER, ...rung]);
        if (bc !== 0) throw new Error(`build ${rung}: ${bo}`);
        const [rc, ro] = await vl(["run", out]);
        if (rc !== 0) throw new Error(`run ${rung}: exit ${rc}: ${ro}`);
        if (want === "") want = ro;
        if (ro !== want) throw new Error(`${rung} printed\n${ro}\nwant\n${want}`);
      }
      if (count(want, "true") !== cells || count(want, "false") !== 0 || !want.endsWith("\n1\n")) {
        throw new Error(`an accessor disagreed with the direct read:\n${want}`);
      }
      const wat = await dis(dir, "eq", ["-O", "--low-memory-unused=65536"]);
      if (count(wat, "offset=65535\n") < 1) throw new Error(`nothing folded at 65535:\n${wat}`);
      if (count(wat, "offset=65536\n") !== 0) throw new Error(`folded 65536, past the promise:\n${wat}`);
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});

// The refusals name a base the user can pass: a multiple of 8, and never a `--heap-base=` the
// command line did not carry.
Deno.test({
  name: "memarg offset: a heap inside the promise advises an 8-aligned base the user can give",
  ignore: !ENABLED,
  fn: async () => {
    const dir = Deno.makeTempDirSync({ prefix: "vl-memarg-lmu-msg-" });
    try {
      Deno.writeTextFileSync(
        `${dir}/buf.vl`,
        'import { Buffer, store8, loadU8 } from "std:buffer"\nconst b = Buffer(16)\nstore8(b, 0, 7)\nprint(loadU8(b, 0))\n',
      );
      const cases: [string[], string, string][] = [
        [["--low-memory-unused=1025"], "at least 0x408", "0x401"],
        [["--low-memory-unused=65537", "--heap-base=0x400"], "at least 0x10008", "0x10001"],
        [
          ["--low-memory-unused=65536", "--heap-limit=0x100000"],
          "`--heap-limit=` without `--heap-base=`",
          "--heap-base=0x400",
        ],
      ];
      for (const [flags, want, notWant] of cases) {
        const [code, out] = await vl([
          "build",
          `${dir}/buf.vl`,
          "-o",
          `${dir}/x.wasm`,
          "--compiler",
          COMPILER,
          "-O",
          ...flags,
        ]);
        if (code !== 2 || !out.includes(want) || out.includes(notWant)) {
          throw new Error(`${flags}: want exit 2 naming \`${want}\` and not \`${notWant}\`, got ${code}: ${out}`);
        }
      }
    } finally {
      Deno.removeSync(dir, { recursive: true });
    }
  },
});
