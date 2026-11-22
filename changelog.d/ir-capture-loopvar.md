## Codegen, memory & runtime (Track B)

- IR coverage: a closure's captured `for-in` variable is read by the IR at its read's rep, admitted only where legacy's capture valtype (`captureValKind`, its own for-in element ladder) agrees (tests/cases `capture binding` −50 on the capture files).
