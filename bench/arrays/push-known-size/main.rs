// push-known-size — sunpa SP-036's 4x4 matrix product. The idiomatic Rust result is a
// `[f64; 16]` by value; `#[inline(never)]` keeps the product a call, as it is in VL.
const N: i32 = 1_000_000;

#[inline(never)]
fn m4_mul(a: &[f64; 16], b: &[f64; 16]) -> [f64; 16] {
    let mut o = [0.0f64; 16];
    for c in 0..4 {
        for r in 0..4 {
            let mut s = 0.0f64;
            for k in 0..4 {
                s = s + a[k * 4 + r] * b[c * 4 + k];
            }
            o[c * 4 + r] = s;
        }
    }
    o
}

fn run(n: i32) -> i64 {
    let mut m = [1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0];
    let t = [0.999, 0.01, 0.0, 0.0, -0.01, 0.999, 0.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.1, 0.2, 0.3, 1.0];
    for _ in 0..n {
        m = m4_mul(&m, &t);
    }
    (m[12] * 1000000.0f64).trunc() as i64
}

fn main() {
    println!("{}", run(N));
}
