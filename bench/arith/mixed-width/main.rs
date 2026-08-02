fn main() {
    let n: i32 = 300_000_000;
    let mut si: i32 = 0;
    let mut sl: i64 = 0;
    let mut sf: f64 = 0.0;
    for i in 0..n {
        si = si.wrapping_add(i & 1023);
        sl += ((i & 4095) as i64) * 7;
        sf += ((i & 63) as f64) * 0.1;
    }
    println!("{}", si);
    println!("{}", sl);
    println!("{}", sf);
}
