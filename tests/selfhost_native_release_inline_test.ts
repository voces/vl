// `-O`/`-O3` STORE A NEVER-WRITTEN SMALL RECORD INLINE IN ITS PARENT'S FIELDS (sunpa SP-039;
// docs/internals/inline-records-design.md, slice S1).
//
// The host's inline-record step replaces a struct field holding a record nobody writes with
// the record's own fields. Pinned here, per fixture and rung, by OUTPUT: the optimized module
// prints the unoptimized build's `@log` lines, because a field index that shifted wrongly can
// still validate. And per fixture kind:
//
// * `melts`: `struct.new` sites left in function bodies equal the fixture's `@allocs`, and its
//   CONTROL, the same rung with the step off (`$VL_OPT_NO_INLINE`), has more;
// * `grid`: proof rows (a read is a copy taken at the read, stores through every position,
//   width-subtyped parents). Also built with `$VL_INLINE_REBOX` (inline even where a read
//   re-boxes) and with `$VL_INLINE_SPILL` too (take every store apart at the store), and in
//   those the step must have inlined something, so the re-box and spill paths are graded;
// * `kept`: a disqualifier (a write, a nullable field, a subtype, an export's signature naming
//   the record) leaves the step nothing to do, even with `$VL_INLINE_REBOX`;
// * `stable`: the record reaches an export only through a field, an element or a union box,
//   which JS cannot read: inlined by default (with `$VL_INLINE_REBOX`, so a whole read does not
//   decide it), and kept like `kept` under `--stable-layout` (owner ruling 2026-10-05,
//   inline-records-design.md §6 Q2).
//
// Slice S2 (D3681) flattens a LIST of such records into one array of their fields, and its
// kinds read `$VL_OPT_FLAT_DUMP` where S1's read `$VL_OPT_INLINE_DUMP`:
//
// * `flat-melts`: as `melts`, with the control `$VL_OPT_NO_FLAT`;
// * `flat-grid`: every list op, forced by `$VL_INLINE_REBOX` and then `$VL_INLINE_SPILL`;
// * `flat-kept`: a disqualifier (a null element, a written field, a `filled` list) leaves every list boxed;
// * `flat-stable`: an export hands JS the list: flattened by default, kept under
//   `--stable-layout`;
// * `flat-costly`: the cost rule keeps a list read far more than it is written boxed, and
//   `$VL_INLINE_REBOX` flattens it.
//
// @test-timing opt
import {
  ENABLED,
  logsOf,
  ROOT,
  rustList,
  vl,
  WASM_DIS,
} from "./support/nativeRelease.ts";

const DIR = `${ROOT}/tests/fixtures/opt-inline`;
type Want =
  | "melts"
  | "grid"
  | "kept"
  | "stable"
  | "flat-melts"
  | "flat-grid"
  | "flat-kept"
  | "flat-stable"
  | "flat-costly";
const FIXTURES: [string, Want][] = [
  ["stored-fields", "melts"],
  ["proof-rows", "grid"],
  ["width-subtyped", "grid"],
  ["kept-written", "kept"],
  ["kept-nullable", "kept"],
  ["kept-subtype", "kept"],
  ["kept-export", "kept"],
  ["kept-export-nullable", "kept"],
  ["stable-reached-export", "stable"],
  ["stable-export-union-parent", "stable"],
  ["stable-export-union-record", "stable"],
  ["stable-export-union-list", "stable"],
  ["stable-export-union-holder", "stable"],
  ["stable-export-union-map", "stable"],
  ["flat-melts", "flat-melts"],
  ["flat-grid", "flat-grid"],
  ["flat-kept-nullable", "flat-kept"],
  ["flat-kept-written", "flat-kept"],
  ["flat-kept-filled", "flat-kept"],
  ["flat-stable-export", "flat-stable"],
  ["flat-costly", "flat-costly"],
];
const RUNGS = ["-O", "-O3"];

