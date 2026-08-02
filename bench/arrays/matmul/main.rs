// matmul — naive dense N x N f64 matrix multiply, i-k-j order, over FLAT Vecs.
const N: usize = 600;
const ROUNDS: i32 = 3;

fn run(n: usize, rounds: i32) -> i64 {
    let mut a: Vec<f64> = Vec::new();
    let mut b: Vec<f64> = Vec::new();
    let mut c: Vec<f64> = Vec::new();
    for i in 0..(n * n) {
        a.push((((i as i32) * 31 + 7) % 97) as f64 * 0.125 - 6.0);
        b.push((((i as i32) * 17 + 3) % 89) as f64 * 0.125 - 5.5);
        c.push(0.0);
    }
    for _r in 0..rounds {
        for i in 0..n {
            for k in 0..n {
                let aik = a[i * n + k];
                for j in 0..n {
                    c[i * n + j] = c[i * n + j] + aik * b[k * n + j];
                }
            }
        }
    }
    let mut s = 0.0f64;
    for i in 0..(n * n) {
        s += c[i];
    }
    (s * 1000.0) as i64
}

fn main() {
    println!("{}", run(N, ROUNDS));
}
