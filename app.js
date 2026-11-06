import * as THREE from './vendor/three.module.min.js';

// ——— Scale ———
const GALAXY_DIAMETER_M = 1.0;
const DISC_KPC = 30;
const M_PER_KPC = GALAXY_DIAMETER_M / DISC_KPC;
const SUN_R_KPC = 8.2;
const BIRTH_R_KPC = 5.0; // ~5 kpc consensus (Ratcliffe+2024 ≈4.5; Baba+2024 ≈5)
const PLACE_DISTANCE_M = 0.5;
const DEFAULT_HEIGHT_M = 0.4;
const LOCAL_M_PER_KPC = 2.0; // local view: 1 kpc → 2 m

const statusEl = document.getElementById('status');
const hintEl = document.getElementById('hint');
const infoEl = document.getElementById('info');
const btnAR = document.getElementById('btnAR');
const btnRecenter = document.getElementById('btnRecenter');
const btnLabels = document.getElementById('btnLabels');
const btnArms = document.getElementById('btnArms');
const btnPivot = document.getElementById('btnPivot');
const btnLocal = document.getElementById('btnLocal');
const btnInfo = document.getElementById('btnInfo');
const btnOrient = document.getElementById('btnOrient');
const heightSlider = document.getElementById('heightSlider');
const heightVal = document.getElementById('heightVal');
const labelSizeSlider = document.getElementById('labelSizeSlider');
const labelSizeVal = document.getElementById('labelSizeVal');
const markerSizeSlider = document.getElementById('markerSizeSlider');
const markerSizeVal = document.getElementById('markerSizeVal');
const permOverlay = document.getElementById('permOverlay');
const btnPerm = document.getElementById('btnPerm');
const canvas = document.getElementById('c');

function setStatus(msg, hint = '') {
  statusEl.textContent = msg;
  hintEl.textContent = hint;
}

let heightAboveFloor = DEFAULT_HEIGHT_M;
let viewMode = 'galaxy'; // 'galaxy' | 'local'
let labelsVisible = true;
let armsVisible = true;
let pivotMode = 'sun'; // 'sun' | 'galaxy' — AR/fallback placed point
let infoOpen = false;

function applyPivot() {
  // Offset is under spinRoot & scaleRoot, so world pivot = floatRoot origin for any scale/spin.
  if (pivotMode === 'sun') {
    offsetRoot.position.set(-sunPos.x, -sunPos.y, -sunPos.z);
  } else {
    offsetRoot.position.set(0, 0, 0);
  }
  if (btnPivot) {
    btnPivot.textContent = pivotMode === 'sun' ? 'Centre: Sun' : 'Centre: Galaxy';
    btnPivot.classList.toggle('on', pivotMode === 'sun');
  }
}

function setArmsVisible(on) {
  armsVisible = on;
  armsRoot.visible = on;
  armLabelsRoot.visible = on && labelsVisible;
  btnArms.classList.toggle('on', on);
}


const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, powerPreference: 'high-performance',
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.xr.enabled = true;
renderer.setClearColor(0x000000, 1);
renderer.sortObjects = true;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.01, 50);
camera.position.set(0, 1.4, 0.8);

scene.add(new THREE.AmbientLight(0x6688aa, 0.4));
const key = new THREE.DirectionalLight(0xffe8cc, 0.25);
key.position.set(1, 2, 1);
scene.add(key);

// Floor anchor = placed world point. Hierarchy keeps the pivot fixed under pinch+spin:
//   floorAnchor > floatRoot (height only)
//     > scaleRoot (pinch scale at origin = placed point)
//       > spinRoot (rotates about placed point)
//         > offsetRoot (model offset so Sun or GC sits at the placed point)
//           > galaxy / local content
const floorAnchor = new THREE.Group();
scene.add(floorAnchor);
const floatRoot = new THREE.Group();
floorAnchor.add(floatRoot);
floatRoot.position.y = heightAboveFloor;

const scaleRoot = new THREE.Group();
floatRoot.add(scaleRoot);
const spinRoot = new THREE.Group();
scaleRoot.add(spinRoot);
const offsetRoot = new THREE.Group(); // was offsetRoot; lives UNDER spin so Sun stays fixed
spinRoot.add(offsetRoot);

const galaxyRoot = new THREE.Group();
offsetRoot.add(galaxyRoot);
const labelsRoot = new THREE.Group();
galaxyRoot.add(labelsRoot);
const armsRoot = new THREE.Group(); // spiral arms + arm nebulae (toggleable)
galaxyRoot.add(armsRoot);
const armLabelsRoot = new THREE.Group();
labelsRoot.add(armLabelsRoot);

