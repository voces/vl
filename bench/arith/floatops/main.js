function main() {
  const n = 200_000_000;
  let s = 0.0;
  for (let i = 0; i < n; i++) {
    const t = (i & 1023) + 0.5;
    const term = Math.sqrt(t)
      + Math.abs(t - 512.0) * 0.001
      + Math.floor(t * 0.25) * 0.001
      + Math.min(t, 100.0) * 0.001
      + Math.max(t, 900.0) * 0.001;
    s += term;
  }
  console.log(s);
}
main();
