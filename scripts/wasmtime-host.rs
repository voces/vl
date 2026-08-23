// Minimal wasmtime host for VL's WasmGC output. VL has no WASI; its program
// output goes through `imports::*` host functions (the same set the V8/Deno
// reference `runWasm` in compiler/compile.ts provides). This host wires those
// up, enables the GC + function-references features VL's struct/array/string
// output needs, and instantiates the module — which runs VL's top-level as the
// wasm `start` function. Captured output is echoed to stdout for diffing against
// the V8/Deno reference.
use std::sync::{Arc, Mutex};
use wasmtime::*;

#[derive(Default)]
struct HostState {
    out: Vec<String>,        // completed output lines, in order
    print_chars: Vec<u32>,   // code points streamed by __print_char__ until flush
}

fn main() -> Result<()> {
    let path = std::env::args().nth(1).expect("usage: host <module.wasm>");

    let mut cfg = Config::new();
    cfg.wasm_gc(true);
    cfg.wasm_function_references(true);
    let engine = Engine::new(&cfg)?;
    let module = Module::from_file(&engine, &path)?;

    let state = Arc::new(Mutex::new(HostState::default()));
    let mut store = Store::new(&engine, state.clone());
    let mut linker = Linker::new(&engine);

    // Some VL modules import a linear memory for the buffer-based __log__ path.
    // Provide one so those modules instantiate; print-based modules ignore it.
    let memory = Memory::new(&mut store, MemoryType::new(1, Some(65536)))?;
    linker.define(&mut store, "imports", "memory", memory)?;

    macro_rules! push {
        ($name:literal, $ty:ty, $fmt:expr) => {{
            let s = state.clone();
            linker.func_wrap("imports", $name, move |v: $ty| {
                s.lock().unwrap().out.push($fmt(v));
            })?;
        }};
    }
    push!("__print_i32__", i32, |v: i32| v.to_string());
    push!("__print_i64__", i64, |v: i64| v.to_string());
    push!("__print_f32__", f32, |v: f32| v.to_string());
    push!("__print_f64__", f64, |v: f64| v.to_string());
    push!("__print_bool__", i32, |v: i32| if v != 0 { "true" } else { "false" }.to_string());

    // String print: stream code points, then assemble on flush.
    let s = state.clone();
    linker.func_wrap("imports", "__print_char__", move |code: i32| {
        s.lock().unwrap().print_chars.push(code as u32);
    })?;
    let s = state.clone();
    linker.func_wrap("imports", "__print_str_flush__", move || {
        let mut st = s.lock().unwrap();
        let line: String = st.print_chars.iter().filter_map(|&c| char::from_u32(c)).collect();
        st.print_chars.clear();
        st.out.push(line);
    })?;

    // Buffer-based log path (reads bytes/values out of linear memory).
    let s = state.clone();
    let mem = memory;
    linker.func_wrap("imports", "__log_string__", move |mut caller: Caller<'_, Arc<Mutex<HostState>>>, offset: i32, length: i32| {
        let data = mem.data(&mut caller);
        let bytes = &data[offset as usize..(offset + length) as usize];
        let line = String::from_utf8_lossy(bytes).into_owned();
        s.lock().unwrap().out.push(line);
    })?;
    let s = state.clone();
    linker.func_wrap("imports", "__log__", move |mut caller: Caller<'_, Arc<Mutex<HostState>>>, offset: i32, length: i32| {
        let data = mem.data(&mut caller);
        let base = offset as usize;
        let words = (length / 4) as usize;
        let rd = |i: usize| -> i32 {
            let b = base + i * 4;
            i32::from_le_bytes([data[b], data[b + 1], data[b + 2], data[b + 3]])
        };
        let mut parts: Vec<String> = Vec::new();
        let mut i = 0usize;
        while i < words {
            let tag = rd(i);
            match tag {
                1 => { let lo = rd(i + 1) as u32 as u64; let hi = (rd(i + 2) as u32 as u64) << 32; parts.push(((hi | lo) as i64).to_string()); i += 3; }
                2 => { parts.push(f32::from_bits(rd(i + 1) as u32).to_string()); i += 2; }
                3 => { let lo = rd(i + 1) as u32 as u64; let hi = (rd(i + 2) as u32 as u64) << 32; parts.push(f64::from_bits(hi | lo).to_string()); i += 3; }
                _ => { parts.push(rd(i + 1).to_string()); i += 2; }
            }
        }
        s.lock().unwrap().out.push(parts.join(" "));
    })?;

    // ── the filesystem floor (`std:fs`) ──────────────────────────────────────
    // The seven fs imports, registered only when the module declares them. This spike
    // is not in CI and is built by nothing (see the header) — it carries them because
    // ROADMAP's host-ABI item requires every new import to land in all three hosts, and
    // because a parity harness that cannot instantiate a file-touching module cannot
    // compare its output.
    //
    // Semantics are `scripts/vl-host/src/main.rs`'s (`register_fs_imports`) and that is
    // the authoritative copy: WASI preview1 errno numbering, EMPTY-`u8[]`-on-error with
    // the reason in `__fs_errno__`, `.`/`..` filtered out of a listing, 0x0A between
    // entries. What is deliberately NOT duplicated is the full errno table — this host
    // maps the handful of kinds a parity run can produce and answers EIO (29) for the
    // rest, which is the same fallback the primary host uses for an unrecognized error.
    //
    // The types come from the MODULE, never from here: wasmtime treats rec-group types
    // nominally, so a `StructType` minted in this file would not match the module's
    // `u8[]` wrapper and the import would be rejected at instantiation.
    let fs_errno = Arc::new(Mutex::new(0i32));
    let declared: Vec<(String, FuncType)> = module
        .imports()
        .filter(|i| i.module() == "imports")
        .filter_map(|i| match i.ty() {
            ExternType::Func(ft) => Some((i.name().to_string(), ft)),
            _ => None,
        })
        .collect();
    let fs_ty = |n: &str| {
        declared
            .iter()
            .find(|(name, _)| name == n)
            .map(|(_, ft)| ft.clone())
    };
    // The module's own `u8[]` wrapper struct and packed backing, recovered from the
    // first fs import signature that names them.
    let mut u8_types: Option<(StructType, ArrayType)> = None;
    for (_, ft) in &declared {
        for vt in ft.params().chain(ft.results()) {
            let Some(rt) = vt.as_ref() else { continue };
            let HeapType::ConcreteStruct(st) = rt.heap_type() else {
                continue;
            };
            let Some(f0) = st.field(0) else { continue };
            let Some(inner) = f0.element_type().as_val_type() else {
                continue;
            };
            let Some(ir) = inner.as_ref() else { continue };
            let HeapType::ConcreteArray(at) = ir.heap_type() else {
                continue;
            };
            if at.element_type().is_i8() {
                u8_types = Some((st.clone(), at.clone()));
            }
        }
    }
    fn errno_of(e: &std::io::Error) -> i32 {
        use std::io::ErrorKind::*;
        match e.kind() {
            NotFound => 44,
            PermissionDenied => 2,
            AlreadyExists => 20,
            IsADirectory => 31,
            NotADirectory => 54,
            DirectoryNotEmpty => 55,
            ReadOnlyFilesystem => 69,
            StorageFull => 51,
            InvalidInput | InvalidData => 28,
            _ => 29,
        }
    }
    fn bytes_of(c: &mut Caller<'_, Arc<Mutex<HostState>>>, v: &Val) -> Result<Vec<u8>> {
        let Val::AnyRef(Some(r)) = v else {
            bail!("fs intrinsic: expected a non-null u8[] argument")
        };
        let s = r.unwrap_struct(&c)?;
        let Val::AnyRef(Some(b)) = s.field(&mut *c, 0)? else {
            bail!("fs intrinsic: u8[] wrapper has a null backing")
        };
        let arr = b.unwrap_array(&c)?;
        let cap = arr.len(&c)? as usize;
        let mut buf = vec![0u8; cap];
        arr.copy_to_i8_slice(&mut *c, &mut buf)?;
        // The WRAPPER's `len` is the live length; the backing may be longer.
        if let Val::I32(n) = s.field(&mut *c, 1)? {
            buf.truncate((n.max(0) as usize).min(cap));
        }
        Ok(buf)
    }
    fn mk_list(
        c: &mut Caller<'_, Arc<Mutex<HostState>>>,
        st: &StructType,
        at: &ArrayType,
        bytes: &[u8],
    ) -> Result<Val> {
        let ap = ArrayRefPre::new(&mut *c, at.clone());
        let sp = StructRefPre::new(&mut *c, st.clone());
        let n = bytes.len() as i32;
        let backing = ArrayRef::new_from_i8_slice(&mut *c, &ap, bytes)?;
        let w = StructRef::new(
            &mut *c,
            &sp,
            &[
                Val::AnyRef(Some(backing.to_anyref())),
                Val::I32(n),
                Val::I32(n),
            ],
        )?;
        Ok(Val::AnyRef(Some(w.to_anyref())))
    }
    // Unix-only, like the spike itself: a path is raw bytes.
    fn to_path(b: &[u8]) -> std::path::PathBuf {
        use std::os::unix::ffi::OsStrExt;
        std::path::PathBuf::from(std::ffi::OsStr::from_bytes(b))
    }
    if let Some(ft) = fs_ty("__fs_errno__") {
        let e = fs_errno.clone();
        linker.func_new("imports", "__fs_errno__", ft, move |_c, _a, r| {
            r[0] = Val::I32(*e.lock().unwrap());
            Ok(())
        })?;
    }
    if let Some(ft) = fs_ty("__args_count__") {
        let n = std::env::args().skip(2).count() as i32;
        linker.func_new("imports", "__args_count__", ft, move |_c, _a, r| {
            r[0] = Val::I32(n);
            Ok(())
        })?;
    }
    if let Some(ft) = fs_ty("__fs_stat__") {
        let e = fs_errno.clone();
        linker.func_new("imports", "__fs_stat__", ft, move |mut c, a, r| {
            let p = to_path(&bytes_of(&mut c, &a[0])?);
            r[0] = Val::I32(match std::fs::metadata(&p) {
                Ok(m) => {
                    *e.lock().unwrap() = 0;
                    if m.is_dir() { 1 } else { 0 }
                }
                Err(err) => {
                    let code = errno_of(&err);
                    *e.lock().unwrap() = code;
                    -code
                }
            });
            Ok(())
        })?;
    }
    if let Some(ft) = fs_ty("__fs_write__") {
        let e = fs_errno.clone();
        linker.func_new("imports", "__fs_write__", ft, move |mut c, a, r| {
            let p = to_path(&bytes_of(&mut c, &a[0])?);
            let d = bytes_of(&mut c, &a[1])?;
            r[0] = Val::I32(match std::fs::write(&p, &d) {
                Ok(()) => {
                    *e.lock().unwrap() = 0;
                    0
                }
                Err(err) => {
                    let code = errno_of(&err);
                    *e.lock().unwrap() = code;
                    -code
                }
            });
            Ok(())
        })?;
    }
    if let Some((st, at)) = u8_types {
        if let Some(ft) = fs_ty("__fs_read__") {
            let e = fs_errno.clone();
            let (st, at) = (st.clone(), at.clone());
            linker.func_new("imports", "__fs_read__", ft, move |mut c, a, r| {
                let p = to_path(&bytes_of(&mut c, &a[0])?);
                // A DIRECTORY fails here as EISDIR, from the OS's own read — the guest
                // deliberately does not pre-stat.
                let out = match std::fs::read(&p) {
                    Ok(b) => {
                        *e.lock().unwrap() = 0;
                        b
                    }
                    Err(err) => {
                        *e.lock().unwrap() = errno_of(&err);
                        Vec::new()
                    }
                };
                r[0] = mk_list(&mut c, &st, &at, &out)?;
                Ok(())
            })?;
        }
        if let Some(ft) = fs_ty("__fs_list__") {
            let e = fs_errno.clone();
            let (st, at) = (st.clone(), at.clone());
            linker.func_new("imports", "__fs_list__", ft, move |mut c, a, r| {
                use std::os::unix::ffi::OsStrExt;
                let p = to_path(&bytes_of(&mut c, &a[0])?);
                let mut block: Vec<u8> = Vec::new();
                let mut code = 0i32;
                match std::fs::read_dir(&p) {
                    Err(err) => code = errno_of(&err),
                    Ok(entries) => {
                        for ent in entries {
                            match ent {
                                Err(err) => {
                                    code = errno_of(&err);
                                    break;
                                }
                                Ok(ent) => {
                                    let name = ent.file_name();
                                    if name == "." || name == ".." {
                                        continue;
                                    }
                                    if !block.is_empty() {
                                        block.push(0x0A);
                                    }
                                    block.extend_from_slice(name.as_bytes());
                                }
                            }
                        }
                    }
                }
                if code != 0 {
                    block.clear();
                }
                *e.lock().unwrap() = code;
                r[0] = mk_list(&mut c, &st, &at, &block)?;
                Ok(())
            })?;
        }
        if let Some(ft) = fs_ty("__args_get__") {
            let e = fs_errno.clone();
            let argv: Vec<Vec<u8>> = std::env::args().skip(2).map(|s| s.into_bytes()).collect();
            linker.func_new("imports", "__args_get__", ft, move |mut c, a, r| {
                let Val::I32(i) = a[0] else {
                    bail!("__args_get__: expected an i32 index")
                };
                let out = if i >= 0 && (i as usize) < argv.len() {
                    *e.lock().unwrap() = 0;
                    argv[i as usize].clone()
                } else {
                    *e.lock().unwrap() = 28; // EINVAL
                    Vec::new()
                };
                r[0] = mk_list(&mut c, &st, &at, &out)?;
                Ok(())
            })?;
        }
    }

    // Instantiation runs the module's start function (VL's program body).
    let _instance = linker.instantiate(&mut store, &module)?;

    for line in state.lock().unwrap().out.iter() {
        println!("{line}");
    }
    Ok(())
}