const localRoot = new THREE.Group();
localRoot.visible = false;
offsetRoot.add(localRoot);
const localLabels = new THREE.Group();
localRoot.add(localLabels);

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function softTexture(inner, mid, outer) {
  const s = 128;
  const c = document.createElement('canvas');
  c.width = c.height = s;
  const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(s/2, s/2, 0, s/2, s/2, s/2);
  g.addColorStop(0, inner);
  g.addColorStop(0.35, mid);
  g.addColorStop(1, outer);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

const starTex = softTexture('rgba(255,255,255,1)', 'rgba(255,230,200,0.55)', 'rgba(0,0,0,0)');
const nebulaTex = softTexture('rgba(255,180,220,0.55)', 'rgba(80,100,200,0.2)', 'rgba(0,0,0,0)');
const dustTex = softTexture('rgba(40,30,50,0.5)', 'rgba(20,15,30,0.2)', 'rgba(0,0,0,0)');
const hiiTex = softTexture('rgba(255,120,180,0.9)', 'rgba(255,60,120,0.35)', 'rgba(0,0,0,0)');
const bulgeTex = softTexture('rgba(255,200,140,0.85)', 'rgba(255,140,80,0.25)', 'rgba(0,0,0,0)');

const ARMS = [
  { name: 'Perseus', a0: 3.2, pitchDeg: 12.2, phase: 0.35, color: [0.55, 0.72, 1.0], weight: 1.15 },
  { name: 'Scutum–Centaurus', a0: 2.7, pitchDeg: 12.0, phase: 0.35 + Math.PI / 2, color: [0.75, 0.85, 1.0], weight: 1.05 },
  { name: 'Sagittarius', a0: 2.9, pitchDeg: 11.8, phase: 0.35 + Math.PI, color: [1.0, 0.78, 0.55], weight: 1.0 },
  { name: 'Norma / Outer', a0: 3.4, pitchDeg: 12.5, phase: 0.35 + 1.5 * Math.PI, color: [0.65, 0.78, 1.0], weight: 0.9 },
];

function armRadius(arm, theta) {
  const b = Math.tan((arm.pitchDeg * Math.PI) / 180);
  return arm.a0 * Math.exp(b * (theta - arm.phase));
}

// Field-star zoom compensation (AR modelScale + fallback cam distance).
// Sun / sibling markers are constant screen-size points (see makeScreenMarker).
const starPointMats = [];
const screenMarkers = []; // Groups wrapping fixed-px Points (Sun, siblings)
const trackedLabels = []; // { marker, label, dxPx, dyPx } — labels follow markers each frame
const POINT_SIZE_MIN_PX = 0.7;
const POINT_SIZE_MAX_PX = 12.0;
const ZOOM_REF_ORBIT = 1.55; // matches default camOrbitDist
const SUN_MARKER_PX = 15;   // CSS px before DPR / markerSizeMul
const SIB_MARKER_PX = 9;
const MARKER_SIZE_DEFAULT = 1;
let markerSizeMul = MARKER_SIZE_DEFAULT;
const _lblWp = new THREE.Vector3();
const _lblNdc = new THREE.Vector3();
const _lblScr = new THREE.Vector3();
const _lblLocal = new THREE.Vector3();

function getWorldZoomScale() {
  // AR: pinch scales scaleRoot. Fallback: closer camera ≈ larger on-screen size.
  // Only call after mode / modelScale / camOrbitDist are initialized.
  if (mode === 'ar') return Math.max(modelScale, 0.05);
  return Math.max(ZOOM_REF_ORBIT / Math.max(camOrbitDist, 0.05), 0.05);
}

function applyZoomCompensate() {
  const z = getWorldZoomScale();
  for (const mat of starPointMats) {
    if (mat.uniforms.uWorldScale) mat.uniforms.uWorldScale.value = z;
  }
  // Keep screen-marker pixel size in sync with the active renderer (incl. WebXR)
  const pr = Math.min(renderer.getPixelRatio(), 2);
  for (const g of screenMarkers) {
    const pts = g.userData.markerPoints;
    if (!pts?.material?.uniforms) continue;
    pts.material.uniforms.uPixelRatio.value = pr;
    pts.material.uniforms.uPixelSize.value = (g.userData.basePixelSize || SUN_MARKER_PX) * markerSizeMul;
  }
}

function trackLabel(marker, label, dxPx = 14, dyPx = -16) {
  label.userData.followMarker = true;
  trackedLabels.push({ marker, label, dxPx, dyPx });
}

/** Place each tracked label at its marker's world pos + a fixed screen-space offset. */
function syncTrackedLabels() {
  const w = renderer.domElement.clientWidth || window.innerWidth;
  const h = renderer.domElement.clientHeight || window.innerHeight;
  if (w < 1 || h < 1) return;
  camera.updateMatrixWorld(true);
  for (const t of trackedLabels) {
    const { marker, label, dxPx, dyPx } = t;
    if (!label.visible && label.parent && !label.parent.visible) continue;
    marker.updateWorldMatrix(true, false);
    marker.getWorldPosition(_lblWp);
    _lblNdc.copy(_lblWp).project(camera);
    if (!Number.isFinite(_lblNdc.z) || _lblNdc.z < -1 || _lblNdc.z > 1) {
      // Behind camera / invalid — keep last pose
      continue;
    }
    // Screen pixels (CSS): +x right, +y down in DOM; we want up+right → +dx, -dy in DOM y
    const sx = (_lblNdc.x * 0.5 + 0.5) * w + dxPx;
    const sy = (-_lblNdc.y * 0.5 + 0.5) * h + dyPx;
    _lblScr.set((sx / w) * 2 - 1, -(sy / h) * 2 + 1, _lblNdc.z);
    _lblScr.unproject(camera);
    // Convert world → label parent's local so hierarchy (spin/scale/pivot) stays consistent
    if (!label.parent) continue;
    label.parent.updateWorldMatrix(true, false);
    _lblLocal.copy(_lblScr);
    label.parent.worldToLocal(_lblLocal);
    label.position.copy(_lblLocal);
  }
}

function makePoints(positions, colors, sizes, opacity = 0.95) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(sizes, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pointTexture: { value: starTex },
      uOpacity: { value: opacity },
      uWorldScale: { value: 1 },
      uSizeMin: { value: POINT_SIZE_MIN_PX },
      uSizeMax: { value: POINT_SIZE_MAX_PX },
    },
    vertexShader: `
      attribute float aSize; attribute vec3 color;
      uniform float uWorldScale; uniform float uSizeMin; uniform float uSizeMax;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vColor = color;
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        float dist = max(0.04, -mvPosition.z);
        float z = max(uWorldScale, 0.05);
        gl_PointSize = clamp(aSize * (320.0 / dist) / z, uSizeMin, uSizeMax);
        vAlpha = smoothstep(uSizeMax, 4.0, gl_PointSize);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      uniform sampler2D pointTexture; uniform float uOpacity;
      varying vec3 vColor; varying float vAlpha;
      void main() {
        vec4 tex = texture2D(pointTexture, gl_PointCoord);
        if (tex.a < 0.03) discard;
        gl_FragColor = vec4(vColor, tex.a * uOpacity * (0.5 + 0.5 * vAlpha));
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  starPointMats.push(mat);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  return pts;
}

function addCloudSprites(parent, n, rng, sampler, map, baseScale) {
  for (let i = 0; i < n; i++) {
    const s = sampler(rng, i);
    const spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map, color: s.color, transparent: true, opacity: s.opacity,
      depthWrite: false, blending: s.add ? THREE.AdditiveBlending : THREE.NormalBlending,
    }));
    spr.position.set(s.x * M_PER_KPC, s.y * M_PER_KPC, s.z * M_PER_KPC);
    const sc = baseScale * s.scale;
    spr.scale.set(sc, sc * 0.55, 1);
    parent.add(spr);
  }
}

function buildGalaxy() {
  const corePos = [], coreCol = [], coreSize = [];
  const armPos = [], armCol = [], armSize = [];
  const rng = mulberry32(0x4d494c4b);

  function push(arrP, arrC, arrS, x, y, z, r, g, b, size) {
    arrP.push(x * M_PER_KPC, y * M_PER_KPC, z * M_PER_KPC);
    arrC.push(r, g, b); arrS.push(size);
  }

  // Bulge (core)
  for (let i = 0; i < 14000; i++) {
    const rad = 1.9 * Math.pow(rng(), 0.55);
    const theta = 2 * Math.PI * rng();
    const phi = Math.acos(2 * rng() - 1);
    const x = rad * Math.sin(phi) * Math.cos(theta);
    const y = rad * Math.cos(phi) * 0.42;
    const z = rad * Math.sin(phi) * Math.sin(theta);
    const t = Math.min(1, Math.hypot(x, z) / 2.2);
    push(corePos, coreCol, coreSize, x, y, z, 1.0, 0.78 - 0.12 * t, 0.42 - 0.15 * t, 0.007 + rng() * 0.014);
  }
  // Bar (core)
  for (let i = 0; i < 8000; i++) {
    const along = (rng() - 0.5) * 9.0;
    const width = (rng() - 0.5) * (1.0 + 0.12 * Math.abs(along));
    const height = (rng() - 0.5) * 0.5;
    const ang = 0.4;
    const x = along * Math.cos(ang) - width * Math.sin(ang);
    const z = along * Math.sin(ang) + width * Math.cos(ang);
    push(corePos, coreCol, coreSize, x, height, z, 1.0, 0.74 + rng() * 0.1, 0.4 + rng() * 0.1, 0.006 + rng() * 0.012);
  }
  // Spiral arms (separate Points)
  for (const arm of ARMS) {
    const count = Math.floor(22000 * arm.weight);
    for (let i = 0; i < count; i++) {
      let theta = arm.phase + rng() * 4.4 * Math.PI;
      let r = armRadius(arm, theta);
      for (let t = 0; t < 5 && (r < 2.1 || r > 14.6); t++) {
        theta = arm.phase + rng() * 4.6 * Math.PI;
        r = armRadius(arm, theta);
      }
      r = Math.min(14.9, Math.max(2.0, r));
      const w = (0.32 + 0.04 * r) * (rng() - 0.5) * 2;
      const h = (0.07 + 0.01 * r) * (rng() - 0.5) * 2;
      const x = (r + w * 0.12) * Math.cos(theta) - w * Math.sin(theta);
      const z = (r + w * 0.12) * Math.sin(theta) + w * Math.cos(theta);
      const young = rng();
      let cr = arm.color[0], cg = arm.color[1], cb = arm.color[2];
      if (young > 0.84) { cr = 0.65; cg = 0.85; cb = 1.0; }
      else if (young < 0.1) { cr = 1.0; cg = 0.55; cb = 0.32; }
      const bright = 0.55 + rng() * 0.45;
      push(armPos, armCol, armSize, x, h, z, cr * bright, cg * bright, cb * bright,
        0.004 + rng() * 0.016 + (young > 0.92 ? 0.012 : 0));
    }
  }
  // Orion spur (with arms)
  for (let i = 0; i < 5000; i++) {
    const r = 7.2 + rng() * 2.2;
    const theta = 0.15 + (r - 7.2) * 0.08 + (rng() - 0.5) * 0.85;
    const w = (rng() - 0.5) * 0.9;
    const h = (rng() - 0.5) * 0.2;
    const x = r * Math.cos(theta) + w * Math.cos(theta + Math.PI / 2);
    const z = r * Math.sin(theta) + w * Math.sin(theta + Math.PI / 2);
    push(armPos, armCol, armSize, x, h, z, 0.85 + rng()*0.15, 0.9 + rng()*0.08, 1.0, 0.005 + rng()*0.014);
  }
  // Field (core — stays when arms hidden)
  for (let i = 0; i < 18000; i++) {
    const r = 1.5 + 13.5 * Math.sqrt(rng());
    const theta = 2 * Math.PI * rng();
    const h = (rng() - 0.5) * (0.22 + 0.018 * r);
    push(corePos, coreCol, coreSize, r * Math.cos(theta), h, r * Math.sin(theta),
      0.7 + rng()*0.3, 0.78 + rng()*0.18, 0.95, 0.003 + rng()*0.008);
  }

  const coreStars = makePoints(corePos, coreCol, coreSize, 0.92);
  galaxyRoot.add(coreStars);
  const armStars = makePoints(armPos, armCol, armSize, 0.92);
  armsRoot.add(armStars);

  // Bulge glow sprite
  const bulgeSpr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: bulgeTex, color: 0xffc080, transparent: true, opacity: 0.55,
    depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  bulgeSpr.scale.set(0.22, 0.14, 1);
  galaxyRoot.add(bulgeSpr);

  // Nebula / dust / HII along arms → armsRoot
  addCloudSprites(armsRoot, 48, rng, (rng) => {
    const arm = ARMS[Math.floor(rng() * ARMS.length)];
    const theta = arm.phase + (0.8 + rng() * 2.8) * Math.PI;
    let r = Math.min(13, Math.max(3.5, armRadius(arm, theta)));
    const x = r * Math.cos(theta), z = r * Math.sin(theta);
    return {
      x, y: (rng() - 0.5) * 0.15, z,
      color: new THREE.Color().setHSL(0.6 + rng() * 0.15, 0.45, 0.55),
      opacity: 0.18 + rng() * 0.16, scale: 0.7 + rng() * 1.1, add: true,
    };
  }, nebulaTex, 0.08);

  addCloudSprites(armsRoot, 36, rng, (rng) => {
    const arm = ARMS[Math.floor(rng() * ARMS.length)];
    const theta = arm.phase + (0.5 + rng() * 3.0) * Math.PI;
    let r = Math.min(12.5, Math.max(3, armRadius(arm, theta)));
    return {
      x: r * Math.cos(theta), y: (rng() - 0.5) * 0.08, z: r * Math.sin(theta),
      color: new THREE.Color(0x1a1520), opacity: 0.35 + rng() * 0.25,
      scale: 0.9 + rng() * 1.4, add: false,
    };
  }, dustTex, 0.07);

  addCloudSprites(armsRoot, 28, rng, (rng) => {
    const arm = ARMS[Math.floor(rng() * ARMS.length)];
    const theta = arm.phase + (1.0 + rng() * 2.5) * Math.PI;
    let r = Math.min(12, Math.max(4, armRadius(arm, theta)));
    return {
      x: r * Math.cos(theta), y: (rng() - 0.5) * 0.1, z: r * Math.sin(theta),
      color: new THREE.Color(0xff6699), opacity: 0.45 + rng() * 0.35,
      scale: 0.25 + rng() * 0.45, add: true,
    };
  }, hiiTex, 0.045);

  // Soft disc (stays with core)
  const disc = new THREE.Mesh(
    new THREE.RingGeometry(0.015, GALAXY_DIAMETER_M * 0.52, 96),
    new THREE.MeshBasicMaterial({
      color: 0x2a3a66, transparent: true, opacity: 0.1,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  disc.rotation.x = -Math.PI / 2;
  galaxyRoot.add(disc);

  return {
    starCount: (corePos.length + armPos.length) / 3,
    armStarCount: armPos.length / 3,
    bulgeSpr,
  };
}

const { starCount, armStarCount, bulgeSpr } = buildGalaxy();

// ——— Labels ———
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
// Fallback labels: ~40% of the original world size (+ orbit compensate).
// AR labels: fixed real-world plate height AR_LABEL_LINE_M at labelSizeMul=1 (default mul=0.3).
const LABEL_SIZE = 0.4;
const LABEL_REF_ORBIT = 1.55;
const LABEL_COMP_MIN = 0.25;
const LABEL_COMP_MAX = 2.2;
const AR_LABEL_LINE_M = 0.018; // 1.8 cm at 1×; default slider 0.3× → 0.54 cm
const LABEL_SIZE_DEFAULT = 0.3;
let labelSizeMul = LABEL_SIZE_DEFAULT;
let arLabelSizeLog = { lastKey: '', samples: [] };
const _parentScale = new THREE.Vector3();
const _worldScale = new THREE.Vector3();

function makeLabel(text, color = '#ffe9a8', scale = 1) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  // Tight padding so the plate ≈ the glyph bounds (avoids a large empty quad)
  const padX = 4, padY = 3;
  ctx.font = '600 22px system-ui, sans-serif';
  const metrics = ctx.measureText(text);
  const w = Math.ceil(metrics.width) + padX * 2;
  const h = 22 + padY * 2; // ≈ font size + pad; little transparent margin
  c.width = w * 2; c.height = h * 2;
  ctx.scale(2, 2);
  ctx.font = '600 22px system-ui, sans-serif';
  ctx.fillStyle = 'rgba(0,0,12,0.72)';
  roundRect(ctx, 0, 0, w, h, 5); ctx.fill();
  ctx.fillStyle = color; ctx.textBaseline = 'middle';
  ctx.fillText(text, padX, h / 2);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  // sizeAttenuation:true → sprite.scale is metric world size (Three.js default; set explicitly)
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({
    map: tex, transparent: true, depthTest: false, sizeAttenuation: true,
  }));
  const fbSx = (w / 520) * scale * LABEL_SIZE;
  const fbSy = (h / 520) * scale * LABEL_SIZE;
  spr.scale.set(fbSx, fbSy, 1);
  spr.userData.isLabel = true;
  spr.userData.aspect = w / Math.max(h, 1);
  spr.userData.scaleMul = scale;
  spr.userData.fbSx = fbSx;
  spr.userData.fbSy = fbSy;
  spr.userData.canvasW = w;
  spr.userData.canvasH = h;
  return spr;
}

/** World-space scale contributed by all parents (not including the object itself). */
function parentWorldScaleY(obj) {
  if (!obj.parent) return 1;
  obj.parent.updateWorldMatrix(true, false);
  obj.parent.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), _parentScale);
  return Math.max(Math.abs(_parentScale.y), 1e-9);
}

function updateLabelSprites(root) {
  if (mode === 'ar') {
    const worldH = AR_LABEL_LINE_M * labelSizeMul;
    let sample = null;
    root.traverse((c) => {
      if (!c.isSprite || !c.userData.isLabel) return;
      c.quaternion.copy(camera.quaternion);
      const parentSy = parentWorldScaleY(c); // includes scaleRoot / any other parents
      const hWorld = worldH;
      const wWorld = hWorld * (c.userData.aspect || 1);
      c.scale.set(wWorld / parentSy, hWorld / parentSy, 1);
      if (!sample) {
        c.updateWorldMatrix(true, false);
        c.matrixWorld.decompose(new THREE.Vector3(), new THREE.Quaternion(), _worldScale);
        sample = {
          textAspect: c.userData.aspect,
          canvasW: c.userData.canvasW,
          canvasH: c.userData.canvasH,
          localSx: c.scale.x,
          localSy: c.scale.y,
          parentSy,
          matrixWorldSy: Math.abs(_worldScale.y),
          targetWorldH: hWorld,
          modelScale,
          scaleRootScale: scaleRoot.scale.x,
          sizeAttenuation: c.material.sizeAttenuation,
        };
      }
    });
    if (sample) {
      const key = `${sample.targetWorldH.toFixed(4)}@${modelScale.toFixed(3)}x${labelSizeMul.toFixed(2)}`;
      if (key !== arLabelSizeLog.lastKey) {
        arLabelSizeLog.lastKey = key;
        arLabelSizeLog.samples.push(sample);
        console.info(
          `[labels:AR] targetH=${sample.targetWorldH.toFixed(4)} m (${(sample.targetWorldH * 100).toFixed(2)} cm)` +
          ` matrixWorld.sy=${sample.matrixWorldSy.toFixed(5)}` +
          ` localSy=${sample.localSy.toFixed(5)} parentSy=${sample.parentSy.toFixed(5)}` +
          ` modelScale=${sample.modelScale.toFixed(3)} mul=${labelSizeMul.toFixed(2)}` +
          ` sizeAttenuation=${sample.sizeAttenuation}` +
          ` canvas ${sample.canvasW}×${sample.canvasH}`
        );
        globalThis.__arLabelSize = sample;
      }
    }
    return;
  }

  const k = THREE.MathUtils.clamp(camOrbitDist / LABEL_REF_ORBIT, LABEL_COMP_MIN, LABEL_COMP_MAX) * labelSizeMul;
  root.traverse((c) => {
    if (!c.isSprite || !c.userData.isLabel) return;
    c.quaternion.copy(camera.quaternion);
    c.scale.set(c.userData.fbSx * k, c.userData.fbSy * k, 1);
  });
}

const sunTheta = 0.22;
function cylToWorld(rKpc, theta, yKpc = 0) {
  return new THREE.Vector3(
    rKpc * Math.cos(theta) * M_PER_KPC,
    yKpc * M_PER_KPC,
    rKpc * Math.sin(theta) * M_PER_KPC
  );
}
const sunPos = cylToWorld(SUN_R_KPC, sunTheta, 0.05);

function helioToWorld(xTowardGC, yAlongRot, zNGP) {
  // Our plane XZ, Y up. Sun at sunTheta.
  const radial = new THREE.Vector3(Math.cos(sunTheta), 0, Math.sin(sunTheta)); // GC → Sun
  const rot = new THREE.Vector3(-Math.sin(sunTheta), 0, Math.cos(sunTheta));
  const up = new THREE.Vector3(0, 1, 0);
  // heliocentric: +x toward GC = −radial from Sun
  return sunPos.clone()
    .addScaledVector(radial, -xTowardGC * M_PER_KPC)
    .addScaledVector(rot, yAlongRot * M_PER_KPC)
    .addScaledVector(up, zNGP * M_PER_KPC);
}

function helioToLocal(xTowardGC, yAlongRot, zNGP) {
  const radial = new THREE.Vector3(Math.cos(sunTheta), 0, Math.sin(sunTheta));
  const rot = new THREE.Vector3(-Math.sin(sunTheta), 0, Math.cos(sunTheta));
  const up = new THREE.Vector3(0, 1, 0);
  return new THREE.Vector3(0, 0, 0)
    .addScaledVector(radial, -xTowardGC * LOCAL_M_PER_KPC)
    .addScaledVector(rot, yAlongRot * LOCAL_M_PER_KPC)
    .addScaledVector(up, zNGP * LOCAL_M_PER_KPC);
}

// Sibling data (heliocentric Galactic xyz in kpc; SIMBAD / Webb+2020)
const SIBLINGS = [
  {
    id: 'HD 162826',
    note: 'candidate · Ramírez+2014',
    status: 'Unlikely (Martínez-Barbosa+2016)',
    // ℓ=66.064°, b=+28.060°, Gaia DR3 ϖ=30.068 mas → d=33.26 pc
    xyz: [0.01191, 0.02683, 0.01565],
    color: 0x4db3ff, // distinct blue
    coreColor: 0xd0ecff,
  },
  {
    id: 'HD 186302',
    note: 'AMBRE twin · Adibekyan+2018',
    status: 'Unlikely without strong GMC (Webb+2020)',
    // ℓ=325.271°, b=−30.272°, Gaia DR3 ϖ=17.6309 mas → d=56.72 pc
    xyz: [0.04026, -0.02791, -0.02859],
    color: 0xff7a3d, // distinct orange
    coreColor: 0xffd0b0,
  },
  {
    id: 'Solar Sibling 1',
    note: '2MASS J19354742+4803549 · Gaia DR3 plx',
    status: 'Top Webb+2020 candidate; age tension (~40 Myr assoc.)',
    // ℓ=80.6299°, b=12.9926°, Gaia DR3 ϖ=3.7853 mas → d=264.2 pc (Webb+2020 used ~0.36 kpc / DR2)
    // source_id 2128840912955018368
    xyz: [0.0419, 0.2540, 0.0594],
    color: 0xb388ff, // distinct violet (not Sun yellow)
    coreColor: 0xe8d6ff,
  },
];

/** World-size sphere markers (galactic centre / birth only — may scale with the model). */
function makeMarker(color, radius = 0.006) {
  const g = new THREE.Group();
  g.add(new THREE.Mesh(
    new THREE.SphereGeometry(radius, 14, 14),
    new THREE.MeshBasicMaterial({ color })
  ));
  return g;
}

/**
 * Constant screen-size marker (Sun / siblings).
 * Bright core + soft ring in the fragment shader; gl_PointSize = basePx × mul × DPR.
 */
function makeScreenMarker(color, pixelSize, { coreColor = 0xffffff } = {}) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uCoreColor: { value: new THREE.Color(coreColor) },
      uPixelSize: { value: pixelSize * markerSizeMul },
      uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, 2) },
    },
    vertexShader: `
      uniform float uPixelSize;
      uniform float uPixelRatio;
      void main() {
        vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = max(2.0, uPixelSize * uPixelRatio);
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      uniform vec3 uColor;
      uniform vec3 uCoreColor;
      void main() {
        vec2 uv = gl_PointCoord - vec2(0.5);
        float r = length(uv) * 2.0; // 0 centre → 1 rim
        float core = smoothstep(0.42, 0.0, r);
        float ring = smoothstep(0.22, 0.52, r) * smoothstep(1.0, 0.62, r);
        float a = max(core, ring * 0.9);
        if (a < 0.03) discard;
        vec3 col = mix(uColor, uCoreColor, core);
        gl_FragColor = vec4(col, a);
      }`,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    blending: THREE.AdditiveBlending,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = 10;
  const g = new THREE.Group();
  g.add(pts);
  g.userData.isScreenMarker = true;
  g.userData.basePixelSize = pixelSize;
  g.userData.pixelSize = pixelSize;
  g.userData.markerPoints = pts;
  screenMarkers.push(g);
  return g;
}

/** Effective gl_PointSize in framebuffer pixels for a screen marker. */
function screenMarkerFbPx(g) {
  const pts = g.userData.markerPoints;
  if (!pts?.material?.uniforms) return null;
  const u = pts.material.uniforms;
  return u.uPixelSize.value * u.uPixelRatio.value;
}

// Sun in galaxy view — ~15 CSS px × mul × DPR, bright core + soft ring
const sunGroup = makeScreenMarker(0xffe566, SUN_MARKER_PX, { coreColor: 0xfff6c8 });
sunGroup.position.copy(sunPos);
galaxyRoot.add(sunGroup);
const sunLabel = makeLabel('Sun · Orion Spur · 8.2 kpc', '#ffe9a8');
labelsRoot.add(sunLabel);
trackLabel(sunGroup, sunLabel, 16, -18);

const centreMarker = makeMarker(0xff8866, 0.009);
galaxyRoot.add(centreMarker);
const centreLabel = makeLabel('Galactic centre', '#ffb0a0');
labelsRoot.add(centreLabel);
trackLabel(centreMarker, centreLabel, 14, -16);

// Birth radius marker (~5 kpc on solar azimuth)
const birthPos = cylToWorld(BIRTH_R_KPC, sunTheta, 0.02);
const birthMarker = makeMarker(0xa0ffc8, 0.007);
birthMarker.position.copy(birthPos);
galaxyRoot.add(birthMarker);
const birthLabel = makeLabel('Sun birth ~5 kpc (lit. ~4.5–7)', '#b8ffd0');
labelsRoot.add(birthLabel);
trackLabel(birthMarker, birthLabel, 14, -16);
// Path Sun → birth (migration)
{
  const curve = new THREE.BufferGeometry().setFromPoints([birthPos, sunPos]);
  const line = new THREE.Line(curve, new THREE.LineBasicMaterial({
    color: 0x88ffbb, transparent: true, opacity: 0.45,
  }));
  galaxyRoot.add(line);
}

// Dispersal band: schematic annulus ~5–11 kpc (Webb+2020 siblings on Sun-like orbits after scattering)
{
  const inner = 5.0 * M_PER_KPC, outer = 11.0 * M_PER_KPC;
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(inner, outer, 96),
    new THREE.MeshBasicMaterial({
      color: 0x66aaff, transparent: true, opacity: 0.09,
      side: THREE.DoubleSide, depthWrite: false,
    })
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.y = 0.002;
  galaxyRoot.add(ring);
  const bandLabel = makeLabel('Sibling dispersal band (schematic)', '#a8c8ff', 0.9);
  bandLabel.position.set(0, 0.03, 9.5 * M_PER_KPC);
  labelsRoot.add(bandLabel);
}

// Galaxy-view sibling markers (tiny at disc scale — still placed truthfully)
for (const sib of SIBLINGS) {
  const p = helioToWorld(sib.xyz[0], sib.xyz[1], sib.xyz[2]);
  const m = makeScreenMarker(sib.color, SIB_MARKER_PX, { coreColor: sib.coreColor });
  m.position.copy(p);
  galaxyRoot.add(m);
  const lab = makeLabel(sib.id, '#d0e8ff', 0.75);
  labelsRoot.add(lab);
  trackLabel(m, lab, 12, -14);
}

for (const L of [
  { name: 'Perseus Arm', arm: ARMS[0], t: 2.2 },
  { name: 'Sagittarius Arm', arm: ARMS[2], t: 2.1 },
]) {
  const theta = L.arm.phase + L.t * Math.PI;
  let r = Math.min(12.5, Math.max(4, armRadius(L.arm, theta)));
  const spr = makeLabel(L.name, '#cfe0ff', 0.85);
  spr.position.set(r * Math.cos(theta) * M_PER_KPC, 0.03, r * Math.sin(theta) * M_PER_KPC);
  armLabelsRoot.add(spr);
}

// ——— Local neighbourhood view (1 kpc → 2 m) ———
function buildLocalView() {
  const rng = mulberry32(0x4c4f4341);
  // Local field stars in a ~0.5 kpc ball
  const pos = [], col = [], siz = [];
  for (let i = 0; i < 2500; i++) {
    const u = rng();
    const r = 0.45 * Math.cbrt(u); // kpc
    const th = 2 * Math.PI * rng();
    const ph = Math.acos(2 * rng() - 1);
    const x = r * Math.sin(ph) * Math.cos(th);
    const y = r * Math.cos(ph) * 0.35;
    const z = r * Math.sin(ph) * Math.sin(th);
    pos.push(x * LOCAL_M_PER_KPC, y * LOCAL_M_PER_KPC, z * LOCAL_M_PER_KPC);
    col.push(0.75 + rng()*0.25, 0.8 + rng()*0.15, 1.0);
    siz.push(0.008 + rng() * 0.02);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.Float32BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      pointTexture: { value: starTex },
      uOpacity: { value: 0.9 },
      uWorldScale: { value: 1 },
      uSizeMin: { value: POINT_SIZE_MIN_PX },
      uSizeMax: { value: POINT_SIZE_MAX_PX },
    },
    vertexShader: `
      attribute float aSize; attribute vec3 color;
      uniform float uWorldScale; uniform float uSizeMin; uniform float uSizeMax;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 mv = modelViewMatrix * vec4(position,1.0);
        float z = max(uWorldScale, 0.05);
        gl_PointSize = clamp(aSize * (260.0 / max(0.05,-mv.z)) / z, uSizeMin, uSizeMax);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform sampler2D pointTexture; uniform float uOpacity; varying vec3 vColor;
      void main() {
        vec4 t = texture2D(pointTexture, gl_PointCoord);
        if (t.a < 0.04) discard;
        gl_FragColor = vec4(vColor, t.a * uOpacity);
      }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  starPointMats.push(mat);
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  localRoot.add(pts);

  // Local Sun at origin of localRoot (we place localRoot at sun galactocentric later)
  const localSun = makeScreenMarker(0xffe566, SUN_MARKER_PX, { coreColor: 0xfff6c8 });
  localRoot.add(localSun);
  const ls = makeLabel('Sun', '#ffe9a8', 1.2);
  localLabels.add(ls);
  trackLabel(localSun, ls, 14, -16);

  // 100 pc scale bar
  const barLen = 0.1 * LOCAL_M_PER_KPC;
  const barGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-barLen/2, -0.12, 0.15),
    new THREE.Vector3(barLen/2, -0.12, 0.15),
  ]);
  localRoot.add(new THREE.Line(barGeo, new THREE.LineBasicMaterial({ color: 0xaaccff })));
  const barLab = makeLabel('100 pc', '#aaccff', 0.9);
  barLab.position.set(0, -0.1, 0.15);
  localLabels.add(barLab);

  for (const sib of SIBLINGS) {
    const p = helioToLocal(sib.xyz[0], sib.xyz[1], sib.xyz[2]);
    const m = makeScreenMarker(sib.color, SIB_MARKER_PX, { coreColor: sib.coreColor });
    m.position.copy(p);
    localRoot.add(m);
    const line = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), p]),
      new THREE.LineBasicMaterial({ color: sib.color, transparent: true, opacity: 0.35 })
    );
    localRoot.add(line);
    const lab = makeLabel(`${sib.id}`, '#e8f0ff', 1.0);
    localLabels.add(lab);
    trackLabel(m, lab, 12, -14);
    const lab2 = makeLabel(sib.note, '#a8b8d0', 0.75);
    localLabels.add(lab2);
    trackLabel(m, lab2, 12, 2); // note sits slightly below the id label
  }
}
buildLocalView();
// Place localRoot at Sun's galactocentric position (same as galaxy sun)
localRoot.position.copy(sunPos);
applyPivot(); // default: Sun at the placed/floor-anchor point


