// The JS hosts' half of `-O` (L10): the compiler runs every step (`compiler/opt_pipe.vl`)
// and this file only answers its requests, as `opt_pipeline` in `scripts/vl-host/src/main.rs`
// does natively — validate through the engine, print, and run binaryen through binaryen.js.
// No compiler logic lives here: the argv binaryen runs is the compiler's, interpreted with
// `wasm-opt`'s own rules, so a JS-host `-O` build is byte-identical to a native one.
// Not served: `--source-map` (binaryen.js cannot read an input map) and the dump requests.

/** The seed's raw exports: its functions plus the staging memory (`ioMem`, else `memory`). */
export type SeedExports = Record<string, unknown>;

/** The binaryen.js module object (`npm:binaryen@130`), passed in so this file stays a leaf. */
// deno-lint-ignore no-explicit-any
export type Binaryen = any;

/** What an `-O` build asks for: the rung, and the flags native `vl build` turns into bits. */
export type OptOptions = {
  /** `-O3` (the release rung) when true, else `-O`. */
  release?: boolean;
  /** `--names`: keep the name section through binaryen (`-g`). */
  names?: boolean;
  /** `--stable-layout`. */
  stableLayout?: boolean;
  /** `--low-memory-unused=<bytes>`; 0 or absent means no promise. */
  lowMemoryUnused?: number;
  /** Extra `optPipeStart` option bits (`O_*` in `compiler/opt_pipe.vl`), as the env adds natively. */
  bits?: number;
  /** `$VL_INLINE_FAULT`. */
  inlineFault?: number;
  /** Where a PRINT request's text goes (natively, stderr). */
  print?: (text: string) => void;
};

// The features native `wasm-opt` runs with: binaryen's defaults plus `BINARYEN_FEATURES`.
const featuresOf = (b: Binaryen): number => {
  const F = b.Features;
  return F.Atomics | F.MutableGlobals | F.NontrappingFPToInt | F.SIMD128 | F.BulkMemory |
    F.SignExt | F.TailCall | F.ReferenceTypes | F.Multivalue | F.GC | F.BulkMemoryOpt;
};

type Fn = (...args: number[]) => number;

const fn = (exp: SeedExports, name: string): Fn => {
  const f = exp[name];
  if (typeof f !== "function") {
    throw new Error(`\`-O\` needs the compiler's \`${name}\`, which this seed predates`);
  }
  return f as Fn;
};

const ioMem = (exp: SeedExports): WebAssembly.Memory => {
  const m = exp.ioMem ?? exp.memory;
  if (!(m instanceof WebAssembly.Memory)) {
    throw new Error("the compiler exports no staging memory for optInLoad");
  }
  return m;
};

// Stages `bytes` as the compiler's `optIn`, through linear memory in chunks.
const stage = (exp: SeedExports, bytes: Uint8Array): void => {
  const mem = ioMem(exp);
  const load = fn(exp, "optInLoad");
  fn(exp, "optInReset")();
  const cap = Math.max(mem.buffer.byteLength, 1);
  for (let off = 0; off < bytes.length; off += cap) {
    const chunk = bytes.subarray(off, Math.min(off + cap, bytes.length));
    new Uint8Array(mem.buffer).set(chunk, 0);
    load(chunk.length);
  }
};

// The compiler's `optOut`, through the bulk `optOutStore` when the seed has it.
const readOut = (exp: SeedExports): Uint8Array => {
  const n = Math.max(fn(exp, "optOutLen")(), 0);
  const out = new Uint8Array(n);
  const store = exp.optOutStore;
  const mem = exp.ioMem ?? exp.memory;
  if (typeof store === "function" && mem instanceof WebAssembly.Memory) {
    let off = 0;
    while (off < n) {
      const cap = mem.buffer.byteLength;
      const want = Math.min(n - off, cap);
      const got = (store as Fn)(off, want);
      if (got <= 0 || got > want) {
        throw new Error(`optOutStore(${off}, ${want}) returned ${got} — bulk read-back ABI violation`);
      }
      out.set(new Uint8Array(mem.buffer, 0, got), off);
      off += got;
    }
    return out;
  }
  const at = fn(exp, "optOutAt");
  for (let i = 0; i < n; i++) out[i] = at(i);
  return out;
};

