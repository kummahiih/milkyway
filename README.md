# Milky Way AR

A mobile web page with a procedural 3D Milky Way, the Sun’s place in the Orion Spur (~8.2 kpc), proposed **solar sibling** candidates, a schematic birth-cluster dispersal band, and an estimated **birth radius** (~5 kpc). The model is about 1 m across and floats above the floor (default **0.4 m**, adjustable 0–1.2 m).

## Live page

**GitHub Pages:** https://kummahiih.github.io/milkyway/

If that URL 404s, enable Pages once: repo **Settings → Pages → Source: GitHub Actions**, then re-run the deploy workflow.

## How to use

1. Open on a phone over HTTPS.
2. **Android Chrome (WebXR):** Start AR, tap the floor to place. The galaxy floats above the hit point; use the **Height** slider.
3. **iPhone Safari:** Enable motion or drag to orbit; same height slider.
4. **Local view** zooms to the solar neighbourhood (1 kpc → 2 m) so sibling candidates are visible at true relative offsets.
5. **Sources** opens the citation panel. **Labels** toggles text markers.

## Solar siblings (candidates, not confirmed)

| Star | Distance | Notes |
|------|----------|--------|
| HD 162826 | ~33.3 pc (Gaia DR3 ϖ=30.068 mas) | Ramírez et al. 2014; low dynamical odds in Martínez-Barbosa et al. 2016 |
| HD 186302 | ~56.7 pc (Gaia DR3 ϖ=17.6309 mas) | Adibekyan et al. 2018 (AMBRE); unlikely in Webb et al. 2020 without a strong GMC kick |
| Solar Sibling 1 (2MASS J19354742+4803549) | ~264 pc (Gaia DR3 ϖ=3.7853 mas; Webb+2020 used ~0.36 kpc / DR2) | Top candidate in Webb et al. 2020; later age tension |

Birth radius marker ~5 kpc (Ratcliffe et al. 2024 ≈4.5±0.4 kpc; Baba et al. 2024 ≈5 kpc; other work ~7 kpc). Dispersal band is a schematic ~5–11 kpc annulus after disc scattering (Webb et al. 2020).

## Run locally

```bash
python3 -m http.server 8765
```

Single file: `index.html` (three.js via CDN import map).

## License

Use freely for personal / educational viewing.

## Security

See [SECURITY.md](SECURITY.md). Threat model: [docs/threat-model-stride.md](docs/threat-model-stride.md). Dependency scan: [docs/dependency-scan.md](docs/dependency-scan.md).

