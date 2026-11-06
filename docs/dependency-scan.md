# Dependency vulnerability scan

**Repository:** `kummahiih/milkyway`  
**Scan date:** 2026-11-06  
**Method:** GitHub Advisory Database via `user-GitHub-xai` / `check_dependency_vulnerabilities`, plus inventory of runtime and CI dependencies.

## Runtime dependencies (browser)

| Name | Version | How loaded | Ecosystem | Advisories |
|------|---------|------------|-----------|------------|
| three | **0.170.0** (exact) | Vendored `vendor/three.module.min.js`; imported from `app.js` as `./vendor/three.module.min.js` (no CDN, no import map) | npm | **None known** (checked) |

### Before hardening

| Name | Version | How loaded | Risk |
|------|---------|------------|------|
| three | 0.170.0 | jsDelivr CDN import map (`cdn.jsdelivr.net/npm/three@0.170.0/...`) | Supply-chain / CDN compromise; floating trust boundary |
| three/addons (CDN import map prefix) | 0.170.0 | Was declared but unused | Removed |

SHA-256 of vendored file:

`08fd7545d13d2c7fb65ab691530a802dafefd638596501854f267d0fb13c39e7`

## GitHub Actions (`.github/workflows/pages.yml`)

| Action | Pinned version | Commit SHA | Advisories |
|--------|----------------|------------|------------|
| actions/checkout | v4.4.0 | `11d5960a326750d5838078e36cf38b85af677262` | **None known** (checked major `4`) |
| actions/configure-pages | v5.0.0 | `983d7736d9b0ae728b81ab479565c72886d7745b` | **None known** |
| actions/upload-pages-artifact | v3.0.1 | `56afc609e74202658d3ffba0e8f6dda462b719fa` | **None known** |
| actions/deploy-pages | v4.0.5 | `d6db90164ac5ed86f2b6aed7e0febac5b3c0c03e` | **None known** |

Workflow `permissions`: `contents: read`, `pages: write`, `id-token: write` (minimal for Pages).

## Tool result summary

`check_dependency_vulnerabilities` for:

- `three@0.170.0` (npm)
- `actions/checkout@4`, `actions/configure-pages@5`, `actions/upload-pages-artifact@3`, `actions/deploy-pages@4`

→ **Checked 5 dependencies. 0 vulnerable. No known vulnerabilities found.**

## Notes / open items

- Re-scan when upgrading `three` or Actions pins.
- GitHub Pages platform libraries are outside this repo’s lockfile.
- No `package.json` / npm install at runtime; inventory is intentionally small.
