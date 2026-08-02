// sort-heap — HAND-WRITTEN heapsort (iterative sift-down), the SAME algorithm in all
// four languages. Deliberately NOT sort_unstable: this measures the language's array
// read/write/compare path, not a library.
const N: i32 = 1_000_000;
const ROUNDS: i32 = 4;

fn sift_down(a: &mut Vec<i32>, start: i32, last: i32) {
    let mut root = start;
    let mut cont = true;
    while cont && root * 2 + 1 <= last {
        let mut child = root * 2 + 1;
        if child + 1 <= last {
            if a[child as usize] < a[(child + 1) as usize] {
                child += 1;
            }
        }
        if a[root as usize] < a[child as usize] {
            let t = a[root as usize];
            a[root as usize] = a[child as usize];
            a[child as usize] = t;
            root = child;
        } else {
            cont = false;
        }
    }
}

fn heapsort(a: &mut Vec<i32>, n: i32) {
    let mut i = (n - 2) >> 1;
    while i >= 0 {
        sift_down(a, i, n - 1);
        i -= 1;
    }
    let mut last = n - 1;
    while last > 0 {
        let t = a[0];
        a[0] = a[last as usize];
        a[last as usize] = t;
        last -= 1;
        sift_down(a, 0, last);
    }
}

fn run(n: i32, rounds: i32) -> i64 {
    let mut a: Vec<i32> = vec![0; n as usize];
    let mut seed: i64 = 123456789;
    let mut chk: i64 = 0;
    let mut inv: i64 = 0;
    let mut last_sum: i64 = 0;
    for _r in 0..rounds {
        for i in 0..n {
            seed = (seed * 48271) % 2147483647;
            a[i as usize] = seed as i32;
        }
        heapsort(&mut a, n);
        let mut i = 0;
        while i < n {
            chk += a[i as usize] as i64;
            i += 4096;
        }
        for i in 1..n {
            if a[(i - 1) as usize] > a[i as usize] {
                inv += 1;
            }
        }
        last_sum = 0;
        for i in 0..n {
            last_sum += a[i as usize] as i64;
        }
    }
    println!("{}", chk);
    println!("{}", inv);
    last_sum
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
