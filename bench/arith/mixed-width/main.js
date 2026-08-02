function main() {
  const n = 300_000_000;
  let si = 0;
  let sl = 0;
  let sf = 0.0;
  for (let i = 0; i < n; i++) {
    si = (si + (i & 1023)) | 0;
    sl += (i & 4095) * 7;
    sf += (i & 63) * 0.1;
  }
  console.log(si);
  console.log(sl);
  console.log(sf);
}
main();
