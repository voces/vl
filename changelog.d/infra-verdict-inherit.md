## Infrastructure (Track F)

- **A catch-up merge that brings compiler changes re-runs CI:** `scripts/ci-verdict.sh`'s `inherit` verdict (a clean merge of master into a green PR head skips the heavy jobs) no longer applies when the merged-in master changed `compiler/`, `std/` or `scripts/vl-host/` since the branch's merge base. Without this, #10336's catch-up ran 4 jobs and skipped ci-native and ci-ir-identity on a compiler change merged with a moved master.
