// mandelbrot — adapted from the Computer Language Benchmarks Game `mandelbrot`
// program. Idiomatic safe Rust: plain scalar loops over a Vec<i32> row buffer,
// no SIMD intrinsics, no rayon, no unsafe.
//
// ADAPTATION: prints a text summary (in-set pixel count + rolling checksum mod
// 1000000007 over the packed bytes) instead of a binary PBM, so all four
// languages produce identical stdout.

fn main() {
    let n: i32 = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(8000);
    let w = n;
    let h = n;
    let iter = 50;
    let limit = 4.0f64;

    let row_bytes = (w / 8) as usize;
    let mut row: Vec<i32> = vec![0; row_bytes];

    let mut in_set: i32 = 0;
    let mut checksum: i64 = 0;

    for y in 0..h {
        let ci = 2.0 * (y as f64) / (h as f64) - 1.0;
        let mut byte_acc: i32 = 0;
        let mut bit_num = 0;
        let mut byte_pos = 0usize;
        for x in 0..w {
            let cr = 2.0 * (x as f64) / (w as f64) - 1.5;
            let mut zr = 0.0f64;
            let mut zi = 0.0f64;
            let mut tr = 0.0f64;
            let mut ti = 0.0f64;
            let mut i = 0;
            while i < iter {
                if tr + ti > limit {
                    break;
                }
                zi = 2.0 * zr * zi + ci;
                zr = tr - ti + cr;
                tr = zr * zr;
                ti = zi * zi;
                i += 1;
            }
            byte_acc <<= 1;
            if tr + ti <= limit {
                byte_acc |= 1;
                in_set += 1;
            }
            bit_num += 1;
            if bit_num == 8 {
                row[byte_pos] = byte_acc;
                byte_pos += 1;
                byte_acc = 0;
                bit_num = 0;
            }
        }
        for b in 0..row_bytes {
            checksum = (checksum * 31 + row[b] as i64) % 1000000007;
        }
    }

    println!("{}", in_set);
    println!("{}", checksum);
}
