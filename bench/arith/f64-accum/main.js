function main() {
  const n = 300_000_000;
  let s = 0.0;
  let x = 0.5;
  for (let i = 0; i < n; i++) {
    x = x * 3.9 * (1.0 - x);
    s += x;
  }
  console.log(s);
}
main();
