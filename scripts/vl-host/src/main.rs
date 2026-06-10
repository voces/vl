// The native `vl` tool — a single binary with deno-style subcommands:
//
//   vl build <in.vl> -o <out.wasm>   compile a file to a wasm module
//   vl check <in.vl>                 typecheck (and emit-validate); print diagnostics
//   vl run   <in.vl>                 compile in-memory, then instantiate + run
//
// This is a THIN host adapter: all compiler logic (lex/parse/typecheck/emit) lives
// in the self-hosted compiler wasm (`build/vl-compiler.wasm`, built by
// scripts/build-compiler-wasm.ts from the VL-written compiler). The Rust side only
// does argv, file I/O, stdout, and the wasmtime embedding — it never parses or
// types VL. Future subcommands (fmt, test, …) follow the same shape: the brains
// land in the wasm, the adapter stays an I/O shim.
//
// The compiler module is resolved from (first hit wins):
//   --compiler <path>  |  $VL_COMPILER_WASM  |  ./build/vl-compiler.wasm
use std::sync::{Arc, Mutex};
use wasmtime::*;

fn usage() -> ! {
    eprintln!("usage: vl <build|check|run> <file.vl> [-o out.wasm] [--compiler vl-compiler.wasm]");
    std::process::exit(2);
}

fn gc_engine(collector: Collector) -> Result<Engine> {
    let mut cfg = Config::new();
    cfg.wasm_gc(true);
    cfg.wasm_function_references(true);
    // The COMPILER instance is one-shot batch work: the null collector (never
    // frees) skips every DRC barrier/refcount, trading memory for speed — give it
    // a large reservation to grow into. User programs (`vl run`) keep DRC: they
    // may be long-lived and actually need garbage collected.
    cfg.collector(collector);
    if matches!(collector, Collector::Null) {
        cfg.gc_heap_reservation(8 << 30); // 8 GiB virtual reservation (lazily committed)
    }
    Ok(Engine::new(&cfg)?)
}

/// Drive the self-hosted compiler module: feed `source` in, call `entry`
/// (`compileSrc` for the full pipeline, `checkSrc` for parse + typecheck only),
/// optionally enabling the `name` custom section (`emit_names`), and return the
/// emitted wasm bytes (empty for a check), or the compiler's own diagnostics as
/// the error.
fn compile_vl(engine: &Engine, compiler_path: &str, source: &str, entry: &str, emit_names: bool) -> Result<Vec<u8>> {
    // A `.cwasm` SIDECAR caches the Cranelift compilation of the compiler module
    // (the dominant fixed cost of every invocation). Keyed by freshness: rebuilt
    // whenever the `.wasm` is newer. `deserialize_file` is unsafe because a
    // corrupt/forged artifact is UB — we only ever load a sidecar this same
    // binary wrote next to the module it was derived from.
    let sidecar = format!("{compiler_path}.cwasm");
    let fresh = match (std::fs::metadata(&sidecar), std::fs::metadata(compiler_path)) {
        (Ok(c), Ok(w)) => matches!((c.modified(), w.modified()), (Ok(cm), Ok(wm)) if cm >= wm),
        _ => false,
    };
    let module = if fresh {
        match unsafe { Module::deserialize_file(engine, &sidecar) } {
            Ok(m) => m,
            Err(_) => Module::from_file(engine, compiler_path)?, // stale config/version — recompile
        }
    } else {
        let m = Module::from_file(engine, compiler_path).map_err(|e| {
            e.context(format!(
                "loading compiler module `{compiler_path}` (build it with: deno run -A scripts/build-compiler-wasm.ts)"
            ))
        })?;
        // Best-effort cache write; failure is non-fatal (read-only dirs etc.).
        if let Ok(bytes) = m.serialize() {
            let _ = std::fs::write(&sidecar, bytes);
        }
        m
    };
    let mut store = Store::new(engine, ());
    let linker = Linker::new(engine);
    let inst = linker.instantiate(&mut store, &module)?;

    let src_reset = inst.get_typed_func::<(), i32>(&mut store, "srcReset")?;
    let src_push = inst.get_typed_func::<i32, i32>(&mut store, "srcPush")?;
    let compile = inst.get_typed_func::<(), i32>(&mut store, entry)?;
    let rlen = inst.get_typed_func::<(), i32>(&mut store, "rbyteLen")?;
    let rat = inst.get_typed_func::<i32, i32>(&mut store, "rbyteAt")?;
    let dlen = inst.get_typed_func::<(), i32>(&mut store, "diagLen")?;
    let dat = inst.get_typed_func::<i32, i32>(&mut store, "diagAt")?;

    // Opt into the wasm "name" custom section so trap backtraces name functions.
    // The export is OFF by default (the compiler leaves goldens byte-identical);
    // we flip it on only here, for the native tool's build/run paths. The export
    // is absent from older compiler modules, so treat a missing symbol as a no-op.
    if emit_names {
        if let Ok(set_names) = inst.get_typed_func::<i32, i32>(&mut store, "setEmitNames") {
            set_names.call(&mut store, 1)?;
        }
    }

    src_reset.call(&mut store, ())?;
    for ch in source.chars() {
        src_push.call(&mut store, ch as i32)?;
    }
    let rc = compile.call(&mut store, ())?;
    if rc != 0 {
        let stage = match rc {
            1 => "parse",
            2 => "type",
            _ => "emit",
        };
        let n = dlen.call(&mut store, ())?;
        let mut diags = String::with_capacity(n as usize);
        for i in 0..n {
            if let Some(c) = char::from_u32(dat.call(&mut store, i)? as u32) {
                diags.push(c);
            }
        }
        bail!("{stage} error\n{}", diags.trim_end());
    }
    let n = rlen.call(&mut store, ())?;
    let mut bytes = Vec::with_capacity(n as usize);
    for i in 0..n {
        bytes.push(rat.call(&mut store, i)? as u8);
    }
    Ok(bytes)
}