function applyHeight() {
  floatRoot.position.y = heightAboveFloor;
  heightVal.textContent = heightAboveFloor.toFixed(2) + ' m';
}
heightSlider.addEventListener('input', () => {
  heightAboveFloor = parseFloat(heightSlider.value);
  applyHeight();
});
applyHeight();

labelSizeSlider.addEventListener('input', () => {
  labelSizeMul = parseFloat(labelSizeSlider.value);
  labelSizeVal.textContent = labelSizeMul.toFixed(2) + '×';
  arLabelSizeLog.lastKey = ''; // force re-log on next AR frame
});
labelSizeMul = parseFloat(labelSizeSlider.value) || LABEL_SIZE_DEFAULT;
labelSizeVal.textContent = labelSizeMul.toFixed(2) + '×';

markerSizeSlider.addEventListener('input', () => {
  markerSizeMul = parseFloat(markerSizeSlider.value);
  markerSizeVal.textContent = markerSizeMul.toFixed(2) + '×';
  applyZoomCompensate();
});
markerSizeMul = parseFloat(markerSizeSlider.value) || MARKER_SIZE_DEFAULT;
markerSizeVal.textContent = markerSizeMul.toFixed(2) + '×';
// applyZoomCompensate runs from the animation loop once mode/modelScale exist

