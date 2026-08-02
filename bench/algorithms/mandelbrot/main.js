// mandelbrot — adapted from the Computer Language Benchmarks Game `mandelbrot`
// program. Idiomatic JS: plain scalar loops over an Array row buffer.
//
// ADAPTATION: prints a text summary (in-set pixel count + rolling checksum mod
// 1000000007 over the packed bytes) instead of a binary PBM, so all four
// languages produce identical stdout. The checksum stays below 2^53 at every
// step, so plain Numbers are exact.

function main() {
  const n = Number(Deno.args[0] ?? 8000);
  const w = n;
  const h = n;
  const iter = 50;
  const limit = 4.0;

  const rowBytes = w / 8;
  const row = new Array(rowBytes).fill(0);

  let inSet = 0;
  let checksum = 0;

  for (let y = 0; y < h; y++) {
    const ci = 2.0 * y / h - 1.0;
    let byteAcc = 0;
    let bitNum = 0;
    let bytePos = 0;
    for (let x = 0; x < w; x++) {
      const cr = 2.0 * x / w - 1.5;
      let zr = 0.0;
      let zi = 0.0;
      let tr = 0.0;
      let ti = 0.0;
      let i = 0;
      while (i < iter) {
        if (tr + ti > limit) break;
        zi = 2.0 * zr * zi + ci;
        zr = tr - ti + cr;
        tr = zr * zr;
        ti = zi * zi;
        i++;
      }
      byteAcc <<= 1;
      if (tr + ti <= limit) {
        byteAcc |= 1;
        inSet++;
      }
      bitNum++;
      if (bitNum === 8) {
        row[bytePos] = byteAcc;
        bytePos++;
        byteAcc = 0;
        bitNum = 0;
      }
    }
    for (let b = 0; b < rowBytes; b++) {
      checksum = (checksum * 31 + row[b]) % 1000000007;
    }
  }

  console.log(inSet);
  console.log(checksum);
}

main();
