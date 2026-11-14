## CLI (Track C)

- **The seed's `.cwasm` sidecar is read only from a private directory:** a seed whose directory another user owns, or that group or others can write, now runs uncached with one stderr line saying why. It used to deserialize any sidecar present there as native code. A sidecar committed to a checkout the user cloned is still trusted; the per-user HMAC seal that would close that is an open ruling.
