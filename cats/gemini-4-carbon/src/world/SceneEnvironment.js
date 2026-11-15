import * as THREE from 'three';

export const LIGHTING_PRESETS = {
  sunlit: {
    name: 'Sunlit Room',
    bgTop: '#3e352d',
    bgBottom: '#231d19',
    wallTop: 0xdfd4c6,
    wallHorizon: 0x9b8875,
    windowGlow: 0xfff0d4,
    fogColor: 0x8e7c6a,
    sunColor: 0xfff1dc,
    sunIntensity: 2.85,
    sunPos: [3.2, 4.4, 2.8],
    fillColor: 0xadc8ff,
    fillIntensity: 0.85,
    rimColor: 0xffd7a8,
    rimIntensity: 1.05,
    hemiSky: 0xdbe8ff,
    hemiGround: 0x7a5940,
    hemiIntensity: 0.78,
    ambientBrightness: 0.78,
    eyeEnvBrightness: 1.05,
    motesOpacity: 0.42
  },
  golden: {
    name: 'Golden Hour',
    bgTop: '#3d261c',
    bgBottom: '#1c120e',
    wallTop: 0xc9936b,
    wallHorizon: 0x784d36,
    windowGlow: 0xffb36b,
    fogColor: 0x6e4631,
    sunColor: 0xffb66b,
    sunIntensity: 3.15,
    sunPos: [4.2, 2.1, 1.8],
    fillColor: 0x8ea6d6,
    fillIntensity: 0.65,
    rimColor: 0xff9d4d,
    rimIntensity: 1.45,
    hemiSky: 0xffcfa3,
    hemiGround: 0x5c3824,
    hemiIntensity: 0.68,
    ambientBrightness: 0.56,
    eyeEnvBrightness: 0.98,
    motesOpacity: 0.55
  },
  studio: {
    name: 'Studio Portrait',
    bgTop: '#2b303a',
    bgBottom: '#161920',
    wallTop: 0x4a5262,
    wallHorizon: 0x2c313b,
    windowGlow: 0x8ca2c4,
    fogColor: 0x2c313b,
    sunColor: 0xffffff,
    sunIntensity: 2.55,
    sunPos: [2.4, 3.8, 3.4],
    fillColor: 0xc9dcff,
    fillIntensity: 1.10,
    rimColor: 0xddeaff,
    rimIntensity: 1.25,
    hemiSky: 0xeaf1ff,
    hemiGround: 0x454852,
    hemiIntensity: 0.85,
    ambientBrightness: 0.85,
    eyeEnvBrightness: 1.12,
    motesOpacity: 0.12
  },
  moonlight: {
    name: 'Cozy Moonlight',
    bgTop: '#10182b',
    bgBottom: '#090d17',
    wallTop: 0x1e2c4a,
    wallHorizon: 0x141b2e,
    windowGlow: 0x6d98e6,
    fogColor: 0x141b2e,
    sunColor: 0x8cb8ff,
    sunIntensity: 1.55,
    sunPos: [-2.8, 4.0, 2.5],
    fillColor: 0xffad66,
    fillIntensity: 0.72,
    rimColor: 0x7caeff,
    rimIntensity: 1.15,
    hemiSky: 0x5c82c4,
    hemiGround: 0x2b221e,
    hemiIntensity: 0.52,
    ambientBrightness: 0.14, // Dilates cat's pupils wide into nocturnal saucers!
    eyeEnvBrightness: 0.85,
    motesOpacity: 0.24
  }
};

/**
 * Generates a procedural equirectangular interior-room environment texture
 * with a bright sunlit window pane, soft sky gradient, and warm wood floor bounce
 * for realistic specular reflections on eyes, wet nose, brass bell, and fur.
 */
