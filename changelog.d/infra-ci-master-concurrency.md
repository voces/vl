## Infrastructure (Track F)

- **One master CI run at a time:** master pushes share the `ci-master` concurrency group without cancelling, so at most one master run runs and one waits, a newer push replacing the waiting one; a run covers every merge since the last. Pull request, nightly and manual runs are unchanged. The retired merge queue's `vl-queue/**` push trigger is removed.
