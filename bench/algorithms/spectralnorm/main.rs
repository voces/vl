// spectral-norm — adapted from the Computer Language Benchmarks Game
// `spectralnorm` program. Idiomatic safe Rust: Vec<f64>, index loops, no
// rayon, no SIMD intrinsics, no unsafe.
//
// ADAPTATION: prints through the same integer-scaling fmt9 as the other three
// languages instead of `{:.9}`.

fn fmt9(v: f64) -> String {
    let (sign, a) = if v < 0.0 { ("-", -v) } else { ("", v) };
    let scaled = (a * 1000000000.0 + 0.5) as i64;
    let ip = scaled / 1000000000;
    let fp = scaled % 1000000000;
    format!("{}{}.{:09}", sign, ip, fp)
}

fn aij(i: i32, j: i32) -> f64 {
    let s = i + j;
    let d = s * (s + 1) / 2 + i + 1;
    1.0 / (d as f64)
}

fn multiply_av(n: i32, v: &[f64], out: &mut [f64]) {
    for i in 0..n {
        let mut sum = 0.0;
        for j in 0..n {
            sum += aij(i, j) * v[j as usize];
        }
        out[i as usize] = sum;
    }
}

fn multiply_atv(n: i32, v: &[f64], out: &mut [f64]) {
    for i in 0..n {
        let mut sum = 0.0;
        for j in 0..n {
            sum += aij(j, i) * v[j as usize];
        }
        out[i as usize] = sum;
    }
}

fn multiply_at_av(n: i32, v: &[f64], out: &mut [f64], tmp: &mut [f64]) {
    multiply_av(n, v, tmp);
    multiply_atv(n, tmp, out);
}

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(5500);
    let mut u = vec![1.0f64; n as usize];
    let mut v = vec![0.0f64; n as usize];
    let mut tmp = vec![0.0f64; n as usize];

    for _ in 0..10 {
        multiply_at_av(n, &u, &mut v, &mut tmp);
        multiply_at_av(n, &v, &mut u, &mut tmp);
    }

    let mut v_bv = 0.0;
    let mut vv = 0.0;
    for i in 0..n as usize {
        v_bv += u[i] * v[i];
        vv += v[i] * v[i];
    }
    println!("{}", fmt9((v_bv / vv).sqrt()));
}