/** Headless / debug: apply AR label layout and measure matrixWorld height. */
globalThis.__measureArLabelWorld = (mul = 1, scale = 1) => {
  const prevMode = mode;
  const prevMul = labelSizeMul;
  const prevScale = modelScale;
  mode = 'ar';
  labelSizeMul = mul;
  modelScale = scale;
  applyModelScale();
  applyPivot();
  updateLabelSprites(labelsRoot);
  floorAnchor.updateWorldMatrix(true, true);
  let sample = null;
  labelsRoot.traverse((c) => {
    if (!c.isSprite || !c.userData.isLabel || sample) return;
    c.updateWorldMatrix(true, false);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    c.matrixWorld.decompose(pos, quat, scl);
    sample = {
      AR_LABEL_LINE_M,
      labelSizeMul,
      modelScale,
      targetWorldH: AR_LABEL_LINE_M * labelSizeMul,
      matrixWorldSy: Math.abs(scl.y),
      matrixWorldSx: Math.abs(scl.x),
      localSy: c.scale.y,
      parentSy: parentWorldScaleY(c),
      sizeAttenuation: c.material.sizeAttenuation,
      canvasW: c.userData.canvasW,
      canvasH: c.userData.canvasH,
    };
  });
  mode = prevMode;
  labelSizeMul = prevMul;
  modelScale = prevScale;
  applyModelScale();
  updateLabelSprites(labelsRoot);
  return sample;
};