function createProceduralRoomEnvTexture(renderer) {
  const width = 512;
  const height = 256;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');

  // Base vertical room gradient (ceiling -> walls -> warm oak floor)
  const grad = ctx.createLinearGradient(0, 0, 0, height);
  grad.addColorStop(0.00, '#cfdcf0');
  grad.addColorStop(0.42, '#9aa7ba');
  grad.addColorStop(0.52, '#5c493a');
  grad.addColorStop(1.00, '#2e2016');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Bright sunlit window panes (creates crisp realistic rectangular catchlights in cat eyes!)
  ctx.fillStyle = '#fff9ee';
  ctx.shadowColor = '#ffe8c2';
  ctx.shadowBlur = 24;
  const winX = 310;
  const winY = 44;
  ctx.fillRect(winX, winY, 44, 62);
  ctx.fillRect(winX + 52, winY, 44, 62);
  ctx.fillRect(winX, winY + 70, 44, 52);
  ctx.fillRect(winX + 52, winY + 70, 44, 52);

  // Soft warm lamp fill on opposite side
  ctx.shadowBlur = 36;
  ctx.fillStyle = 'rgba(255, 208, 150, 0.75)';
  ctx.beginPath();
  ctx.arc(110, 96, 28, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;

  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const envRT = pmrem.fromEquirectangular(tex);
  tex.dispose();
  pmrem.dispose();
  return envRT.texture;
}

/**
 * Generates procedural woven bouclé circular rug texture + bump map
 */
function createBoucleRugTextures() {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d');

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d');

  cCtx.fillStyle = '#ddd3c3';
  cCtx.fillRect(0, 0, size, size);
  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;

  // Concentric braided weave rings + subtle organic tweed flecks
  for (let r = 8; r < size * 0.49; r += 3.5) {
    const shade = 212 + Math.sin(r * 0.45) * 10;
    cCtx.strokeStyle = `rgb(${shade}, ${shade - 10}, ${shade - 24})`;
    cCtx.lineWidth = 2.4;
    cCtx.beginPath();
    cCtx.arc(cx, cy, r, 0, Math.PI * 2);
    cCtx.stroke();

    const bVal = 128 + Math.sin(r * 0.9) * 42;
    bCtx.strokeStyle = `rgb(${bVal}, ${bVal}, ${bVal})`;
    bCtx.lineWidth = 2.0;
    bCtx.beginPath();
    bCtx.arc(cx, cy, r, 0, Math.PI * 2);
    bCtx.stroke();
  }

  // Subtle border band
  cCtx.strokeStyle = '#b9aa95';
  cCtx.lineWidth = 14;
  cCtx.beginPath();
  cCtx.arc(cx, cy, size * 0.465, 0, Math.PI * 2);
  cCtx.stroke();

  // Bouclé nubs
  for (let i = 0; i < 9000; i++) {
    const angle = Math.random() * Math.PI * 2;
    const rad = Math.sqrt(Math.random()) * size * 0.485;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    const v = 195 + Math.floor(Math.random() * 42);
    cCtx.fillStyle = `rgba(${v}, ${v - 9}, ${v - 20}, 0.45)`;
    cCtx.fillRect(x, y, 2, 2);

    const bv = 95 + Math.floor(Math.random() * 120);
    bCtx.fillStyle = `rgba(${bv}, ${bv}, ${bv}, 0.5)`;
    bCtx.fillRect(x, y, 2, 2);
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const bumpMap = new THREE.CanvasTexture(bumpCanvas);

  return { map, bumpMap };
}

/**
 * Generates warm hardwood oak plank floor texture
 */
function createHardwoodFloorTexture() {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#4a3525';
  ctx.fillRect(0, 0, size, size);

  const planks = 8;
  const plankW = size / planks;
  for (let p = 0; p < planks; p++) {
    const baseR = 72 + ((p * 17) % 18);
    const baseG = 50 + ((p * 13) % 14);
    const baseB = 34 + ((p * 11) % 10);
    ctx.fillStyle = `rgb(${baseR}, ${baseG}, ${baseB})`;
    ctx.fillRect(p * plankW + 1, 0, plankW - 2, size);

    // Subtle wood grain lines
    for (let g = 0; g < 26; g++) {
      const gx = p * plankW + 3 + Math.random() * (plankW - 6);
      ctx.strokeStyle = `rgba(38, 24, 14, ${0.08 + Math.random() * 0.12})`;
      ctx.lineWidth = 1 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(gx, 0);
      ctx.bezierCurveTo(gx + 4, size * 0.33, gx - 4, size * 0.66, gx, size);
      ctx.stroke();
    }

    // Horizontal plank joint
    const jointY = ((p * 173) % (size - 60)) + 30;
    ctx.fillStyle = 'rgba(24, 15, 9, 0.55)';
    ctx.fillRect(p * plankW, jointY, plankW, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(5, 5);
  return tex;
}

/**
 * Generates a realistic wound-yarn texture for the interactive 3D yarn ball
 */
function createWoundYarnTexture() {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#c94356';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 180; i++) {
    const x0 = Math.random() * size;
    const y0 = Math.random() * size;
    const ang = Math.random() * Math.PI;
    const len = 90 + Math.random() * 140;
    const shade = Math.random();
    ctx.strokeStyle = shade > 0.5
      ? `rgba(235, 98, 116, 0.55)`
      : `rgba(148, 32, 48, 0.55)`;
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len);
    ctx.stroke();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSceneEnvironment(scene, renderer) {
  const envMap = createProceduralRoomEnvTexture(renderer);
  scene.environment = envMap;
  scene.fog = new THREE.FogExp2(0x8e7c6a, 0.055);

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // Soft curved interior room backdrop dome so horizon blends warmly instead of black void
  const backdropUniforms = {
    uWallTop: { value: new THREE.Color(0xdfd4c6) },
    uWallHorizon: { value: new THREE.Color(0x9b8875) },
    uWindowGlow: { value: new THREE.Color(0xfff0d4) },
    uSunDir: { value: new THREE.Vector3(0.55, 0.65, 0.45).normalize() }
  };
  const backdropGeo = new THREE.SphereGeometry(11.5, 48, 32);
  const backdropMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: backdropUniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPos;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uWallTop;
      uniform vec3 uWallHorizon;
      uniform vec3 uWindowGlow;
      uniform vec3 uSunDir;
      varying vec3 vWorldPos;
      void main() {
        vec3 dir = normalize(vWorldPos);
        float elev = clamp(dir.y * 2.2, 0.0, 1.0);
        vec3 col = mix(uWallHorizon, uWallTop, smoothstep(0.0, 0.85, elev));
        // Soft sunlit window bounce patch on upper room wall
        float sunPatch = pow(max(0.0, dot(dir, uSunDir)), 5.0) * smoothstep(0.02, 0.35, dir.y);
        col = mix(col, uWindowGlow, sunPatch * 0.48);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const backdropDome = new THREE.Mesh(backdropGeo, backdropMat);
  worldGroup.add(backdropDome);

  // =========================================================================
  // 1. HARDWOOD FLOOR & PLUSH WOVEN BOUCLÉ RUG
  // =========================================================================
  const woodTex = createHardwoodFloorTexture();
  const floorGeo = new THREE.CircleGeometry(9.0, 64);
  floorGeo.rotateX(-Math.PI / 2);
  const floorMat = new THREE.MeshStandardMaterial({
    map: woodTex,
    roughness: 0.52,
    metalness: 0.04,
    envMapIntensity: 0.45
  });
  const floorMesh = new THREE.Mesh(floorGeo, floorMat);
  floorMesh.receiveShadow = true;
  floorMesh.position.y = -0.004;
  floorMesh.userData.isFloor = true;
  worldGroup.add(floorMesh);

  const { map: rugMap, bumpMap: rugBump } = createBoucleRugTextures();
  const rugGeo = new THREE.CylinderGeometry(1.92, 1.95, 0.012, 72);
  const rugMat = new THREE.MeshStandardMaterial({
    map: rugMap,
    bumpMap: rugBump,
    bumpScale: 0.008,
    roughness: 0.92,
    metalness: 0.0,
    envMapIntensity: 0.30
  });
  const rugMesh = new THREE.Mesh(rugGeo, rugMat);
  rugMesh.position.y = -0.005;
  rugMesh.receiveShadow = true;
  rugMesh.userData.isFloor = true;
  worldGroup.add(rugMesh);

  // Invisible large raycast plane at y=0 for smooth laser pointer & click-to-walk tracking
  const hitPlaneGeo = new THREE.PlaneGeometry(16, 16);
  hitPlaneGeo.rotateX(-Math.PI / 2);
  const hitPlane = new THREE.Mesh(
    hitPlaneGeo,
    new THREE.MeshBasicMaterial({ visible: false })
  );
  worldGroup.add(hitPlane);

  // =========================================================================
  // 2. THREE-POINT + HEMISPHERE STUDIO/SUNLIGHT RIG WITH SOFT PCF SHADOWS
  // =========================================================================
  const hemiLight = new THREE.HemisphereLight(0xdbe8ff, 0x7a5940, 0.78);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfff1dc, 2.85);
  sunLight.position.set(3.2, 4.4, 2.8);
  sunLight.castShadow = true;
  sunLight.shadow.mapSize.set(2048, 2048);
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = 14;
  const d = 2.4;
  sunLight.shadow.camera.left = -d;
  sunLight.shadow.camera.right = d;
  sunLight.shadow.camera.top = d;
  sunLight.shadow.camera.bottom = -d;
  sunLight.shadow.bias = -0.0004;
  sunLight.shadow.normalBias = 0.012;
  scene.add(sunLight);

  const fillLight = new THREE.DirectionalLight(0xadc8ff, 0.85);
  fillLight.position.set(-3.2, 2.4, 2.2);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xffd7a8, 1.05);
  rimLight.position.set(-1.6, 3.0, -3.6);
  scene.add(rimLight);

  // =========================================================================
  // 3. FLOATING SUNLIT DUST MOTES
  // =========================================================================
  const moteCount = 90;
  const motePositions = new Float32Array(moteCount * 3);
  const moteSeeds = new Float32Array(moteCount);
  for (let i = 0; i < moteCount; i++) {
    motePositions[i * 3] = (Math.random() - 0.5) * 3.6;
    motePositions[i * 3 + 1] = 0.15 + Math.random() * 1.9;
    motePositions[i * 3 + 2] = (Math.random() - 0.5) * 3.6;
    moteSeeds[i] = Math.random() * Math.PI * 2;
  }
  const moteGeo = new THREE.BufferGeometry();
  moteGeo.setAttribute('position', new THREE.BufferAttribute(motePositions, 3));
  const moteMat = new THREE.PointsMaterial({
    color: 0xffe9c7,
    size: 0.016,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.AdditiveBlending
  });
  const dustMotes = new THREE.Points(moteGeo, moteMat);
  worldGroup.add(dustMotes);

  // =========================================================================
  // 4. INTERACTIVE PROPS: LASER POINTER, PHYSICS YARN BALL, & CAT TREATS
  // =========================================================================
  // Glowing Red Laser Pointer Dot + Core Halo
  const laserGroup = new THREE.Group();
  laserGroup.visible = false;
  worldGroup.add(laserGroup);

  const laserCore = new THREE.Mesh(
    new THREE.CircleGeometry(0.016, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xffb3b3, depthWrite: false })
  );
  laserCore.position.y = 0.004;
  laserGroup.add(laserCore);

  const laserHalo = new THREE.Mesh(
    new THREE.CircleGeometry(0.048, 24).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      color: 0xff1a2b,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  laserHalo.position.y = 0.003;
  laserGroup.add(laserHalo);

  const laserPointLight = new THREE.PointLight(0xff1e2d, 0.55, 0.55);
  laserPointLight.position.y = 0.04;
  laserGroup.add(laserPointLight);

  // Physics Wound Yarn Ball
  const yarnTex = createWoundYarnTexture();
  const yarnRadius = 0.062;
  const yarnMesh = new THREE.Mesh(
    new THREE.SphereGeometry(yarnRadius, 28, 22),
    new THREE.MeshStandardMaterial({
      map: yarnTex,
      bumpMap: yarnTex,
      bumpScale: 0.006,
      roughness: 0.86
    })
  );
  yarnMesh.castShadow = true;
  yarnMesh.receiveShadow = true;
  yarnMesh.visible = false;
  worldGroup.add(yarnMesh);

  const yarnState = {
    active: false,
    mesh: yarnMesh,
    radius: yarnRadius,
    velocity: new THREE.Vector3()
  };

  function tossYarnBall(fromPos = new THREE.Vector3(0.85, 0.42, 0.95)) {
    yarnState.active = true;
    yarnMesh.visible = true;
    yarnMesh.position.copy(fromPos);
    const targetX = (Math.random() - 0.5) * 0.7;
    const targetZ = (Math.random() - 0.5) * 0.7;
    yarnState.velocity.set(
      (targetX - fromPos.x) * 1.45,
      0.65,
      (targetZ - fromPos.z) * 1.45
    );
    return yarnState;
  }

  function impulseYarnBall(dirXZ, strength = 1.35) {
    if (!yarnState.active) return;
    yarnState.velocity.x += dirXZ.x * strength;
    yarnState.velocity.z += dirXZ.z * strength;
    yarnState.velocity.y = Math.max(yarnState.velocity.y, 0.45);
  }

  // Tossable Crunchy Cat Treats
  const treats = [];
  const treatGeo = new THREE.SphereGeometry(0.020, 14, 10);
  treatGeo.scale(1.35, 0.55, 0.95);
  const treatMat = new THREE.MeshStandardMaterial({
    color: 0xa86434,
    roughness: 0.72
  });

  function spawnTreat(worldXZ = null) {
    // Clear older uneaten treats if > 3
    while (treats.length >= 3) {
      const old = treats.shift();
      worldGroup.remove(old.mesh);
    }
    const mesh = new THREE.Mesh(treatGeo, treatMat);
    mesh.castShadow = true;
    const tx = worldXZ ? worldXZ.x : (Math.random() - 0.5) * 1.3;
    const tz = worldXZ ? worldXZ.z : 0.35 + Math.random() * 0.85;
    mesh.position.set(tx, 0.48, tz);
    mesh.rotation.y = Math.random() * Math.PI * 2;
    worldGroup.add(mesh);

    const treatObj = {
      active: true,
      mesh,
      vy: 0
    };
    treats.push(treatObj);
    return treatObj;
  }

  function removeTreat(treatObj) {
    if (!treatObj) return;
    treatObj.active = false;
    worldGroup.remove(treatObj.mesh);
    const idx = treats.indexOf(treatObj);
    if (idx >= 0) treats.splice(idx, 1);
  }

  // Click target subtle floor ripple ring
  const rippleGeo = new THREE.RingGeometry(0.025, 0.042, 32);
  rippleGeo.rotateX(-Math.PI / 2);
  const rippleMat = new THREE.MeshBasicMaterial({
    color: 0xffe4b5,
    transparent: true,
    opacity: 0,
    depthWrite: false
  });
  const walkRipple = new THREE.Mesh(rippleGeo, rippleMat);
  walkRipple.position.y = 0.004;
  worldGroup.add(walkRipple);
  let rippleAge = 99;

  function showWalkRipple(pos) {
    walkRipple.position.set(pos.x, 0.004, pos.z);
    rippleAge = 0;
  }

  // =========================================================================
  // 5. LIGHTING MOOD SWITCHER & PER-FRAME PROP PHYSICS
  // =========================================================================
  let currentPresetKey = 'sunlit';

  function applyLightingPreset(presetKey, cat, animator) {
    const p = LIGHTING_PRESETS[presetKey] || LIGHTING_PRESETS.sunlit;
    currentPresetKey = presetKey;

    sunLight.color.setHex(p.sunColor);
    sunLight.intensity = p.sunIntensity;
    sunLight.position.set(p.sunPos[0], p.sunPos[1], p.sunPos[2]);

    fillLight.color.setHex(p.fillColor);
    fillLight.intensity = p.fillIntensity;

    rimLight.color.setHex(p.rimColor);
    rimLight.intensity = p.rimIntensity;

    hemiLight.color.setHex(p.hemiSky);
    hemiLight.groundColor.setHex(p.hemiGround);
    hemiLight.intensity = p.hemiIntensity;

    scene.fog.color.setHex(p.fogColor);
    backdropUniforms.uWallTop.value.setHex(p.wallTop);
    backdropUniforms.uWallHorizon.value.setHex(p.wallHorizon);
    backdropUniforms.uWindowGlow.value.setHex(p.windowGlow);
    backdropUniforms.uSunDir.value.copy(sunLight.position).normalize();
    moteMat.opacity = p.motesOpacity;

    document.documentElement.style.setProperty('--bg-top', p.bgTop);
    document.documentElement.style.setProperty('--bg-bottom', p.bgBottom);

    if (cat) {
      const sunDir = sunLight.position.clone().normalize();
      cat.updateEyeLighting(sunDir, p.sunColor, p.hemiSky, p.eyeEnvBrightness);
    }
    if (animator) {
      animator.ambientLightLevel = p.ambientBrightness;
    }
  }

  function update(dt, elapsed) {
    // Animate floating dust motes gently
    const posAttr = moteGeo.getAttribute('position');
    for (let i = 0; i < moteCount; i++) {
      const seed = moteSeeds[i];
      let y = posAttr.getY(i) + Math.sin(elapsed * 0.45 + seed) * 0.0006;
      const x = posAttr.getX(i) + Math.cos(elapsed * 0.32 + seed * 1.7) * 0.0005;
      if (y > 2.1) y = 0.15;
      posAttr.setXYZ(i, x, y, posAttr.getZ(i));
    }
    posAttr.needsUpdate = true;

    // Yarn ball physics (gravity, bounce, rolling rotation, rug boundary)
    if (yarnState.active) {
      yarnState.velocity.y -= 9.8 * dt;
      yarnMesh.position.addScaledVector(yarnState.velocity, dt);

      if (yarnMesh.position.y < yarnRadius) {
        yarnMesh.position.y = yarnRadius;
        if (Math.abs(yarnState.velocity.y) > 0.25) {
          yarnState.velocity.y = -yarnState.velocity.y * 0.48;
        } else {
          yarnState.velocity.y = 0;
        }
        // Rug rolling friction
        yarnState.velocity.x *= Math.exp(-2.1 * dt);
        yarnState.velocity.z *= Math.exp(-2.1 * dt);
      }

      // Softly bounce back inside sunlit rug arena (r <= 1.82)
      const rXZ = Math.hypot(yarnMesh.position.x, yarnMesh.position.z);
      if (rXZ > 1.82) {
        const nx = yarnMesh.position.x / rXZ;
        const nz = yarnMesh.position.z / rXZ;
        yarnMesh.position.x = nx * 1.82;
        yarnMesh.position.z = nz * 1.82;
        const dot = yarnState.velocity.x * nx + yarnState.velocity.z * nz;
        if (dot > 0) {
          yarnState.velocity.x -= 1.65 * dot * nx;
          yarnState.velocity.z -= 1.65 * dot * nz;
        }
      }

      // Roll sphere rotation naturally with XZ velocity
      const speedXZ = Math.hypot(yarnState.velocity.x, yarnState.velocity.z);
      if (speedXZ > 0.002) {
        const rollAxis = new THREE.Vector3(yarnState.velocity.z, 0, -yarnState.velocity.x).normalize();
        yarnMesh.rotateOnWorldAxis(rollAxis, (speedXZ * dt) / yarnRadius);
      }
    }

    // Falling treats bounce onto rug
    for (const t of treats) {
      if (!t.active) continue;
      if (t.mesh.position.y > 0.012 || t.vy !== 0) {
        t.vy -= 9.8 * dt;
        t.mesh.position.y += t.vy * dt;
        if (t.mesh.position.y <= 0.012) {
          t.mesh.position.y = 0.012;
          if (Math.abs(t.vy) > 0.35) {
            t.vy = -t.vy * 0.32;
          } else {
            t.vy = 0;
          }
        }
      }
    }

    // Floor click ripple fade
    if (rippleAge < 1.0) {
      rippleAge += dt * 1.8;
      const s = 1.0 + rippleAge * 3.2;
      walkRipple.scale.set(s, 1, s);
      rippleMat.opacity = Math.max(0, (1.0 - rippleAge) * 0.65);
    } else {
      rippleMat.opacity = 0;
    }

    // Laser dot shimmer
    if (laserGroup.visible) {
      const pulse = 0.9 + 0.15 * Math.sin(elapsed * 28.0);
      laserHalo.scale.setScalar(pulse);
    }
  }

  return {
    worldGroup,
    floorMesh,
    rugMesh,
    hitPlane,
    sunLight,
    laserGroup,
    yarnState,
    tossYarnBall,
    impulseYarnBall,
    spawnTreat,
    removeTreat,
    showWalkRipple,
    applyLightingPreset,
    getLightingPreset: () => currentPresetKey,
    update
  };
}
