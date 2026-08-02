// struct-soa — STRUCT OF ARRAYS traversal; the parallel-arrays twin of struct-aos.
const N: i32 = 1_000_000;
const ROUNDS: i32 = 500;

fn run(n: i32, rounds: i32) -> i64 {
    let mut xs: Vec<i32> = Vec::new();
    let mut ys: Vec<i32> = Vec::new();
    let mut zs: Vec<i32> = Vec::new();
    let mut ws: Vec<i32> = Vec::new();
    for i in 0..n {
        xs.push(i & 1023);
        ys.push((i * 3) & 1023);
        zs.push((i * 7) & 1023);
        ws.push((i * 11) & 1023);
    }
    let mut total: i64 = 0;
    for r in 0..rounds {
        let mut s: i64 = 0;
        for i in 0..n {
            s += ((xs[i as usize] ^ r) + zs[i as usize]) as i64;
        }
        total += s;
    }
    let _ = (ys.len(), ws.len());
    total
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
