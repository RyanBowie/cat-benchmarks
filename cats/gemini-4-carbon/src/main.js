import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

import { COAT_PRESETS } from './shaders/furShader.js';
import { EYE_PRESETS } from './shaders/eyeShader.js';
import { createRealisticCat } from './cat/CatAnatomy.js';
import { CatAnimator } from './cat/CatAnimator.js';
import { LIGHTING_PRESETS, createSceneEnvironment } from './world/SceneEnvironment.js';
import { CatAudioEngine } from './audio/CatAudio.js';

// =============================================================================
// 1. RENDERER, SCENE, CAMERA & ORBIT CONTROLS
// =============================================================================
const container = document.getElementById('canvas-container');

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.06;
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  38,
  window.innerWidth / window.innerHeight,
  0.04,
  35
);
camera.position.set(1.08, 0.88, 1.56);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.065;
controls.minDistance = 0.34;
controls.maxDistance = 4.6;
controls.maxPolarAngle = Math.PI * 0.495;
controls.target.set(0, 0.46, 0.10);
controls.update();

// Smooth camera framing tween state
let camTween = null;

function computeCameraPreset(presetName, followCat = true) {
  cat.catGroup.updateMatrixWorld(true);
  const cx = followCat ? animator.worldPos.x : 0;
  const cz = followCat ? animator.worldPos.z : 0;
  const yaw = followCat ? animator.heading : 0;

  // Cat local +Z is forward, +X is cat's left (viewer's right when facing cat)
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  const side = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));

  const headWorld = new THREE.Vector3();
  cat.bones.head.getWorldPosition(headWorld);

  const placeBodyCam = (sideDist, upY, fwdDist, targetY, targetFwd) => ({
    pos: new THREE.Vector3(cx, upY, cz).addScaledVector(side, sideDist).addScaledVector(fwd, fwdDist),
    target: new THREE.Vector3(cx, targetY, cz).addScaledVector(fwd, targetFwd)
  });

  const placeHeadCam = (sideDist, upOffset, fwdDist, targetUp, targetFwd) => ({
    pos: headWorld.clone()
      .add(new THREE.Vector3(0, upOffset, 0))
      .addScaledVector(side, sideDist)
      .addScaledVector(fwd, fwdDist),
    target: headWorld.clone()
      .add(new THREE.Vector3(0, targetUp, 0))
      .addScaledVector(fwd, targetFwd)
  });

  const presets = {
    studio: placeBodyCam(1.05, 0.86, 1.54, 0.44, 0.08),
    portrait: placeHeadCam(0.26, 0.06, 0.62, 0.01, 0.14),
    eyes: placeHeadCam(0.06, 0.038, 0.38, 0.032, 0.15),
    profile: placeBodyCam(1.62, 0.54, 0.04, 0.44, 0.02),
    beans: placeBodyCam(0.48, 0.13, 0.92, 0.18, 0.14)
  };

  return presets[presetName] || presets.studio;
}

function setCameraPreset(presetName, followCat = true) {
  const chosen = computeCameraPreset(presetName, followCat);
  camTween = {
    presetName,
    followCat,
    pos: chosen.pos,
    target: chosen.target,
    timeLeft: 0.95
  };
}

// =============================================================================
// 2. INSTANTIATE ENVIRONMENT, AUDIO, REALISTIC CAT & ANIMATOR
// =============================================================================
const audio = new CatAudioEngine();
const world = createSceneEnvironment(scene, renderer);
const cat = createRealisticCat();
scene.add(cat.catGroup);

const animator = new CatAnimator(cat, {
  onMeow: (dur) => audio.playMeow(dur),
  onTrill: () => audio.playTrill(),
  onPurrChange: (lvl) => audio.setPurrIntensity(lvl),
  onStep: (w) => audio.playSoftStep(w),
  onBellJingle: (intensity) => audio.playBellJingle(intensity),
  onEatTreat: (treatObj) => {
    audio.playTreatCrunch();
    world.removeTreat(treatObj);
  },
  onBatToy: (yarnObj, pushDir) => {
    audio.playSoftStep(0.6);
    world.impulseYarnBall(pushDir, 1.45);
  }
});

