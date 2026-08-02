// dispatch-table — function values called INDIRECTLY, the shape every plugin
// registry / interpreter / state machine has:
//
//   phase 1  an if/else chain calling the four operations directly — the floor
//   phase 2  the four operations in an ARRAY of function values, indexed
//   phase 3  the four operations in a FIELD of a struct, in an array of structs
//
// Idiomatic Rust. Phases 2 and 3 hold `fn(i32) -> i32` function pointers,
// which is what a Rust dispatch table normally is; `Box<dyn Fn>` would add a
// vtable indirection the other three languages do not have.

struct Op {
    f: fn(i32) -> i32,
    name: &'static str,
}

fn op0(x: i32) -> i32 { (x + 1) & 15 }
fn op1(x: i32) -> i32 { (x + 2) & 15 }
fn op2(x: i32) -> i32 { (x * 3) & 15 }
fn op3(x: i32) -> i32 { (x ^ 5) & 15 }

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(50_000_000);
    let mask = 1048575;

    // phase 1 — an if/else chain, direct calls
    let mut a1 = 0i32;
    for i in 0..n {
        let k = i & 3;
        let v = if k == 0 {
            op0(i)
        } else if k == 1 {
            op1(i)
        } else if k == 2 {
            op2(i)
        } else {
            op3(i)
        };
        a1 = (a1 + v) & mask;
    }
    println!("{}", a1);

    // phase 2 — an array of function values
    let fs: [fn(i32) -> i32; 4] = [op0, op1, op2, op3];
    let mut a2 = 0i32;
    for i in 0..n {
        a2 = (a2 + fs[(i & 3) as usize](i)) & mask;
    }
    println!("{}", a2);

    // phase 3 — a function value in a STRUCT FIELD
    let ops: [Op; 4] = [
        Op { f: op0, name: "add1" },
        Op { f: op1, name: "add2" },
        Op { f: op2, name: "mul3" },
        Op { f: op3, name: "xor5" },
    ];
    let mut a3 = 0i32;
    for i in 0..n {
        a3 = (a3 + (ops[(i & 3) as usize].f)(i)) & mask;
    }
    println!("{}", a3);
    let _ = ops[0].name;
}