/** Headless: Sun world position must stay fixed across scales + spin. */
globalThis.__measureSunPivot = () => {
  applyPivot();
  const prevMode = mode;
  mode = 'ar';
  const sunObj = sunGroup;
  const results = [];
  for (const s of [0.2, 1, 20]) {
    for (const ang of [0, 1.1, 2.7]) {
      modelScale = s;
      applyModelScale();
      spinRoot.rotation.y = ang;
      floorAnchor.updateWorldMatrix(true, true);
      sunObj.updateWorldMatrix(true, false);
      const p = new THREE.Vector3();
      sunObj.getWorldPosition(p);
      results.push({ scale: s, spin: ang, x: p.x, y: p.y, z: p.z });
    }
  }
  // restore
  modelScale = 1; applyModelScale();
  spinRoot.rotation.y = 0;
  mode = prevMode;
  const ref = results.find(r => r.scale === 1 && r.spin === 0) || results[0];
  const maxDelta = Math.max(...results.map(r => Math.hypot(r.x - ref.x, r.y - ref.y, r.z - ref.z)));
  return { ref, results, maxDelta_m: maxDelta, within_1mm: maxDelta < 0.001 };
};

globalThis.__getLabelSizing = () => globalThis.__measureArLabelWorld(labelSizeMul, modelScale);
globalThis.__zoomDiag = () => {
  applyZoomCompensate();
  return {
    worldZoom: getWorldZoomScale(),
    screenMarkerCount: screenMarkers.length,
    matCount: starPointMats.length,
    uWorldScale: starPointMats[0]?.uniforms?.uWorldScale?.value ?? null,
    sunFbPx: screenMarkerFbPx(sunGroup),
    markerSizeMul,
    trackedLabels: trackedLabels.length,
    modelScale,
    camOrbitDist,
    mode,
  };
};

