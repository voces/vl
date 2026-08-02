// JS has no int64; the sum stays under 2^53 so plain doubles are exact here.
function main() {
  const n = 1_000_000_000;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    sum += i & 65535;
  }
  console.log(sum);
}
main();