world.applyLightingPreset('sunlit', cat, animator);

// =============================================================================
// 3. RAYCASTING & TACTILE PETTING / LASER / FLOOR INTERACTION
// =============================================================================
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
let activeTool = 'pet'; // 'pet' | 'laser'
let isPointerDown = false;
let isDraggingCat = false;
let downScreenPos = { x: 0, y: 0 };
let downHitPart = null;

function updatePointerNDC(event) {
  const rect = renderer.domElement.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function intersectCat() {
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObjects(cat.interactiveMeshes, false);
  return hits.length > 0 ? hits[0] : null;
}

function intersectFloor() {
  raycaster.setFromCamera(pointerNDC, camera);
  const hits = raycaster.intersectObject(world.hitPlane, false);
  return hits.length > 0 ? hits[0].point : null;
}

renderer.domElement.addEventListener('pointerdown', (e) => {
  audio.unlock();
  camTween = null;
  updatePointerNDC(e);
  isPointerDown = true;
  downScreenPos = { x: e.clientX, y: e.clientY };

  if (activeTool === 'pet' && e.button === 0) {
    const catHit = intersectCat();
    if (catHit) {
      isDraggingCat = true;
      downHitPart = catHit.object.userData.partName;
      controls.enabled = false;
      animator.beginOrMovePetting(catHit.point, downHitPart, 1 / 60);
    }
  }
});

window.addEventListener('pointermove', (e) => {
  updatePointerNDC(e);

  if (activeTool === 'laser') {
    const floorPt = intersectFloor();
    if (floorPt) {
      const clamped = floorPt.clone();
      if (clamped.length() > 1.80) clamped.setLength(1.80);
      world.laserGroup.visible = true;
      world.laserGroup.position.set(clamped.x, 0, clamped.z);
      animator.setLaserPointer(true, clamped);
    }
    return;
  }

  if (isDraggingCat) {
    const catHit = intersectCat();
    if (catHit) {
      renderer.domElement.style.cursor = 'grabbing';
      animator.beginOrMovePetting(catHit.point, catHit.object.userData.partName, 1 / 60);
    } else {
      animator.endPetting();
    }
    return;
  }

  // Hover cursor & subtle gaze curiosity toward pointer in 3D space
  if (!isPointerDown) {
    const catHit = intersectCat();
    renderer.domElement.style.cursor = catHit ? 'grab' : 'default';

    const floorPt = intersectFloor();
    if (floorPt && floorPt.length() < 2.6) {
      animator.setGazeTarget(new THREE.Vector3(floorPt.x, 0.48, floorPt.z), true);
    } else {
      animator.setGazeTarget(null, false);
    }
  }
});

window.addEventListener('pointerup', (e) => {
  const moveDist = Math.hypot(e.clientX - downScreenPos.x, e.clientY - downScreenPos.y);

  if (isDraggingCat) {
    if (moveDist < 7 && downHitPart === 'nose') {
      animator.boopNose();
    }
    isDraggingCat = false;
    downHitPart = null;
    animator.endPetting();
    controls.enabled = true;
    renderer.domElement.style.cursor = 'grab';
  } else if (isPointerDown && moveDist < 6 && activeTool === 'pet' && e.target === renderer.domElement) {
    // Short click on rug/floor -> invite cat to walk over!
    updatePointerNDC(e);
    const floorPt = intersectFloor();
    if (floorPt && floorPt.length() <= 1.85) {
      world.showWalkRipple(floorPt);
      animator.walkTo(floorPt, 'walk', 'idle');
      syncPoseButtons('walk_roam');
    }
  }

  isPointerDown = false;
});

// =============================================================================
// 4. WIRE UP STUDIO UI CONTROLS
// =============================================================================
const moodStatusEl = document.getElementById('mood-status');
const purrBarFillEl = document.getElementById('purr-bar-fill');
const purrDotEl = document.getElementById('purr-dot');
const hintLineEl = document.getElementById('interaction-hint');

// Coat Genetics Buttons
const coatGrid = document.getElementById('coat-grid');
function syncCoatButtons(activeId) {
  coatGrid.querySelectorAll('.coat-btn').forEach((b, idx) => {
    b.classList.toggle('active', idx === activeId);
  });
}
COAT_PRESETS.forEach((preset, idx) => {
  const btn = document.createElement('button');
  btn.className = `coat-btn${idx === 0 ? ' active' : ''}`;
  btn.textContent = preset.name;
  btn.title = preset.subtitle;
  btn.addEventListener('click', () => {
    audio.unlock();
    const applied = cat.setCoatPreset(preset.id, true);
    syncCoatButtons(applied.id);
    syncEyeButtons(cat.getEyePresetKey());
  });
  coatGrid.appendChild(btn);
});

// Eye Color Chips
const eyeGrid = document.getElementById('eye-grid');
function syncEyeButtons(activeKey) {
  eyeGrid.querySelectorAll('.chip').forEach((c) => {
    c.classList.toggle('active', c.dataset.eye === activeKey);
  });
}
Object.entries(EYE_PRESETS).forEach(([key, preset]) => {
  const btn = document.createElement('button');
  btn.className = `chip${key === 'emerald' ? ' active' : ''}`;
  btn.dataset.eye = key;
  btn.textContent = preset.name.replace(' Green', '').replace('Siamese ', '');
  btn.addEventListener('click', () => {
    cat.setEyePreset(key);
    syncEyeButtons(key);
  });
  eyeGrid.appendChild(btn);
});

// Lighting Mood Chips
const lightingGrid = document.getElementById('lighting-grid');
Object.entries(LIGHTING_PRESETS).forEach(([key, preset], idx) => {
  const btn = document.createElement('button');
  btn.className = `chip${idx === 0 ? ' active' : ''}`;
  btn.dataset.light = key;
  btn.textContent = preset.name;
  btn.addEventListener('click', () => {
    world.applyLightingPreset(key, cat, animator);
    lightingGrid.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
  });
  lightingGrid.appendChild(btn);
});

// Sliders & Collar Toggle
document.getElementById('slider-fur').addEventListener('input', (e) => {
  cat.setFurPlushness(parseFloat(e.target.value));
});

const pupilLabel = document.getElementById('pupil-mode-label');
document.getElementById('slider-pupil').addEventListener('input', (e) => {
  const val = parseFloat(e.target.value);
  if (val <= 0.04) {
    animator.manualPupilOverride = null;
    pupilLabel.textContent = 'Auto';
  } else {
    animator.manualPupilOverride = val;
    pupilLabel.textContent = `${Math.round((val / 0.82) * 100)}%`;
  }
});

document.getElementById('chk-collar').addEventListener('change', (e) => {
  cat.setCollarVisible(e.target.checked);
});

// Camera Preset Buttons
const cameraGrid = document.getElementById('camera-grid');
cameraGrid.querySelectorAll('.chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    cameraGrid.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
    setCameraPreset(btn.dataset.cam, true);
  });
});

