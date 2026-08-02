// Allocating many short-lived structs — the binary-trees GC-pressure shape.
// See main.vl.
//
// Idiomatic Rust: a recursive type REQUIRES indirection, so `Option<Box<Nd>>` is
// the only spelling. Rust therefore also does one heap allocation per node —
// through malloc, with drop-glue freeing each tree — so this is a genuine
// allocator-vs-allocator measurement, not a comparison against zero work.

struct Nd {
    l: Option<Box<Nd>>,
    r: Option<Box<Nd>>,
}

fn build(d: i32) -> Box<Nd> {
    if d == 0 {
        return Box::new(Nd { l: None, r: None });
    }
    Box::new(Nd {
        l: Some(build(d - 1)),
        r: Some(build(d - 1)),
    })
}

fn count(n: &Nd) -> i32 {
    let mut s = 1;
    if let Some(l) = &n.l {
        s += count(l);
    }
    if let Some(r) = &n.r {
        s += count(r);
    }
    s
}

fn main() {
    let max_depth = 16;
    let rounds = 4;

    let mut total: i64 = 0;
    let mut d = 4;
    while d <= max_depth {
        let iters = (1i64 << (max_depth - d + 4)) * rounds;
        let mut s: i64 = 0;
        let mut i: i64 = 0;
        while i < iters {
            s += count(&build(d)) as i64;
            i += 1;
        }
        total += s;
        d += 2;
    }

    let long_lived = build(max_depth);

    println!("{}", total);
    println!("{}", count(&long_lived));
}