/// Instantiate an emitted VL program with the host print-import family and run it
/// (top-level statements run via the wasm start function). Print output streams to
/// stdout as it arrives.
fn run_program(engine: &Engine, bytes: &[u8]) -> Result<()> {
    let module = Module::new(engine, bytes)?;
    let chars: Arc<Mutex<Vec<u32>>> = Arc::default();
    let mut store = Store::new(engine, ());
    let mut linker = Linker::new(engine);

    linker.func_wrap("imports", "__print_i32__", |v: i32| println!("{v}"))?;
    linker.func_wrap("imports", "__print_i64__", |v: i64| println!("{v}"))?;
    // f64: Rust's `{}` Display matches JS `String(v)` for the corpus values (whole
    // numbers print without a trailing `.0`, e.g. 4.0 → "4"), mirroring the host's
    // `__print_f64__` (`String(v)`) so emitted output matches `@log`. (Slice 3.)
    linker.func_wrap("imports", "__print_f64__", |v: f64| println!("{v}"))?;
    linker.func_wrap("imports", "__print_bool__", |v: i32| {
        println!("{}", if v != 0 { "true" } else { "false" })
    })?;
    let c = chars.clone();
    linker.func_wrap("imports", "__print_char__", move |code: i32| {
        c.lock().unwrap().push(code as u32);
    })?;
    let c = chars.clone();
    linker.func_wrap("imports", "__print_str_flush__", move || {
        let mut buf = c.lock().unwrap();
        let line: String = buf.iter().filter_map(|&cp| char::from_u32(cp)).collect();
        buf.clear();
        println!("{line}");
    })?;

    // Instantiation runs the start function — the VL program's top level.
    let _instance = linker.instantiate(&mut store, &module)?;
    Ok(())
}

/// Resolve a `wasm-opt` binary: `$VL_WASM_OPT` override first, else a PATH scan.
/// Returns `None` when none is found (so `-O` can degrade gracefully).
fn wasm_opt_path() -> Option<String> {
    if let Ok(p) = std::env::var("VL_WASM_OPT") {
        return Some(p);
    }
    let path = std::env::var("PATH").unwrap_or_default();
    for dir in path.split(':') {
        let cand = format!("{dir}/wasm-opt");
        if std::fs::metadata(&cand).map(|m| m.is_file()).unwrap_or(false) {
            return Some(cand);
        }
    }
    None
}

