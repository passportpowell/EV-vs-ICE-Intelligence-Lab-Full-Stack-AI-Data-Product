# Dependency audit policy

`npm run security:audit` runs the complete npm audit, including development dependencies, and blocks CI for moderate, high or critical findings. Registry/network errors also fail the gate. The unfiltered counts remain visible in CI.

## Temporary development-only exception

- Advisory: [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm), stack exhaustion in `braces` through 3.0.3.
- Owner: passportpowell (Otis Powell).
- Expires: **12 November 2026 at 00:00 UTC**. The gate stops accepting the exception at that time.
- Basis checked on 12 October: the reviewed advisory lists no patched version. The affected dependency is used by development glob/lint tooling. The application does not accept user-supplied brace patterns through that tooling. This limits the assessed exposure; it does not make the upstream package safe.
- Scope: only this exact advisory and its npm-reported dependent entries, and only when **every affected lockfile node is development-only**. Any additional advisory, runtime node or expired exception blocks CI. No Next.js or other runtime exception is allowed.
- Mitigation: do not expose development tooling to untrusted network clients or run untrusted glob configurations. Recheck upstream and replace/remove the exception as soon as a supported fix is available.

Raw inspection remains available with `npm run security:audit:raw`; runtime-only diagnostics with `npm run security:audit:runtime`. These commands do not replace the blocking all-dependency gate.

This policy records dependency triage, not a claim that the hosted application has undergone penetration testing.
