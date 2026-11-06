# Milky Way AR

A mobile web page that shows a procedural 3D Milky Way with the Sun marked in the Orion Spur (~8.2 kpc from the galactic centre). The disc is modelled as about 30 kpc across and about 1 metre wide in the scene.

## Live page

**GitHub Pages:** https://kummahiih.github.io/milkyway/

If that URL 404s, enable Pages once: repo **Settings → Pages → Build and deployment → Source: GitHub Actions**, then re-run the **Deploy GitHub Pages** workflow (Actions tab) or push a commit.

## How to use

1. Open the page on your phone over HTTPS.
2. **Android Chrome (WebXR AR):** tap **Start AR**, allow camera/AR, point at the floor, then tap to place the galactic centre. It stays world-locked as you walk. Without a floor hit, tap places it about 0.5 m ahead on the floor. Use **Recenter** to place again.
3. **iPhone Safari (fallback):** AR is unavailable. Tap **Enable motion** for DeviceOrientation (gyro) as if the galaxy sits ~0.5 m away on the floor, or drag to orbit. **Recenter** resets the view.
4. Toggle **Labels** for arm names, galactic centre, and the Sun.

## What’s in the model

- Central bar and bulge
- Four main log-spiral arms: Perseus, Scutum–Centaurus, Sagittarius, Norma/Outer
- Orion Spur (local arm) with the Sun marked at ~8.2 kpc
- Colour variation (young blue stars, dustier redder regions)

## Run locally

```bash
python3 -m http.server 8765
```

Use HTTPS for DeviceOrientation permission and WebXR. Single file: `index.html` (three.js via CDN import map).

## Limitations

- Full 6DOF world-locked AR needs WebXR `immersive-ar` + hit-test (typically Chrome on Android with ARCore). iOS Safari has no WebXR AR; the fallback only tracks rotation, not walking.
- Stylised particle approximation, not a survey catalogue.
- Performance depends on the phone GPU (~80k particles).

## License

Use freely for personal / educational viewing.
