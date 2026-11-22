## Codegen, memory & runtime (Track B)

- **IR coverage, `coalesce nulRef result rep`:** a nullable map coalesced with a wider map that stores alike (`m ?? d`, D15050's join) is built by the IR as the map's plain core, its result at the wider map's rep (`coalNulMapJoinStoresAlike`).
