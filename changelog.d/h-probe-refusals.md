## Infrastructure (Track F)

- **Step 7: the render-parse probe counts programs that end in a refusal.** `emitFailAt` keeps the first failure, so the probe's report was dropped in a program that had already refused, and a site reached only by refusing programs read as unreached (`mapSoftTwinTagFail`, 0 → 2). The hook now clears the latch before reporting.
