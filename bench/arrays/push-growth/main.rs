// push-growth — build a Vec of N elements from EMPTY by repeated push, ROUNDS times.
const N: i32 = 1_000_000;
const ROUNDS: i32 = 200;

fn run(n: i32, rounds: i32) -> i64 {
    let mut total: i64 = 0;
    for r in 0..rounds {
        let mut a: Vec<i32> = Vec::new();
        for i in 0..n {
            a.push((i ^ r) & 1023);
        }
        total += a.len() as i64;
        let mut i = 0usize;
        while i < n as usize {
            total += a[i] as i64;
            i += 64;
        }
    }
    total
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
