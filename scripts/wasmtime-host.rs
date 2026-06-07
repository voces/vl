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

    // Instantiation runs the module's start function (VL's program body).
    let _instance = linker.instantiate(&mut store, &module)?;

    for line in state.lock().unwrap().out.iter() {
        println!("{line}");
    }
    Ok(())
}
