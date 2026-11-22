## Codegen, memory & runtime (Track B)

- **IR coverage, `coalesce nulRef boxFieldScalar`:** a field every record of a union stores as a `scalar | null` box, read as `u.k ?? d`, is built by the IR: legacy's arm is a plan and an open writer (`coalBoxFieldScalarPlanOf`, `coalBoxFieldScalarOpen`) the IR's new `boxFieldScalar` coalesce arm shares.
