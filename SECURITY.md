# Security Policy

## Supported versions

This repository publishes a **static** educational WebGL/WebXR page via GitHub Pages. Only the latest commit on `main` is supported.

## What this project is

- Static HTML + vendored `three.js` (no application server, no accounts, no cookies of value).
- Optional WebXR camera / DeviceOrientation access stays in the browser; the page does not upload sensor or camera data.

## Reporting a vulnerability

Please **do not** open a public issue for exploitable vulnerabilities.

1. Email or message the repository owner via GitHub (security advisory if enabled on the repo: **Security → Advisories → New draft advisory**).
2. Include: affected URL/commit, browser/OS, and a minimal reproduction.
3. Allow reasonable time for a fix before public disclosure.

## Non-vulnerabilities

- High GPU usage or heat on phones from the particle simulation.
- Lack of a confirmed “solar sibling” (scientific uncertainty, not a security bug).
- Third-party sites linked from the Sources panel (DOI, arXiv, Wikipedia).

## Hardening in this repo

- Vendored, exact-version `three@0.170.0` (no CDN at runtime).
- Strict Content-Security-Policy meta tag: `default-src 'none'`; `script-src` / `style-src 'self'` (no `unsafe-inline` / `unsafe-eval`); styles live in `style.css`.
- Note: `frame-ancestors` is **not** enforceable via a meta CSP (browsers ignore it there); custom HTTP headers are not available on GitHub Pages for this project.
- `Referrer-Policy: no-referrer`.
- GitHub Actions pinned by commit SHA with minimal permissions.
