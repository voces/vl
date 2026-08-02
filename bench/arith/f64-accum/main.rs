fn main() {
    let n: i32 = 300_000_000;
    let mut s: f64 = 0.0;
    let mut x: f64 = 0.5;
    for _ in 0..n {
        x = x * 3.9 * (1.0 - x);
        s += x;
    }
    println!("{}", s);
}
