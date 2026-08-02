// fill-sum — allocate an i32 array of N, then ROUNDS rounds of (fill in place, sum).
const N: usize = 2_000_000;
const ROUNDS: i32 = 200;

fn run(n: usize, rounds: i32) -> i64 {
    let mut a: Vec<i32> = vec![0; n];
    let mut total: i64 = 0;
    for r in 0..rounds {
        for i in 0..n {
            a[i] = ((i as i32) + r) & 65535;
        }
        let mut s: i64 = 0;
        for i in 0..n {
            s += a[i] as i64;
        }
        total += s;
    }
    total
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
