# STRIDE threat model — Milky Way AR (static GitHub Pages)

**Scope:** Public static site at `https://kummahiih.github.io/milkyway/` (single-page WebGL / WebXR viewer).  
**Out of scope:** GitHub.com account takeover, physical device malware, and threats that require a server we do not operate (there is no app backend).  
**Date:** 2026-11-06

## Assets

| Asset | Why it matters |
|-------|----------------|
| Integrity of page JS/CSS and vendored `three.js` | Malicious code runs in visitors’ browsers with the page origin |
| GitHub repository + Actions deploy path | Compromised publish pipeline → poisoned Pages site |
| Device camera / motion sensors (WebXR AR, DeviceOrientation) | Privacy; unexpected capture or orientation tracking |
| User trust / reputation of the published science UI | Misleading content or phishing via overlay |
| Browser session of the Pages origin | XSS would share that origin (limited: no cookies of value today) |

## Trust boundaries

```
[Visitor device]
    |  HTTPS
    v
[GitHub Pages CDN]  -- serves index.html, vendor/*, docs (static)
    ^
    |  deploy artifact
[GitHub Actions]  -- checkout → upload-pages-artifact → deploy-pages
    ^
    |  git push
[GitHub repo kummahiih/milkyway]  -- maintainers / compromised tokens

[Visitor device sensors]
    |  permission prompts (camera / motion)
    v
[Browser WebXR / DeviceOrientation APIs]  -- used only by page JS
```

Formerly the page also trusted **jsDelivr** for `three@0.170.0` (CDN supply chain). That boundary is removed by vendoring.

## STRIDE analysis

### Spoofing

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| Fake mirror of the site (phishing) | Med | Med | Canonical URL in README; HTTPS only via Pages | **Open** (user education) |
| Spoofed “Allow motion / AR” UI outside real permission prompts | Low | Low | Browser owns permission chrome; our overlay only triggers `requestPermission` | **Done** |
| Compromised GitHub identity publishing as this repo | Low | High | 2FA / org policies (outside this repo’s code) | **Open** (process) |

### Tampering

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| CDN swap / malicious `three.js` | Med (was) / Low (now) | High | Vendor `three@0.170.0` into `vendor/`; no runtime CDN | **Done** |
| Tampered GitHub Actions tags (`@v4` floating) | Low–Med | High | Pin actions by commit SHA; minimal `permissions` | **Done** |
| Malicious PR merged to `main` | Med | High | Code review / branch protection (repo settings) | **Open** (process) |
| Integrity of static files in transit | Low | High | HTTPS (Pages); `upgrade-insecure-requests` in CSP | **Done** |

### Repudiation

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| Unclear who deployed a bad build | Low | Low | GitHub Actions run logs + git history | **Done** (platform) |
| No server-side audit of visitor actions | N/A | N/A | No backend; nothing to log server-side | N/A |

### Information disclosure

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| Camera frames leave the device via page JS | Low | High | No network upload of media; `connect-src 'self'`; WebXR frames stay in WebGL | **Done** |
| Motion / orientation data exfiltrated | Low | Med | Same CSP; sensors used only for local camera transform | **Done** |
| Referrer leaking path to third parties when opening DOI links | Low | Low | `referrer` meta `no-referrer`; `rel="noopener noreferrer"` | **Done** |
| Source maps / secrets in repo | Low | Med | No secrets in tree; public educational content only | **Done** |

### Denial of service

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| Heavy WebGL locks up a low-end phone | Med | Low–Med | Particle budgets; additive sprites; no network DoS surface | **Done** (best-effort) |
| Pages / Actions outage | Low | Low | Static mirror possible from git clone | **Open** (ops) |
| Workflow spam via `workflow_dispatch` | Low | Low | Maintainer-only dispatch; concurrency cancel-in-progress | **Done** |

### Elevation of privilege

| Threat | Likelihood | Impact | Mitigation | Status |
|--------|------------|--------|------------|--------|
| XSS → same-origin script | Med (was, via CDN/HTML injection) | Med–High | Strict CSP (`default-src 'none'; script-src/style-src 'self'`, no `unsafe-inline`/`unsafe-eval`); no `innerHTML` of dynamic data; static info panel + external `style.css` | **Done** |
| Actions token over-privilege | Low | High | `contents: read`, `pages: write`, `id-token: write` only | **Done** |
| Escape browser via WebGL/WebXR bugs | Low | High | Stay on current browsers; depend on vendor patches | **Open** (platform) |