const validationError = (bytes: Uint8Array): string | undefined => {
  try {
    new WebAssembly.Module(bytes as BufferSource);
    return undefined;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

/**
 * Runs `wasm-opt <argv>` on `bytes` through binaryen.js, with the CLI's semantics: every
 * global flag applies to the whole run, plain passes queue, and each `-O<n>` runs the queue,
 * then the default pipeline at its own level. Throws on a flag the compiler never emits.
 */
export const runWasmOpt = (b: Binaryen, bytes: Uint8Array, argv: readonly string[]): Uint8Array => {
  type Step = { pass: string; arg?: string } | { level: [number, number] };
  const steps: Step[] = [];
  let debugInfo = false;
  let closedWorld = false;
  let lowMemory = false;
  let alwaysInline = 2;
  let levels: [number, number] = [0, 0];
  const skips: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const o = /^-O([0-4])?$/.exec(a);
    if (o) {
      levels = o[1] === undefined ? [2, 1] : [Number(o[1]), 0];
      steps.push({ level: levels });
    } else if (a === "-g") debugInfo = true;
    else if (a === "--closed-world") closedWorld = true;
    else if (a === "--low-memory-unused") lowMemory = true;
    else if (a === "--always-inline-max-function-size") {
      const n = Number(argv[++i]);
      if (!Number.isInteger(n)) throw new Error(`wasm-opt: ${a} wants a size, got ${argv[i]}`);
      alwaysInline = n;
    } else if (a.startsWith("--skip-pass=")) skips.push(a.slice("--skip-pass=".length));
    else if (a.startsWith("--no-inline=")) steps.push({ pass: "no-inline", arg: a.slice(12) });
    else if (/^--[a-z][a-z0-9-]*$/.test(a)) steps.push({ pass: a.slice(2) });
    else throw new Error(`wasm-opt: this host does not know the flag \`${a}\``);
  }
  const reset = () => {
    b.clearPassArguments();
    b.clearPassesToSkip();
    b.setDebugInfo(false);
    b.setClosedWorld(false);
    b.setLowMemoryUnused(false);
    b.setAlwaysInlineMaxSize(2);
    b.setOptimizeLevel(2);
    b.setShrinkLevel(1);
    b.setGenerateStackIR(false);
    b.setOptimizeStackIR(false);
  };
  const setLevels = (l: [number, number]) => {
    b.setOptimizeLevel(l[0]);
    b.setShrinkLevel(l[1]);
  };
  const m = b.readBinaryWithFeatures(bytes, featuresOf(b));
  try {
    b.setDebugInfo(debugInfo);
    b.setClosedWorld(closedWorld);
    b.setLowMemoryUnused(lowMemory);
    b.setAlwaysInlineMaxSize(alwaysInline);
    for (const s of skips) b.addPassToSkip(s);
    // Plain passes run at the levels of the LAST `-O<n>`, as the CLI's pass options do.
    let queue: string[] = [];
    const flush = () => {
      if (queue.length > 0) m.runPasses(queue);
      queue = [];
    };
    for (const s of steps) {
      if ("level" in s) {
        setLevels(levels);
        flush();
        setLevels(s.level);
        m.optimize();
      } else if (s.arg !== undefined) {
        setLevels(levels);
        flush();
        b.setPassArgument(s.pass, s.arg);
        m.runPasses([s.pass]);
        b.setPassArgument(s.pass, null);
      } else queue.push(s.pass);
    }
    setLevels(levels);
    flush();
    const optimizing = steps.some((s) => "level" in s);
    b.setGenerateStackIR(optimizing);
    b.setOptimizeStackIR(optimizing);
    return m.emitBinary();
  } finally {
    m.dispose();
    reset();
  }
};

/**
 * The compiler's whole `-O` chain over `bytes` (the emitter's output, compiled with the seed's
 * `setOptimized(1)`), on `exp`, a FRESH seed instance this call owns. Returns the optimized
 * module, or throws with the compiler's or binaryen's refusal.
 */
export const optimizeModule = (
  exp: SeedExports,
  b: Binaryen,
  bytes: Uint8Array,
  opts: OptOptions = {},
): Uint8Array => {
  const print = opts.print ?? ((t: string) => console.error(t));
  const bits = (opts.bits ?? 0) | (opts.names ? 2048 : 0) | (opts.stableLayout ? 4096 : 0);
  const argv = (): string[] => {
    fn(exp, "optPipeArgv")();
    const lines = new TextDecoder().decode(readOut(exp)).split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    return lines;
  };
  // The emitter's `vl-src` rows describe its own bytes, not binaryen's, so they go first.
  stage(exp, bytes);
  if (fn(exp, "optStripSrc")() === 1) {
    bytes = readOut(exp);
    stage(exp, bytes);
  }
  const resume = fn(exp, "optPipeResume");
  let rq = fn(exp, "optPipeStart")(
    opts.release ? 3 : 1,
    opts.lowMemoryUnused ?? 0,
    bits,
    opts.inlineFault ?? 0,
  );
  let inputValid: boolean | undefined;
  for (;;) {
    const data = readOut(exp);
    let answer: number;
    switch (rq) {
      case 0:
        return runWasmOpt(b, data, argv());
      case 1:
        print(new TextDecoder().decode(data));
        answer = 0;
        break;
      case 2: {
        const err = validationError(data);
        if (err !== undefined) stage(exp, new TextEncoder().encode(err));
        answer = err === undefined ? 1 : 0;
        break;
      }
      case 3:
        inputValid ??= WebAssembly.validate(bytes as BufferSource);
        answer = inputValid ? 1 : 0;
        break;
      case 4:
      case 5:
      case 6:
      case 7:
      case 8:
        answer = 0;
        break;
      case 9:
        stage(exp, runWasmOpt(b, data, argv()));
        answer = 1;
        break;
      case 10:
        throw new Error(new TextDecoder().decode(data));
      default:
        throw new Error(`the compiler's -O pipeline made a request this host does not know: ${rq}`);
    }
    rq = resume(answer);
  }
};
