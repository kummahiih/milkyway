# Milky Way AR

A mobile web page that shows a procedural 3D Milky Way with the Sun marked in the Orion Spur (~8.2 kpc from the galactic centre). The disc is modelled as about 30 kpc across and about 1 metre wide in the scene.

## Live page

- **GitHub Pages (preferred):** https://kummahiih.github.io/milkyway/  
  If that 404s, open **Settings → Pages** on this repo, set Source to **GitHub Actions**, then re-run the “Deploy GitHub Pages” workflow (or push any commit).
- **CDN mirror (works immediately):** https://cdn.jsdelivr.net/gh/kummahiih/milkyway@main/index.html

Open either URL on your phone (HTTPS required for motion / AR).

## How to use

1. Open the page in a modern mobile browser over HTTPS.
2. **Android Chrome (WebXR AR):** tap **Start AR**, allow camera/AR, point at the floor, then tap to place the galactic centre. It stays world-locked as you walk. Default without a floor hit is about 0.5 m ahead on the floor plane. Use **Recenter** to place again.
3. **iPhone Safari (fallback):** AR is not available. Tap **Enable motion** (iOS permission) so the view follows device orientation as if the galaxy sits ~0.5 m away on the floor, or drag with your finger to orbit. Use **Recenter** to reset.
4. Toggle **Labels** for arm names, galactic centre, and the Sun marker.

## What’s in the model

- Central bar and bulge
- Four main log-spiral arms: Perseus, Scutum–Centaurus, Sagittarius, Norma/Outer
- Orion Spur (local arm) with the Sun marked
- Colour variation (young blue stars, dustier redder regions)

## Run locally

```bash
python3 -m http.server 8765
```

Serve over HTTPS for DeviceOrientation permission and WebXR (e.g. GitHub Pages or any HTTPS reverse proxy). Single file: `index.html` (three.js via CDN import map).

## Limitations

- Full 6DOF world-locked AR needs WebXR `immersive-ar` + hit-test (typically Chrome on Android with ARCore). iOS Safari has no WebXR AR; the fallback only tracks rotation, not walking.
- The galaxy is a stylised particle approximation, not a survey catalogue.
- Performance depends on the phone GPU (~80k particles).

## License

Use freely for personal / educational viewing.
