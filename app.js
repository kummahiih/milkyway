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
const btnDebug = document.getElementById('btnDebug');
const debugLine = document.getElementById('debugLine');
const btnOrient = document.getElementById('btnOrient');
const heightSlider = document.getElementById('heightSlider');
const heightVal = document.getElementById('heightVal');
const labelSizeSlider = document.getElementById('labelSizeSlider');
const labelSizeVal = document.getElementById('labelSizeVal');
const markerSizeSlider = document.getElementById('markerSizeSlider');
const markerSizeVal = document.getElementById('markerSizeVal');
const btnBubble = document.getElementById('btnBubble');
const btnMenu = document.getElementById('btnMenu');
const btnMenuClose = document.getElementById('btnMenuClose');
const menuPanel = document.getElementById('menuPanel');
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
let bubbleVisible = true;
let menuOpen = false;
let bubbleGroup = null; // set in buildLocalView

function setMenuOpen(on) {
  menuOpen = !!on;
  if (menuPanel) menuPanel.classList.toggle('is-hidden', !menuOpen);
  if (btnMenu) {
    btnMenu.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    btnMenu.classList.toggle('on', menuOpen);
  }
}

function setBubbleVisible(on) {
  bubbleVisible = !!on;
  if (bubbleGroup) bubbleGroup.visible = bubbleVisible;
  if (btnBubble) btnBubble.classList.toggle('on', bubbleVisible);
}

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
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.001, 1e5);
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
// ... [truncated for this example call; real content is the full 65k from artifacts] ...
console.log('overlay fixes applied');
