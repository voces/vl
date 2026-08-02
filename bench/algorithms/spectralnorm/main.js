// spectral-norm — adapted from the Computer Language Benchmarks Game
// `spectralnorm` program. Idiomatic JS: plain index loops over Float64Array,
// which is both what the reference JS entry uses and the obvious spelling for
// a numeric vector — the peer of VL's `f64[]`, Rust's `Vec<f64>` and Python's
// list of floats.
//
// ADAPTATION: prints through the same integer-scaling fmt9 as the other three
// languages instead of toFixed(9).

function fmt9(v) {
  let sign = "";
  let a = v;
  if (v < 0) {
    sign = "-";
    a = -v;
  }
  const scaled = Math.trunc(a * 1000000000.0 + 0.5);
  const ip = Math.trunc(scaled / 1000000000);
  const fp = scaled - ip * 1000000000;
  return sign + String(ip) + "." + String(fp).padStart(9, "0");
}

function aij(i, j) {
  const s = i + j;
  const d = s * (s + 1) / 2 + i + 1;
  return 1.0 / d;
}

function multiplyAv(n, v, out) {
  for (let i = 0; i < n; i++) {
    let sum = 0.0;
    for (let j = 0; j < n; j++) sum += aij(i, j) * v[j];
    out[i] = sum;
  }
}

function multiplyAtv(n, v, out) {
  for (let i = 0; i < n; i++) {
    let sum = 0.0;
    for (let j = 0; j < n; j++) sum += aij(j, i) * v[j];
    out[i] = sum;
  }
}

function multiplyAtAv(n, v, out, tmp) {
  multiplyAv(n, v, tmp);
  multiplyAtv(n, tmp, out);
}

function main() {
  const n = Number(Deno.args[0] ?? 5500);
  const u = new Float64Array(n).fill(1.0);
  const v = new Float64Array(n);
  const tmp = new Float64Array(n);

  for (let it = 0; it < 10; it++) {
    multiplyAtAv(n, u, v, tmp);
    multiplyAtAv(n, v, u, tmp);
  }

  let vBv = 0.0;
  let vv = 0.0;
  for (let i = 0; i < n; i++) {
    vBv += u[i] * v[i];
    vv += v[i] * v[i];
  }
  console.log(fmt9(Math.sqrt(vBv / vv)));
}

main();
