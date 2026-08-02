// reverse-inplace — hand-written two-pointer in-place reverse (NOT slice::reverse),
// N elements, ROUNDS times.
const N: i32 = 4_000_000;
const ROUNDS: i32 = 400;

fn run(n: i32, rounds: i32) -> i64 {
    let mut a: Vec<i32> = Vec::new();
    for i in 0..n {
        a.push((i * 7 + 3) & 1048575);
    }
    let mut chk: i64 = 0;
    for r in 0..rounds {
        let bump = (r % n) as usize;
        a[bump] = a[bump] + 1;
        let mut lo = 0usize;
        let mut hi = (n - 1) as usize;
        while lo < hi {
            let t = a[lo];
            a[lo] = a[hi];
            a[hi] = t;
            lo += 1;
            hi -= 1;
        }
        let mut i = 0usize;
        while i < n as usize {
            chk += a[i] as i64;
            i += 65536;
        }
    }
    chk
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
