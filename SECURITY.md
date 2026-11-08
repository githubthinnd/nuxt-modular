# Security policy

## Supported versions

Only the latest minor release receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue**. Report privately through GitHub:
*Security → Report a vulnerability* on this repository. Include a description, affected versions and a minimal
reproduction. You will get an acknowledgement within 3 working days and a fix or mitigation plan within 14 days.

## Scope notes

- Extensions are **trusted code**: they run with the privileges of the host app. nuxt-modular provides isolation for
  *failures* (error boundaries), not a sandbox for *malicious* extensions. Only install extensions you trust.
- `manifest.config` and `modular.config` are **public** (shipped to the browser). Keep secrets in `runtimeConfig`.
- The module exposes no admin endpoint for toggles or migrations; protect the ones you write.
