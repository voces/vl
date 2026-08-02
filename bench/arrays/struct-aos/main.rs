// struct-aos — ARRAY OF STRUCTS traversal (see struct-soa for the parallel-arrays twin).
struct P {
    x: i32,
    y: i32,
    z: i32,
    w: i32,
}

const N: i32 = 1_000_000;
const ROUNDS: i32 = 500;

fn run(n: i32, rounds: i32) -> i64 {
    let mut ps: Vec<P> = Vec::new();
    for i in 0..n {
        ps.push(P { x: i & 1023, y: (i * 3) & 1023, z: (i * 7) & 1023, w: (i * 11) & 1023 });
    }
    let mut total: i64 = 0;
    for r in 0..rounds {
        let mut s: i64 = 0;
        for i in 0..n {
            let p = &ps[i as usize];
            s += ((p.x ^ r) + p.z) as i64;
        }
        total += s;
    }
    total
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