// Interactive Tool Mode & Toy Buttons
const toolPetBtn = document.getElementById('tool-pet');
const toolLaserBtn = document.getElementById('tool-laser');

function setActiveTool(tool) {
  activeTool = tool;
  toolPetBtn.classList.toggle('active', tool === 'pet');
  toolLaserBtn.classList.toggle('active', tool === 'laser');
  if (tool === 'laser') {
    world.laserGroup.visible = true;
    animator.setLaserPointer(true, world.laserGroup.position);
    hintLineEl.textContent = 'Move cursor across the rug — watch pupils dilate, butt-wiggle & pounce!';
  } else {
    world.laserGroup.visible = false;
    animator.setLaserPointer(false);
    hintLineEl.textContent = 'Drag on cat to pet chin, head & back • Click nose to boop • Click rug to call over • Drag outside to orbit';
  }
}

toolPetBtn.addEventListener('click', () => setActiveTool('pet'));
toolLaserBtn.addEventListener('click', () => setActiveTool(activeTool === 'laser' ? 'pet' : 'laser'));

document.getElementById('btn-yarn').addEventListener('click', () => {
  audio.unlock();
  if (activeTool === 'laser') setActiveTool('pet');
  const yarn = world.tossYarnBall();
  animator.notifyYarnSpawned(yarn);
});