/**
 * Confirm Sun marker stays constant screen size across modelScale and camera distance.
 * Uses the shader's gl_PointSize (uPixelSize×uPixelRatio) — the true drawn size for
 * size-attenuation-free points, including under WebXR's projection matrix.
 */
globalThis.__measureMarkerPixels = () => {
  const prevMode = mode;
  const prevScale = modelScale;
  const prevSpin = spinRoot.rotation.y;
  const prevCam = {
    pos: camera.position.clone(),
    quat: camera.quaternion.clone(),
    near: camera.near,
    far: camera.far,
  };
  mode = 'ar';
  spinRoot.rotation.y = 0;
  applyPivot();
  placeFallbackDefault();
  floorAnchor.visible = true;

  const samples = [];
  for (const s of [1, 5, 20]) {
    for (const dist of [0.1, 1.0]) {
      modelScale = s;
      applyModelScale();
      // Place camera along +Z looking at the anchored Sun (floatRoot origin ≈ Sun)
      const anchor = new THREE.Vector3();
      floorAnchor.getWorldPosition(anchor);
      anchor.y += heightAboveFloor;
      camera.position.set(anchor.x, anchor.y, anchor.z + dist);
      camera.lookAt(anchor);
      camera.updateMatrixWorld(true);
      floorAnchor.updateWorldMatrix(true, true);
      applyZoomCompensate();

      const fbPx = screenMarkerFbPx(sunGroup);
      // Also project Sun world → NDC → CSS pixels (extent of a 0-radius point is the gl_PointSize)
      sunGroup.updateWorldMatrix(true, false);
      const wp = new THREE.Vector3();
      sunGroup.getWorldPosition(wp);
      const ndc = wp.clone().project(camera);
      const halfW = renderer.domElement.clientWidth / 2;
      const halfH = renderer.domElement.clientHeight / 2;
      samples.push({
        modelScale: s,
        camDist_m: dist,
        glPointSize_fbPx: fbPx,
        glPointSize_cssPx: fbPx / Math.min(renderer.getPixelRatio(), 2),
        ndc: { x: ndc.x, y: ndc.y, z: ndc.z },
        screenPx: { x: ndc.x * halfW + halfW, y: -ndc.y * halfH + halfH },
      });
    }
  }

  // restore
  mode = prevMode;
  modelScale = prevScale;
  applyModelScale();
  spinRoot.rotation.y = prevSpin;
  camera.position.copy(prevCam.pos);
  camera.quaternion.copy(prevCam.quat);
  camera.near = prevCam.near;
  camera.far = prevCam.far;
  camera.updateProjectionMatrix();

  const sizes = samples.map((s) => s.glPointSize_fbPx);
  const minS = Math.min(...sizes);
  const maxS = Math.max(...sizes);
  return {
    sunCssPx: SUN_MARKER_PX,
    sibCssPx: SIB_MARKER_PX,
    markerSizeMul,
    samples,
    minFbPx: minS,
    maxFbPx: maxS,
    constant: Math.abs(maxS - minS) < 1e-6,
  };
};

/** Screen-space px distance between Sun marker and its label across modelScales. */
globalThis.__measureLabelFollow = () => {
  const prevMode = mode;
  const prevScale = modelScale;
  const prevSpin = spinRoot.rotation.y;
  mode = 'ar';
  placeFallbackDefault();
  floorAnchor.visible = true;
  applyPivot();
  const samples = [];
  for (const s of [1, 5, 20]) {
    for (const ang of [0, 1.2]) {
      modelScale = s;
      applyModelScale();
      spinRoot.rotation.y = ang;
      // Camera looking at anchored Sun
      const anchor = new THREE.Vector3();
      floorAnchor.updateWorldMatrix(true, true);
      floorAnchor.getWorldPosition(anchor);
      anchor.y += heightAboveFloor;
      camera.position.set(anchor.x, anchor.y + 0.15, anchor.z + 0.8);
      camera.lookAt(anchor);
      camera.updateMatrixWorld(true);
      applyZoomCompensate();
      syncTrackedLabels();
      updateLabelSprites(labelsRoot);

      sunGroup.updateWorldMatrix(true, false);
      sunLabel.updateWorldMatrix(true, false);
      const mp = new THREE.Vector3(); const lp = new THREE.Vector3();
      sunGroup.getWorldPosition(mp);
      sunLabel.getWorldPosition(lp);
      const mN = mp.clone().project(camera);
      const lN = lp.clone().project(camera);
      const w = renderer.domElement.clientWidth;
      const h = renderer.domElement.clientHeight;
      const mSx = (mN.x * 0.5 + 0.5) * w;
      const mSy = (-mN.y * 0.5 + 0.5) * h;
      const lSx = (lN.x * 0.5 + 0.5) * w;
      const lSy = (-lN.y * 0.5 + 0.5) * h;
      const dx = lSx - mSx;
      const dy = lSy - mSy;
      samples.push({
        modelScale: s, spin: ang,
        screenDistPx: Math.hypot(dx, dy),
        dx, dy,
        worldDist: mp.distanceTo(lp),
      });
    }
  }
  mode = prevMode;
  modelScale = prevScale;
  applyModelScale();
  spinRoot.rotation.y = prevSpin;
  const dists = samples.map((x) => x.screenDistPx);
  const mean = dists.reduce((a, b) => a + b, 0) / dists.length;
  const maxDev = Math.max(...dists.map((d) => Math.abs(d - mean)));
  return { samples, meanScreenDistPx: mean, maxDevPx: maxDev, constant: maxDev < 1.5 };
};


function setViewMode(mode) {
  viewMode = mode;
  const local = mode === 'local';
  galaxyRoot.visible = !local;
  localRoot.visible = local;
  btnLocal.classList.toggle('on', local);
  btnLocal.textContent = local ? 'Galaxy view' : 'Local view';
  if (local) {
    setStatus('Solar neighbourhood · siblings to scale', '1 kpc = 2 m here · lines from the Sun to each candidate.');
  } else {
    setStatus(`Milky Way · ${starCount.toLocaleString()} stars · siblings & birth radius`, 'Local view zooms to the Sun’s neighbourhood.');
  }
}