// `struct.new` sites in function bodies: a global's initializer runs once and is not counted.
const allocations = (wat: string): number => {
  let inFunc = false, n = 0;
  for (const line of wat.split("\n")) {
    if (line.startsWith(" (")) inFunc = line.startsWith(" (func ");
    if (inFunc) n += line.match(/\(struct\.new/g)?.length ?? 0;
  }
  return n;
};

const run = async (bin: string, args: string[]) => {
  const p = await new Deno.Command(bin, {
    args,
    stdout: "piped",
    stderr: "piped",
  }).output();
  const dec = new TextDecoder();
  return { code: p.code, out: dec.decode(p.stdout), err: dec.decode(p.stderr) };
};

const linesOf = (out: string) => out.replace(/\n$/, "").split("\n");

const exists = (p: string) => {
  try {
    Deno.statSync(p);
    return true;
  } catch {
    return false;
  }
};

for (const [fx, want] of FIXTURES) {
  Deno.test({
    name: `native-release: a never-written record is stored inline — ${fx}`,
    ignore: !ENABLED,
    fn: async () => {
      const src = `${DIR}/${fx}.vl`;
      const text = Deno.readTextFileSync(src);
      const logs = logsOf(text);
      const allocs = Number(text.match(/^\/\/ @allocs (\d+)$/m)?.[1] ?? -1);
      const features = rustList(
        Deno.readTextFileSync(`${ROOT}/scripts/vl-host/src/main.rs`),
        "BINARYEN_FEATURES",
      );
      const tmp = await Deno.makeTempDir();
      try {
        const plain = `${tmp}/plain.wasm`;
        const b0 = await vl(["build", src, "-o", plain]);
        if (b0.code !== 0) {
          throw new Error(`${fx}: plain vl build failed: ${b0.err.trim()}`);
        }
        const r0 = await vl(["run", plain]);
        if (
          r0.code !== 0 ||
          JSON.stringify(linesOf(r0.out)) !== JSON.stringify(logs)
        ) {
          throw new Error(
            `${fx}: the unoptimized build no longer prints the fixture's @log lines\n` +
              `  want: ${JSON.stringify(logs)}\n  got:  ${
                JSON.stringify(linesOf(r0.out))
              } rc=${r0.code}`,
          );
        }
        // One build of a rung under `env` and `flags`: graded by output; answers its allocation
        // count and whether the step changed the module.
        const built = async (
          rung: string,
          tag: string,
          env: Record<string, string>,
          flags: string[] = [],
        ) => {
          const out = `${tmp}/m${rung}-${tag}.wasm`;
          const dump = `${tmp}/step${rung}-${tag}.wasm`;
          const flatDump = `${tmp}/flat${rung}-${tag}.wasm`;
          const b = await vl(["build", src, rung, ...flags, "-o", out], {
            VL_OPT_INLINE_DUMP: dump,
            VL_OPT_FLAT_DUMP: flatDump,
            ...env,
          });
          if (b.code !== 0) {
            throw new Error(
              `${fx} ${rung} ${tag}: vl build failed: ${b.err.trim()}`,
            );
          }
          const r = await vl(["run", out]);
          const got = linesOf(r.out);
          if (r.code !== 0 || JSON.stringify(got) !== JSON.stringify(logs)) {
            throw new Error(
              `${fx} ${rung} ${tag}: the optimized module prints something else\n` +
                `  want: ${JSON.stringify(logs)}\n  got:  ${
                  JSON.stringify(got)
                } rc=${r.code} ${r.err.trim()}`,
            );
          }
          const n = allocations((await run(WASM_DIS, [out, ...features])).out);
          return { n, inlined: exists(dump), flat: exists(flatDump) };
        };
        for (const rung of RUNGS) {
          const step = await built(rung, "step", {});
          if (want === "melts") {
            if (!step.inlined) {
              throw new Error(`${fx} ${rung}: the step inlined no field`);
            }
            if (step.n !== allocs) {
              throw new Error(
                `${fx} ${rung}: ${step.n} struct.new left in function bodies\n` +
                  `  want: ${allocs} — every store and read here is of a record held inline`,
              );
            }
            const off = await built(rung, "off", { VL_OPT_NO_INLINE: "1" });
            if (off.n <= step.n) {
              throw new Error(
                `${fx} ${rung}: with the step off ${off.n} struct.new are left, not more than ` +
                  `with it (${step.n}): the fixture no longer exercises the step`,
              );
            }
          }
          if (want === "grid") {
            for (
              const [tag, env] of [
                ["rebox", { VL_INLINE_REBOX: "1" }],
                ["spill", { VL_INLINE_REBOX: "1", VL_INLINE_SPILL: "1" }],
              ] as const
            ) {
              const forced = await built(rung, tag, env);
              if (!forced.inlined) {
                throw new Error(
                  `${fx} ${rung} ${tag}: the step inlined no field`,
                );
              }
            }
          }
          if (want === "kept") {
            const forced = await built(rung, "rebox", { VL_INLINE_REBOX: "1" });
            const stable = await built(rung, "stable", {}, ["--stable-layout"]);
            if (step.inlined || forced.inlined || stable.inlined) {
              throw new Error(
                `${fx} ${rung}: the step inlined a field a disqualifier should keep boxed`,
              );
            }
          }
          if (want === "stable") {
            const open = await built(rung, "rebox", { VL_INLINE_REBOX: "1" });
            if (!open.inlined) {
              throw new Error(
                `${fx} ${rung}: the step inlined no field, though no signature names the record`,
              );
            }
            const stable = await built(rung, "stable", {}, ["--stable-layout"]);
            const forced = await built(rung, "stable-rebox", {
              VL_INLINE_REBOX: "1",
            }, ["--stable-layout"]);
            if (stable.inlined || forced.inlined) {
              throw new Error(
                `${fx} ${rung}: under --stable-layout the step inlined a field an export reaches`,
              );
            }
          }
          if (want === "flat-melts") {
            if (!step.flat) {
              throw new Error(`${fx} ${rung}: the step flattened no list`);
            }
            if (step.n !== allocs) {
              throw new Error(
                `${fx} ${rung}: ${step.n} struct.new left in function bodies\n` +
                  `  want: ${allocs} — every list here holds its elements' fields`,
              );
            }
            const off = await built(rung, "off", { VL_OPT_NO_FLAT: "1" });
            if (off.n <= step.n) {
              throw new Error(
                `${fx} ${rung}: with no list flattened ${off.n} struct.new are left, not ` +
                  `more than with it (${step.n}): the fixture no longer exercises the step`,
              );
            }
          }
          if (want === "flat-grid") {
            for (
              const [tag, env] of [
                ["rebox", { VL_INLINE_REBOX: "1" }],
                ["spill", { VL_INLINE_REBOX: "1", VL_INLINE_SPILL: "1" }],
              ] as const
            ) {
              if (!(await built(rung, tag, env)).flat) {
                throw new Error(
                  `${fx} ${rung} ${tag}: the step flattened no list`,
                );
              }
            }
          }
          if (want === "flat-kept") {
            const forced = await built(rung, "rebox", { VL_INLINE_REBOX: "1" });
            const stable = await built(rung, "stable", {}, ["--stable-layout"]);
            if (step.flat || forced.flat || stable.flat) {
              throw new Error(
                `${fx} ${rung}: the step flattened a list a disqualifier should keep boxed`,
              );
            }
          }
          if (want === "flat-stable") {
            if (!step.flat) {
              throw new Error(
                `${fx} ${rung}: the step flattened no list, though no signature names the record`,
              );
            }
            const stable = await built(rung, "stable", {}, ["--stable-layout"]);
            const forced = await built(rung, "stable-rebox", {
              VL_INLINE_REBOX: "1",
            }, ["--stable-layout"]);
            if (stable.flat || forced.flat) {
              throw new Error(
                `${fx} ${rung}: under --stable-layout the step flattened a list an export reaches`,
              );
            }
          }
          if (want === "flat-costly") {
            const forced = await built(rung, "rebox", { VL_INLINE_REBOX: "1" });
            if (step.flat || !forced.flat) {
              throw new Error(
                `${fx} ${rung}: want the list boxed by the cost rule and flattened under ` +
                  `VL_INLINE_REBOX; got ${step.flat} and ${forced.flat}`,
              );
            }
          }
        }
      } finally {
        await Deno.remove(tmp, { recursive: true });
      }
    },
  });
}

// `$VL_INLINE_EXPLAIN` names, per record and per field, why it was or was not inlined.
Deno.test({
  name:
    "native-release: VL_INLINE_EXPLAIN says why each field was or was not inlined",
  ignore: !ENABLED,
  fn: async () => {
    const tmp = await Deno.makeTempDir();
    try {
      const cases: [string, RegExp][] = [
        [
          "stored-fields",
          /type \d+ field \d+ \(type \d+\): inlined; 2 store\(s\)/,
        ],
        ["kept-written", /refused: its fields are written \(struct\.set/],
        [
          "kept-nullable",
          /not inlined: a value whose type admits null is stored into it/,
        ],
        [
          "kept-export",
          /refused: a value of it can cross the module boundary \(export /,
        ],
        [
          "kept-export-nullable",
          /refused: a value of it can cross the module boundary \(export origin\)/,
        ],
        [
          "stable-reached-export --stable-layout",
          /refused: a value of it can cross the module boundary \(it is stored as an abstract reference .* export either\)/,
        ],
        [
          "stable-export-union-record",
          /type \d+ field \d+ \(type \d+\): inlined/,
        ],
        [
          "stable-export-union-parent --stable-layout",
          /can cross the module boundary \(it is stored as an abstract reference/,
        ],
        [
          "stable-export-union-record --stable-layout",
          /refused: a value of it can cross the module boundary \(it is stored as an abstract reference/,
        ],
        [
          "proof-rows",
          /not inlined: \d+ of its \d+ read\(s\) take the whole record/,
        ],
        [
          "flat-melts",
          /array type \d+ \(of type \d+\): flattened; 3 store\(s\) \(3 taken apart at the producer/,
        ],
        [
          "flat-kept-nullable",
          /array type \d+ \(of type \d+\): not flattened: a value whose type admits null is stored into it \(array\.set/,
        ],
        [
          "flat-kept-written",
          /not flattened: its element type \d+ is refused: its fields are written/,
        ],
        [
          "flat-kept-filled",
          /not flattened: an array\.new fills it from one shared value/,
        ],
        [
          "flat-stable-export --stable-layout",
          /not flattened: its element type \d+ is refused: a value of it can cross the module boundary \(export grab\)/,
        ],
        [
          "flat-costly",
          /not flattened: its reads \(14 of a field, 0 of a whole element\) are more than 6 whole elements' worth per store/,
        ],
        [
          "flat-grid",
          /not flattened: \d+ of its \d+ element read\(s\) take the whole element/,
        ],
      ];
      for (const [spec, want] of cases) {
        const [fx, ...flags] = spec.split(" ");
        const b = await vl([
          "build",
          `${DIR}/${fx}.vl`,
          "-O",
          ...flags,
          "-o",
          `${tmp}/${fx}.wasm`,
        ], {
          VL_INLINE_EXPLAIN: "1",
        });
        if (b.code !== 0 || !want.test(b.err)) {
          throw new Error(
            `${spec}: VL_INLINE_EXPLAIN\n  want: ${want}\n  got:  ${b.err.trim()}`,
          );
        }
      }
    } finally {
      await Deno.remove(tmp, { recursive: true });
    }
  },
});