/// `vl build -O`: shell out to `wasm-opt` to shrink the emitted module IN PLACE,
/// when a `wasm-opt` is available. VL output is WasmGC, so the GC + reference-type
/// features are REQUIRED for binaryen to even validate it; we enable EXACTLY those
/// two — `-all` would turn on post-3.0 features that wasmtime then refuses to load.
/// A missing `wasm-opt` is a soft no-op (the unoptimized module is already written).
fn optimize_in_place(path: &str) -> Result<()> {
    let Some(opt) = wasm_opt_path() else {
        eprintln!(
            "note: -O requested but no `wasm-opt` on PATH (set $VL_WASM_OPT) — wrote the unoptimized module"
        );
        return Ok(());
    };
    let status = std::process::Command::new(&opt)
        .args([path, "-O", "--enable-reference-types", "--enable-gc", "-o", path])
        .status()
        .map_err(|e| Error::from(e).context(format!("running wasm-opt `{opt}`")))?;
    if !status.success() {
        bail!("wasm-opt `{opt}` failed (exit {:?})", status.code());
    }
    Ok(())
}

fn main() -> Result<()> {
    let args: Vec<String> = std::env::args().collect();
    if args.len() < 3 {
        usage();
    }
    let cmd = args[1].as_str();
    let input = args[2].as_str();
    let flag = |name: &str| -> Option<String> {
        args.iter().position(|a| a == name).and_then(|i| args.get(i + 1)).cloned()
    };
    let compiler = flag("--compiler")
        .or_else(|| std::env::var("VL_COMPILER_WASM").ok())
        .unwrap_or_else(|| "build/vl-compiler.wasm".to_string());

    // Read the source lazily: a `vl run <file.wasm>` input is a binary module, not
    // UTF-8, so we must not slurp it as a string up front.
    let read_source = || {
        std::fs::read_to_string(input)
            .map_err(|e| Error::from(e).context(format!("reading `{input}`")))
    };
    // The compile step always runs under the null collector (one-shot batch work);
    // only the user program's own execution gets a real (DRC) collector.
    let compile_engine = gc_engine(Collector::Null)?;

    match cmd {
        "build" => {
            let out = flag("-o").unwrap_or_else(|| {
                input.strip_suffix(".vl").unwrap_or(input).to_string() + ".wasm"
            });
            // `--names` embeds a wasm "name" custom section (legible trap backtraces).
            let names = args.iter().any(|a| a == "--names");
            let bytes = compile_vl(&compile_engine, &compiler, &read_source()?, "compileSrc", names)?;
            std::fs::write(&out, &bytes)?;
            // `-O`: optimize the written module in place (wasm-opt, when present).
            if args.iter().any(|a| a == "-O") {
                optimize_in_place(&out)?;
            }
            let len = std::fs::metadata(&out).map(|m| m.len()).unwrap_or(bytes.len() as u64);
            println!("wrote {out} ({len} bytes)");
        }
        "check" => {
            // `check` is parse + typecheck only (the `checkSrc` entrypoint) — NOT a
            // full compile. Emit is `vl build`'s job; running it here would only be
            // slower and would reject type-valid programs the emitter can't yet
            // lower. Diagnostics surface through compile_vl's error path. (No names:
            // check emits nothing.)
            compile_vl(&compile_engine, &compiler, &read_source()?, "checkSrc", false)?;
            println!("ok");
        }
        "run" => {
            // Accept either VL source or an already-built wasm module (magic-byte
            // detection): `vl run prog.wasm` runs a prebuilt module straight through
            // wasmtime, skipping the compiler — which also lets `vl build -O` output
            // be run and gated end to end.
            let raw = std::fs::read(input)
                .map_err(|e| Error::from(e).context(format!("reading `{input}`")))?;
            let bytes = if raw.starts_with(b"\0asm") {
                raw
            } else {
                let source = String::from_utf8(raw)
                    .map_err(|e| Error::from(e).context(format!("`{input}` is neither UTF-8 VL source nor a wasm module")))?;
                // `vl run` always embeds names so a trap backtrace is legible.
                compile_vl(&compile_engine, &compiler, &source, "compileSrc", true)?
            };
            let run_engine = gc_engine(Collector::DeferredReferenceCounting)?;
            run_program(&run_engine, &bytes)?;
        }
        _ => usage(),
    }
    Ok(())
}