// ——— Placement / AR / fallback (unchanged structure, height-aware) ———
function placeGalaxyInFront(viewerPos, viewerQuat) {
  const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(viewerQuat);
  forward.y = 0;
  if (forward.lengthSq() < 1e-6) forward.set(0, 0, -1);
  forward.normalize();
  const pos = viewerPos.clone().addScaledVector(forward, PLACE_DISTANCE_M);
  pos.y = 0; // floor
  floorAnchor.position.copy(pos);
  floorAnchor.rotation.set(0, 0, 0);
  floorAnchor.visible = true;
  applyHeight();
}

function placeFallbackDefault() {
  floorAnchor.position.set(0, 0, -PLACE_DISTANCE_M);
  floorAnchor.rotation.set(0, 0, 0);
  floorAnchor.visible = true;
  applyHeight();
  camera.position.set(0, 1.35, 0);
  const lookY = heightAboveFloor + 0.05;
  camera.lookAt(0, lookY, -PLACE_DISTANCE_M);
}

let mode = 'fallback';
let orientEnabled = false;
let deviceAlpha = 0, deviceBeta = 0, deviceGamma = 0;
let orientBase = null;
let touchDragging = false, touchLastX = 0, touchLastY = 0;
let manualYaw = 0, manualPitch = -0.35;
let camOrbitDist = 1.55; // fallback pinch zoom (camera distance)
let modelScale = 1;      // AR pinch zoom (anchored model scale)
const MODEL_SCALE_MIN = 0.2;
const MODEL_SCALE_MAX = 20;
const CAM_DIST_MIN = 0.25;
const CAM_DIST_MAX = 8;
const activePointers = new Map(); // id -> {x,y}
let pinching = false;
let pinchStartDist = 0;
let pinchStartCamDist = 1.55;
let pinchStartModelScale = 1;

function applyModelScale() {
  scaleRoot.scale.setScalar(modelScale);
}
applyModelScale();

function pointerDist(a, b) {
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

function onPinchScale(ratio) {
  if (mode === 'ar') {
    modelScale = THREE.MathUtils.clamp(pinchStartModelScale * ratio, MODEL_SCALE_MIN, MODEL_SCALE_MAX);
    applyModelScale();
  } else {
    camOrbitDist = THREE.MathUtils.clamp(pinchStartCamDist / ratio, CAM_DIST_MIN, CAM_DIST_MAX);
  }
}

const needsOrientPermission =
  typeof DeviceOrientationEvent !== 'undefined' &&
  typeof DeviceOrientationEvent.requestPermission === 'function';

function onDeviceOrientation(e) {
  if (e.alpha == null || e.beta == null || e.gamma == null) return;
  deviceAlpha = e.alpha; deviceBeta = e.beta; deviceGamma = e.gamma;
  if (!orientBase) orientBase = { alpha: e.alpha, beta: e.beta, gamma: e.gamma };
  orientEnabled = true;
}

function enableOrientation() {
  return new Promise(async (resolve) => {
    if (needsOrientPermission) {
      try {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res !== 'granted') { resolve(false); return; }
      } catch { resolve(false); return; }
    }
    orientBase = null;
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    resolve(true);
  });
}

const _euler = new THREE.Euler();
const _q = new THREE.Quaternion();
const _zee = new THREE.Vector3(0, 0, 1);
const _q0 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const _qScreen = new THREE.Quaternion();

function updateFallbackCamera() {
  if (mode !== 'fallback') return;
  const target = floorAnchor.position.clone();
  target.y += heightAboveFloor;

  if (orientEnabled && orientBase) {
    const alpha = THREE.MathUtils.degToRad(deviceAlpha - orientBase.alpha);
    const beta = THREE.MathUtils.degToRad(deviceBeta);
    const gamma = THREE.MathUtils.degToRad(deviceGamma);
    const orientAngle = (typeof window.orientation === 'number'
      ? window.orientation : (screen.orientation?.angle || 0));
    _qScreen.setFromAxisAngle(_zee, -THREE.MathUtils.degToRad(orientAngle));
    _euler.set(beta, alpha, -gamma, 'YXZ');
    _q.setFromEuler(_euler); _q.multiply(_q0); _q.multiply(_qScreen);
    const eyeDist = THREE.MathUtils.clamp(camOrbitDist, CAM_DIST_MIN, CAM_DIST_MAX);
    const eyeLocal = new THREE.Vector3(0, 1.35 - heightAboveFloor, eyeDist);
    eyeLocal.applyQuaternion(_q);
    camera.position.copy(target).add(eyeLocal);
    camera.quaternion.copy(_q);
  } else {
    const base = viewMode === 'local' ? 1.1 : 1.55;
    // camOrbitDist is absolute distance; keep relative feel when switching local/galaxy by scaling base
    const r = THREE.MathUtils.clamp(camOrbitDist * (base / 1.55), CAM_DIST_MIN, CAM_DIST_MAX);
    const yaw = manualYaw;
    const pitch = THREE.MathUtils.clamp(manualPitch, -1.2, 0.35);
    const x = Math.sin(yaw) * Math.cos(pitch) * r;
    const y = 0.35 - Math.sin(pitch) * r * 0.5;
    const z = Math.cos(yaw) * Math.cos(pitch) * r;
    camera.position.set(target.x + x, Math.max(0.12, target.y + y), target.z + z);
    camera.lookAt(target.x, target.y + 0.02, target.z);
  }
}

function endPointer(id) {
  activePointers.delete(id);
  if (activePointers.size < 2) {
    pinching = false;
    pinchStartDist = 0;
  }
  if (activePointers.size === 0) touchDragging = false;
  else if (activePointers.size === 1) {
    const only = activePointers.values().next().value;
    touchDragging = mode === 'fallback';
    touchLastX = only.x; touchLastY = only.y;
  }
}

function onPointerDown(e) {
  // Ignore UI controls
  if (e.target.closest && e.target.closest('#ui, #info, #permOverlay, button, input, label, a')) return;
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  try { (e.target === canvas ? canvas : document.body).setPointerCapture?.(e.pointerId); } catch (_) {}

  if (activePointers.size === 2) {
    touchDragging = false;
    pinching = true;
    const pts = [...activePointers.values()];
    pinchStartDist = Math.max(1, pointerDist(pts[0], pts[1]));
    pinchStartCamDist = camOrbitDist;
    pinchStartModelScale = modelScale;
  } else if (activePointers.size === 1 && mode === 'fallback') {
    touchDragging = true;
    touchLastX = e.clientX; touchLastY = e.clientY;
  }
}

function onPointerMove(e) {
  if (!activePointers.has(e.pointerId)) return;
  activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

  if (pinching && activePointers.size >= 2) {
    const pts = [...activePointers.values()];
    const dist = Math.max(1, pointerDist(pts[0], pts[1]));
    onPinchScale(dist / pinchStartDist);
    return;
  }

  if (touchDragging && mode === 'fallback' && activePointers.size === 1) {
    manualYaw -= (e.clientX - touchLastX) * 0.005;
    manualPitch -= (e.clientY - touchLastY) * 0.004;
    touchLastX = e.clientX; touchLastY = e.clientY;
  }
}

function onPointerUp(e) {
  endPointer(e.pointerId);
}

// Canvas + body (dom-overlay in AR) share the same pinch/drag handlers
for (const el of [canvas, document.body]) {
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', onPointerUp);
  el.addEventListener('pointercancel', onPointerUp);
  el.addEventListener('pointerout', (e) => { if (e.pointerType !== 'mouse') endPointer(e.pointerId); });
}

// Block browser pinch-zoom / iOS gesture zoom
['gesturestart', 'gesturechange', 'gestureend'].forEach((type) => {
  document.addEventListener(type, (e) => e.preventDefault(), { passive: false });
});
document.addEventListener('touchmove', (e) => {
  if (e.touches && e.touches.length > 1) e.preventDefault();
}, { passive: false });
// Desktop wheel zoom as bonus for fallback testing
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const factor = Math.exp(-e.deltaY * 0.0015);
  if (mode === 'ar') {
    modelScale = THREE.MathUtils.clamp(modelScale * factor, MODEL_SCALE_MIN, MODEL_SCALE_MAX);
    applyModelScale();
  } else {
    camOrbitDist = THREE.MathUtils.clamp(camOrbitDist / factor, CAM_DIST_MIN, CAM_DIST_MAX);
  }
}, { passive: false });

