# Sourced, not run: the collector every SELF-COMPILE runs under (`vl build compiler/entry.vl`).
# refresh-compiler.sh, native-fixpoint.sh, self-compile-time.sh and survey-profile.sh source
# it, so the four cannot drift apart; refresh-compiler.sh's sanity run warms its sidecar.
#
# Copying from a 2 GiB first heap. Null never frees, so its peak is every byte the compiler
# allocates, and the self-compile had grown to 85% of the 4 GiB heap; copying caps the LIVE
# set instead, and the 2 GiB start keeps it out of the band where 256 MiB re-collects a heap
# that is mostly live. DECISIONS.md, "The self-compile runs under copying from a 2 GiB heap".
export VL_COMPILE_GC=copying
export VL_COMPILE_GC_HEAP=2G
