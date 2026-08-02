// lambda-hot — the cost of CALLING, in a hot loop, in four spellings of the
// same function `(x) => (x + k) & 15`:
//
//   phase 1  inlined by hand (no call at all)      — the floor
//   phase 2  a named function                      — a direct call
//   phase 3  a non-capturing closure in a local    — a call through a value
//   phase 4  a closure that CAPTURES a local       — a closure call
//
// Idiomatic Rust: plain closures, not `Box<dyn Fn>`. rustc/LLVM inlines all
// three call spellings, so Rust's honest answer to "what does a lambda cost"
// is "nothing" — that is the point of the comparison.
//
// The accumulator is a serial dependency and all values stay under 2^20, so
// no overflow rules are involved and nothing can be vectorised away.

fn bump(x: i32) -> i32 {
    (x + 1) & 15
}

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(100_000_000);
    let mask = 1048575;

    // phase 1 — no call
    let mut a1 = 0i32;
    for i in 0..n {
        a1 = (a1 + (i & 15)) & mask;
    }
    println!("{}", a1);

    // phase 2 — direct call to a named function
    let mut a2 = 0i32;
    for i in 0..n {
        a2 = (a2 + bump(i)) & mask;
    }
    println!("{}", a2);

    // phase 3 — a non-capturing closure held in a local
    let f3 = |x: i32| (x + 2) & 15;
    let mut a3 = 0i32;
    for i in 0..n {
        a3 = (a3 + f3(i)) & mask;
    }
    println!("{}", a3);

    // phase 4 — a closure that captures a local
    let k = 3;
    let f4 = |x: i32| (x + k) & 15;
    let mut a4 = 0i32;
    for i in 0..n {
        a4 = (a4 + f4(i)) & mask;
    }
    println!("{}", a4);
}
