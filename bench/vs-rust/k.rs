// Measurement only: the kernels of k.vl in Rust, the reference VL is measured against (bench.ts).
//
// Written by plumb (a VL consumer transliterating Warcraft III) as PL-037, and shared with the
// VL project for exactly this purpose. See bench/vs-rust/README.md for provenance and how this
// is run; do not diverge VL and Rust semantically — they are meant to compute the same thing.
use std::collections::HashMap;
use std::hash::{BuildHasherDefault, Hasher};

static mut BUF: [u8; 16 << 20] = [0; 16 << 20];
fn d() -> *mut u8 { unsafe { std::ptr::addr_of_mut!(BUF) as *mut u8 } }
unsafe fn ld32(p: *mut u8) -> i32 { (p as *mut i32).read() }
unsafe fn st32(p: *mut u8, v: i32) { (p as *mut i32).write(v) }
unsafe fn ldf(p: *mut u8) -> f32 { (p as *mut f32).read() }
unsafe fn stf(p: *mut u8, v: f32) { (p as *mut f32).write(v) }
unsafe fn ld64(p: *mut u8) -> i64 { (p as *mut i64).read() }
unsafe fn st64(p: *mut u8, v: i64) { (p as *mut i64).write(v) }

#[no_mangle]
pub unsafe extern "C" fn hash(len: i32, repeat: i32) -> i32 {
    let t = d();
    let s = d().add(64);
    for i in 0..16 { st32(t.add(i * 4), (i as i32).wrapping_mul(0x9e3779b9u32 as i32)); }
    for i in 0..len as usize { *s.add(i) = 65 + (i % 26) as u8; }
    *s.add(len as usize) = 0;
    let mut sum: i32 = 0;
    for r in 0..repeat {
        let mut s1 = r.wrapping_add(0x7fed7fed);
        let mut s2 = 0xeeeeeeeeu32 as i32;
        let mut p = s;
        let mut ch = *p as i32;
        while ch != 0 {
            p = p.add(1);
            s1 = (ld32(t.add(((ch as u32 >> 4) * 4) as usize)).wrapping_sub(ld32(t.add(((ch & 15) * 4) as usize)))) ^ s1.wrapping_add(s2);
            s2 = s1.wrapping_add(3).wrapping_add(s2.wrapping_mul(33)).wrapping_add(ch);
            ch = *p as i32;
        }
        sum = sum.wrapping_mul(31).wrapping_add(s1);
    }
    sum
}

#[no_mangle]
pub unsafe extern "C" fn matChain(n: i32) -> i32 {
    let m = d();
    let a = d().add(64);
    let o = d().add(128);
    for i in 0..16 {
        stf(m.add(i * 4), if i % 5 == 0 { 1.0 } else { 0.0 });
        stf(a.add(i * 4), (i + 1) as f32 * 0.0625);
    }
    for _ in 0..n {
        for i in 0..4 {
            for j in 0..4 {
                let x = ldf(m.add(i * 16)) * ldf(a.add(j * 4)) + ldf(m.add(i * 16 + 4)) * ldf(a.add(16 + j * 4)) + ldf(m.add(i * 16 + 8)) * ldf(a.add(32 + j * 4)) + ldf(m.add(i * 16 + 12)) * ldf(a.add(48 + j * 4));
                stf(o.add(i * 16 + j * 4), x);
            }
        }
        let dd = ldf(o);
        for i in 0..16 { stf(m.add(i * 4), ldf(o.add(i * 4)) / dd); }
    }
    ld32(m.add(20))
}

unsafe fn qs(lo: i32, hi: i32) {
    if hi - lo < 1 { return; }
    let b = d();
    let at = |k: i32| b.add(k as usize * 4);
    let pv = ld32(at(((lo + hi) as u32 >> 1) as i32));
    let (mut i, mut j) = (lo, hi);
    while i <= j {
        while ld32(at(i)) < pv { i += 1; }
        while ld32(at(j)) > pv { j -= 1; }
        if i <= j {
            let t = ld32(at(i));
            st32(at(i), ld32(at(j)));
            st32(at(j), t);
            i += 1;
            j -= 1;
        }
    }
    qs(lo, j);
    qs(i, hi);
}
#[no_mangle]
pub unsafe extern "C" fn sort(n: i32) -> i32 {
    let mut x: u32 = 2463534242;
    for i in 0..n as usize {
        x ^= x << 13;
        x ^= x >> 17;
        x ^= x << 5;
        st32(d().add(i * 4), x as i32);
    }
    qs(0, n - 1);
    ld32(d().add((n as usize >> 1) * 4))
}

#[no_mangle]
pub unsafe extern "C" fn mix(n: i32) -> i32 {
    let mut a: i64 = 0x9e3779b97f4a7c15u64 as i64;
    let mut b: i64 = 1;
    for i in 0..1024usize { st64(d().add(i * 8), (i as i64).wrapping_mul(0x100000001b3)); }
    for _ in 0..n {
        let p = d().add((((a as u64) >> 3) as usize & 1023) * 8);
        let v = ld64(p);
        a = (a ^ ((a as u64) >> 12) as i64).wrapping_mul(0x2545f4914f6cdd1d).wrapping_add(v);
        b = b.wrapping_add(((a as u64) >> 32) as i64);
        st64(p, v.wrapping_add(b));
    }
    (a ^ b) as i32
}

#[no_mangle]
pub extern "C" fn array(n: i32) -> i32 {
    let mut xs: Vec<i32> = Vec::new();
    for i in 0..n { xs.push(i.wrapping_mul(7)); }
    let mut s: i32 = 0;
    for r in 0..20 { for i in 0..xs.len() { s = s.wrapping_add(xs[i].wrapping_mul(r + 1)); } }
    s
}

// A multiplicative hasher (as rustc's FxHash): what a Rust program would use for integer keys.
#[derive(Default)]
struct Fx(u64);
impl Hasher for Fx {
    fn finish(&self) -> u64 { self.0 }
    fn write(&mut self, _: &[u8]) { unreachable!() }
    fn write_i32(&mut self, v: i32) { self.0 = (v as u32 as u64).wrapping_mul(0x517cc1b727220a95); }
}
#[no_mangle]
pub extern "C" fn map(n: i32) -> i32 {
    let mut m: HashMap<i32, i32, BuildHasherDefault<Fx>> = HashMap::default();
    for i in 0..n { m.insert(i.wrapping_mul(2654435761u32 as i32), i); }
    let mut s: i32 = 0;
    for _ in 0..10 { for i in 0..n { s = s.wrapping_add(*m.get(&i.wrapping_mul(2654435761u32 as i32)).unwrap_or(&0)); } }
    s
}
