fn main() {
    let n: i32 = 200_000_000;
    let mut s: f64 = 0.0;
    for i in 0..n {
        let t: f64 = ((i & 1023) as f64) + 0.5;
        let term: f64 = t.sqrt()
            + (t - 512.0).abs() * 0.001
            + (t * 0.25).floor() * 0.001
            + t.min(100.0) * 0.001
            + t.max(900.0) * 0.001;
        s += term;
    }
    println!("{}", s);
}