document.getElementById('btn-treat').addEventListener('click', () => {
  audio.unlock();
  if (activeTool === 'laser') setActiveTool('pet');
  const treat = world.spawnTreat();
  animator.notifyTreatSpawned(treat);
});

document.getElementById('btn-meow').addEventListener('click', () => {
  audio.unlock();
  animator.triggerMeow();
});

// Pose / Behavior Chips
const poseRow = document.getElementById('pose-row');
function syncPoseButtons(poseKey) {
  poseRow.querySelectorAll('.pose-chip').forEach((b) => {
    b.classList.toggle('active', b.dataset.pose === poseKey);
  });
}
poseRow.querySelectorAll('.pose-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    audio.unlock();
    if (activeTool === 'laser') setActiveTool('pet');
    const pose = btn.dataset.pose;
    animator.setBehavior(pose, true);
    syncPoseButtons(pose);
  });
});

// Top-right Audio Mute & Drawer Toggle
const btnAudio = document.getElementById('btn-audio');
btnAudio.addEventListener('click', () => {
  audio.unlock();
  audio.setMuted(!audio.muted);
  btnAudio.textContent = audio.muted ? '🔇 Muted' : '🔊 Sound On';
});

const studioDrawer = document.getElementById('studio-drawer');
document.getElementById('btn-toggle-panel').addEventListener('click', () => {
  studioDrawer.classList.toggle('collapsed');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// =============================================================================
// 5. MAIN ANIMATION LOOP
// =============================================================================
const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const dt = clock.getDelta();
  const elapsed = clock.elapsedTime;

  animator.update(dt);
  world.update(dt, elapsed);

  // Smooth camera preset tweening (tracks moving cat live during glide)
  if (camTween) {
    const fresh = computeCameraPreset(camTween.presetName, camTween.followCat);
    const step = 1 - Math.exp(-7.5 * dt);
    camera.position.lerp(fresh.pos, step);
    controls.target.lerp(fresh.target, step);
    camTween.timeLeft -= dt;
    if (camTween.timeLeft <= 0) {
      camTween = null;
    }
  }

  controls.update();
  renderer.render(scene, camera);

  // Update HUD mood, live pose chip & purr indicator smoothly
  moodStatusEl.textContent = animator.getMoodStatus();
  const mappedPose = animator.state === 'walk' ? 'walk_roam' : animator.state;
  syncPoseButtons(mappedPose);
  const purrPct = Math.round(8 + animator.purrLevel * 92);
  purrBarFillEl.style.width = `${purrPct}%`;
  const pulse = animator.purrLevel > 0.1 ? 1 + Math.sin(elapsed * 26 * Math.PI * 2) * 0.25 * animator.purrLevel : 1;
  purrDotEl.style.transform = `scale(${pulse.toFixed(2)})`;
}

animate();

// Expose clean inspection API for testing & camera framing
window.__catStudio = {
  scene,
  camera,
  controls,
  renderer,
  cat,
  animator,
  world,
  setCameraPreset,
  setCoatPreset: (idOrKey) => {
    const applied = cat.setCoatPreset(idOrKey, true);
    syncCoatButtons(applied.id);
    syncEyeButtons(cat.getEyePresetKey());
  },
  setBehavior: (b) => {
    animator.setBehavior(b, true);
    syncPoseButtons(b);
  }
};