let xrSession = null, hitTestSource = null, hitTestSourceRequested = false, refSpace = null;
let placed = false, arSupported = false;

const reticle = (() => {
  const g = new THREE.RingGeometry(0.06, 0.08, 32);
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
    color: 0x88aaff, transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false,
  }));
  mesh.visible = false; scene.add(mesh); return mesh;
})();

async function checkAR() {
  if (!navigator.xr) return false;
  try { return await navigator.xr.isSessionSupported('immersive-ar'); } catch { return false; }
}

function onSelectPlace() {
  if (mode !== 'ar') return;
  if (reticle.visible) {
    floorAnchor.position.copy(reticle.position);
    const e = new THREE.Euler().setFromQuaternion(reticle.quaternion, 'YXZ');
    floorAnchor.rotation.set(0, e.y, 0);
    floorAnchor.visible = true;
    placed = true; reticle.visible = false;
    applyHeight();
    setStatus(`Placed · ${pivotMode === 'sun' ? 'Sun' : 'galactic centre'} at anchor`, `Height ${heightAboveFloor.toFixed(2)} m · Arms / Centre toggles available.`);
  } else {
    const cam = renderer.xr.getCamera();
    const pos = new THREE.Vector3(), quat = new THREE.Quaternion();
    cam.getWorldPosition(pos); cam.getWorldQuaternion(quat);
    placeGalaxyInFront(pos, quat);
    placed = true;
    setStatus(`Placed (~0.5 m) · ${pivotMode === 'sun' ? 'Sun' : 'centre'} anchored`, `Height ${heightAboveFloor.toFixed(2)} m.`);
  }
}

async function startAR() {
  if (!navigator.xr) { setStatus('WebXR not available', 'Using motion / touch fallback.'); return; }
  let session = null;
  try {
    session = await navigator.xr.requestSession('immersive-ar', {
      requiredFeatures: ['hit-test', 'local-floor'],
      optionalFeatures: ['dom-overlay', 'light-estimation'],
      domOverlay: { root: document.body },
    });
  } catch (_) {
    try {
      session = await navigator.xr.requestSession('immersive-ar', {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: document.body },
      });
    } catch (err2) {
      setStatus('Could not start AR: ' + (err2.message || err2), 'Try Chrome on Android, or motion fallback.');
      return;
    }
  }
  xrSession = session; mode = 'ar'; placed = false;
  hitTestSource = null; hitTestSourceRequested = false;
  renderer.setClearColor(0x000000, 0);
  floorAnchor.visible = false; reticle.visible = false;
  await renderer.xr.setSession(session);
  try { refSpace = await session.requestReferenceSpace('local-floor'); }
  catch (_) { refSpace = await session.requestReferenceSpace('local'); }
  session.addEventListener('end', onSessionEnded);
  session.addEventListener('select', onSelectPlace);
  setStatus('AR active — tap floor to place', `Galaxy will float ${heightAboveFloor.toFixed(2)} m above the floor.`);
  btnAR.textContent = 'Exit AR';
}

function onSessionEnded() {
  xrSession = null; hitTestSource = null; hitTestSourceRequested = false;
  mode = 'fallback'; reticle.visible = false;
  renderer.setClearColor(0x000000, 1);
  placeFallbackDefault();
  btnAR.textContent = arSupported ? 'Start AR' : 'AR unavailable';
  setStatus('AR ended — motion / touch mode', fallbackHint());
}

btnAR.addEventListener('click', () => {
  if (xrSession) xrSession.end();
  else if (arSupported) startAR();
});
btnRecenter.addEventListener('click', () => {
  if (mode === 'ar' && xrSession) {
    placed = false; floorAnchor.visible = false; reticle.visible = true;
    modelScale = 1; applyModelScale();
    setStatus('Point at the floor, then tap', 'Height slider still applies after place.');
  } else {
    orientBase = null; manualYaw = 0; manualPitch = -0.35;
    camOrbitDist = 1.55; modelScale = 1; applyModelScale();
    placeFallbackDefault();
    setStatus('Recentered', fallbackHint());
  }
});
btnLabels.addEventListener('click', () => {
  labelsVisible = !labelsVisible;
  labelsRoot.visible = labelsVisible;
  localLabels.visible = labelsVisible;
  armLabelsRoot.visible = labelsVisible && armsVisible;
  btnLabels.classList.toggle('on', labelsVisible);
});
btnArms.addEventListener('click', () => setArmsVisible(!armsVisible));
btnPivot.addEventListener('click', () => {
  pivotMode = pivotMode === 'sun' ? 'galaxy' : 'sun';
  applyPivot();
  setStatus(
    pivotMode === 'sun' ? 'Anchor: Sun' : 'Anchor: galactic centre',
    'Pinch scale pivots on the placed centre · Recenter to re-place.'
  );
});
btnLocal.addEventListener('click', () => setViewMode(viewMode === 'local' ? 'galaxy' : 'local'));
btnInfo.addEventListener('click', () => {
  infoOpen = !infoOpen;
  infoEl.classList.toggle('show', infoOpen);
  btnInfo.classList.toggle('on', infoOpen);
});
btnOrient.addEventListener('click', () => permOverlay.classList.add('show'));
btnPerm.addEventListener('click', async () => {
  const ok = await enableOrientation();
  permOverlay.classList.remove('show');
  if (ok) {
    btnOrient.classList.add('is-hidden');
    setStatus('Motion enabled', `Galaxy floats ${heightAboveFloor.toFixed(2)} m above the floor plane.`);
  } else setStatus('Motion permission denied', 'You can still drag to orbit.');
});

function fallbackHint() {
  if (needsOrientPermission && !orientEnabled) return 'Enable motion, drag to orbit, or open Local view for siblings.';
  if (orientEnabled) return 'Turn the phone · pinch to zoom · height slider lifts the model.';
  return 'Drag to orbit · pinch to zoom · Local view for siblings.';
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight, false);
});

const clock = new THREE.Clock();
renderer.setAnimationLoop((time, frame) => {
  const t = clock.getElapsedTime();
  spinRoot.rotation.y = t * 0.012; // slow spin around current pivot
  if (bulgeSpr) bulgeSpr.material.opacity = 0.45 + 0.12 * Math.sin(t * 0.7);
  applyZoomCompensate();
  syncTrackedLabels();

  const labelParents = [];
  if (labelsVisible && galaxyRoot.visible) labelParents.push(labelsRoot);
  if (labelsVisible && localRoot.visible) labelParents.push(localLabels);
  for (const root of labelParents) updateLabelSprites(root);

  if (mode === 'ar' && frame && xrSession) {
    if (!hitTestSourceRequested) {
      hitTestSourceRequested = true;
      xrSession.requestReferenceSpace('viewer').then((viewerRef) =>
        xrSession.requestHitTestSource({ space: viewerRef })
      ).then((source) => { hitTestSource = source; }).catch(() => { hitTestSource = null; });
    }
    if (hitTestSource && refSpace && !placed) {
      const hits = frame.getHitTestResults(hitTestSource);
      if (hits.length) {
        const hitPose = hits[0].getPose(refSpace);
        if (hitPose) {
          reticle.visible = true;
          reticle.position.set(hitPose.transform.position.x, hitPose.transform.position.y, hitPose.transform.position.z);
          reticle.quaternion.set(
            hitPose.transform.orientation.x, hitPose.transform.orientation.y,
            hitPose.transform.orientation.z, hitPose.transform.orientation.w
          );
        }
      } else reticle.visible = false;
    }
  } else if (mode === 'fallback') {
    updateFallbackCamera();
  }

  renderer.render(scene, camera);
});

placeFallbackDefault();

(async function boot() {
  arSupported = await checkAR();
  btnAR.disabled = !arSupported;
  btnAR.textContent = arSupported ? 'Start AR' : 'AR unavailable';
  if (needsOrientPermission) btnOrient.classList.remove('is-hidden');
  else if (typeof DeviceOrientationEvent !== 'undefined') {
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
  }
  setStatus(
    `Milky Way · ${starCount.toLocaleString()} stars · siblings & birth ~5 kpc`,
    arSupported
      ? `Start AR · floats ${DEFAULT_HEIGHT_M} m above floor · Local view for siblings.`
      : fallbackHint()
  );
})();