## Residual / accepted risks

1. **`frame-ancestors` cannot be set via `<meta>` CSP** — browsers ignore `frame-ancestors` (and some other directives) in meta tags; only an HTTP response header works. GitHub Pages does not let this repo set custom CSP headers, so clickjacking framing of the Pages origin remains a platform limitation. Documented; residual risk is low for this static demo.
2. **Sensor/camera permission** still grants powerful APIs once allowed; we only mitigate by not exfiltrating and by CSP `connect-src 'self'` (with `default-src 'none'`).
3. **Branch protection / required reviews** are org/repo settings, not encoded in this tree.

## References

- STRIDE: Microsoft threat modeling
- [Content Security Policy](https://developer.mozilla.org/en-US/docs/Web/HTTP/CSP)
- `docs/dependency-scan.md` — library and Actions advisory check

## Content Security Policy

### Final policy (meta tag)

```
default-src 'none';
script-src 'self';
style-src 'self';
img-src 'self' data: blob:;
connect-src 'self';
worker-src 'self' blob:;
base-uri 'none';
form-action 'none';
object-src 'none'
```

Delivered as:

```html
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: blob:; connect-src 'self'; worker-src 'self' blob:; base-uri 'none'; form-action 'none'; object-src 'none'" />
```

Stylesheets: external `style.css` only. Scripts: external `app.js` + vendored `vendor/three.module.min.js`. No inline `<style>`, no `style=` attributes, no `unsafe-inline` / `unsafe-eval`.

### Directive → STRIDE mapping

| Directive | Mitigates | How |
|-----------|-----------|-----|
| `default-src 'none'` | Tampering, Information disclosure, Elevation of privilege | Deny-by-default for unlisted resource classes |
| `script-src 'self'` | XSS / EoP, Tampering | Only same-origin scripts; blocks CDN/injected script |
| `style-src 'self'` | Tampering, limited XSS via CSS | Only `style.css`; blocks style injection exfil tricks |
| `img-src 'self' data: blob:` | Information disclosure | Allows canvas/WebGL-generated textures; blocks arbitrary remote images |
| `connect-src 'self'` | Information disclosure | Blocks exfil of sensor/camera-derived data to third parties |
| `worker-src 'self' blob:` | Tampering | Workers only from self or blobs (WebGL tooling) |
| `base-uri 'none'` | Spoofing / Tampering | Blocks `<base>` hijacking of relative URLs |
| `form-action 'none'` | Information disclosure, Spoofing | No form posts (site has no forms) |
| `object-src 'none'` | EoP / Tampering | Blocks plugins (`<object>`/`<embed>`) |

### Meta-tag CSP limits on GitHub Pages

This project can only ship CSP via `<meta http-equiv>` because GitHub Pages does not expose custom response headers for this site.

**Unsupported (ignored) in meta CSP** (must be HTTP headers to work):

- `frame-ancestors` — clickjacking framing cannot be forbidden from meta
- `report-uri` / `report-to` — violation reporting endpoints not applied from meta
- `sandbox` — document sandboxing via CSP not applied from meta

Also: no HTTP CSP header means no layered header+meta policy. Residual framing risk is accepted and documented under Residual risks.

### Removed `style-src 'unsafe-inline'` gap and fix

| Before | Risk | Fix |
|--------|------|-----|
| Inline `<style>` block in `index.html` + `style="display:none"` on `#btnOrient` required `style-src 'unsafe-inline'` | Any HTML injection could also inject CSS (UI redress, data exfil via attributes) | Moved all rules to `style.css`; `#btnOrient` uses class `is-hidden`; JS toggles via `classList` (not `setAttribute('style', …)`) |

CSSOM assignments such as `el.style.display = …` are allowed by CSP and are unused for visibility now; `classList` is preferred.

### Verification

Headless Chromium against the local static server (`python3 -m http.server`):

- Page booted: status showed loaded galaxy star count; WebGL canvas present
- `document.querySelectorAll('style').length === 0`
- `document.querySelectorAll('[style]').length === 0`
- `securitypolicyviolation` events: **none** (hook installed before navigation)
- Console: no “Refused to …” CSP messages
- Runtime: **no JS exceptions**

Re-verify after any change that adds markup, third-party URLs, or inline styles.
