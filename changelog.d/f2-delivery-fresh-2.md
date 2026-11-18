## Infrastructure (Track F)

- **One freshness question for converting copies, step 2:** the emitter no longer decides on its own whether a delivered list is safe to copy. The checker answers `copySafe` once, after the check, for each list delivered into a list of another element storage, and records it on the node (`copySafeAt`). The emitter's three copy-or-view sites read that record, and refuse loudly at a delivery the checker recorded nothing for. No program changes behaviour.
