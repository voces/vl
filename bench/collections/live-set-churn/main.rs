// A live table of LIVE structs held for the whole run, plus CHURN short-lived
// struct allocations. See main.vl.
//
// Idiomatic Rust: `Vec<Cell>` for the live table; each churn `Cell` is a stack
// value (Copy, no `Box`) — Rust has nothing forcing a heap allocation here,
// unlike collections/struct-alloc's recursive type. The accumulator is i64 and
// folded to i32 once at the end (the loop body is pure addition, so the fold
// commutes with VL's per-op i32 wrap) rather than emulating the wrap per step.

#[derive(Clone, Copy)]
struct Cell {
    a: i32,
    b: i32,
    c: i32,
}

fn main() {
    let live: i32 = 50_000;
    let churn: i32 = 75_000_000;

    let mut keep: Vec<Cell> = Vec::new();
    for i in 0..live {
        keep.push(Cell { a: i, b: i + 1, c: i + 2 });
    }

    let mut s: i64 = 0;
    for i in 0..churn {
        let t = Cell { a: i, b: i & 7, c: 1 };
        s += t.a as i64 + t.b as i64 + keep[(i % live) as usize].c as i64;
    }
    let wrapped = (s & 0xFFFF_FFFF) as u32 as i32;
    println!("sum {}", wrapped);
}
