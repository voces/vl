// binsearch — QUERIES binary searches over a sorted i32 Vec of N elements (hand-written,
// not slice::binary_search, so all four run the same code).
const N: i32 = 4_000_000;
const QUERIES: i32 = 6_000_000;

fn bsearch(a: &Vec<i32>, n: i32, key: i32) -> i32 {
    let mut lo = 0;
    let mut hi = n - 1;
    let mut found = -1;
    while lo <= hi {
        let mid = (lo + hi) >> 1;
        let v = a[mid as usize];
        if v < key {
            lo = mid + 1;
        } else {
            if v > key {
                hi = mid - 1;
            } else {
                found = mid;
                lo = hi + 1;
            }
        }
    }
    found
}

fn run(n: i32, queries: i32) -> i64 {
    let mut a: Vec<i32> = Vec::new();
    for i in 0..n {
        a.push(i * 3);
    }
    let mut seed: i64 = 987654321;
    let mut hits: i64 = 0;
    let mut idx_sum: i64 = 0;
    for _q in 0..queries {
        seed = (seed * 48271) % 2147483647;
        let key = (seed % (3 * n as i64)) as i32;
        let idx = bsearch(&a, n, key);
        if idx >= 0 {
            hits += 1;
            idx_sum += idx as i64;
        }
    }
    println!("{}", hits);
    idx_sum
}

fn main() {
    println!("{}", run(N, QUERIES));
}
