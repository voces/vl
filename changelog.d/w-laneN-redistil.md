## Infrastructure (Track F)

- **Distilled re-baseline:** 74 named cells move loud check reject → runs, all from #8222 (an `is`
  that can never match is a warning, D16047 ruling): the 72 `d228w_*` cells and the `nj2` pair
  `nj2_li__lit5_rtf32_rt{f64,i64}__isi32__op`, whose expected output is now `false`.
