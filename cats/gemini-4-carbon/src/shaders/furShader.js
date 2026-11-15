import * as THREE from 'three';

export const SHELL_COUNT = 14;

export const COAT_PRESETS = [
  {
    id: 0,
    key: 'ginger-tabby',
    name: 'Ginger Tabby',
    subtitle: 'Warm marmalade mackerel stripes & white mittens',
    noseColor: 0xe3888c,
    noseRimColor: 0xa85558,
    pawPadColor: 0xe28d93,
    innerEarColor: 0xebb0b2,
    whiskerColor: 0xf7f4ee,
    defaultEyePreset: 'emerald',
    rimTint: 0xffd7a3
  },
  {
    id: 1,
    key: 'silver-tabby',
    name: 'Brown / Silver Tabby',
    subtitle: 'Wild-type ticked agouti with classic dorsal whorls',
    noseColor: 0xb95f61,
    noseRimColor: 0x261d1a,
    pawPadColor: 0x2c2423,
    innerEarColor: 0xd9a2a0,
    whiskerColor: 0xf2efe8,
    defaultEyePreset: 'amber',
    rimTint: 0xffe4c4
  },
  {
    id: 2,
    key: 'tuxedo',
    name: 'Tuxedo Bicolor',
    subtitle: 'Glossy obsidian coat with snowy bib, blaze & socks',
    noseColor: 0x242024,
    noseRimColor: 0x151316,
    pawPadColor: 0xd98a94,
    innerEarColor: 0xd99ca2,
    whiskerColor: 0xfaf8f5,
    defaultEyePreset: 'gold',
    rimTint: 0xd8e2ff
  },
  {
    id: 3,
    key: 'siamese',
    name: 'Seal Point Siamese',
    subtitle: 'Warm cream body with dark espresso mask, ears & points',
    noseColor: 0x231916,
    noseRimColor: 0x160f0d,
    pawPadColor: 0x2b1e1b,
    innerEarColor: 0x70534c,
    whiskerColor: 0xe8dfd3,
    defaultEyePreset: 'sapphire',
    rimTint: 0xfff0d8
  },
  {
    id: 4,
    key: 'russian-blue',
    name: 'Russian Blue',
    subtitle: 'Plush slate-pewter double coat with silver-tipped sheen',
    noseColor: 0x45444d,
    noseRimColor: 0x2a2930,
    pawPadColor: 0x5c4f5a,
    innerEarColor: 0xb5959d,
    whiskerColor: 0xdcdde2,
    defaultEyePreset: 'emerald',
    rimTint: 0xdbe8ff
  },
  {
    id: 5,
    key: 'calico',
    name: 'Calico Tricolor',
    subtitle: 'Snowy piebald coat with rich ginger tabby & velvet ink patches',
    noseColor: 0xe58c92,
    noseRimColor: 0x8f4d52,
    pawPadColor: 0xdf8d96,
    innerEarColor: 0xebb1b5,
    whiskerColor: 0xfaf7f2,
    defaultEyePreset: 'copper',
    rimTint: 0xffe3bd
  }
];

export function createFurUniformState() {
  return {
    uCoatId: { value: 0 },
    uFurScale: { value: 1.0 },
    uTime: { value: 0.0 },
    uBrushPos: { value: new THREE.Vector3(0, -10, 0) },
    uBrushDir: { value: new THREE.Vector3(0, 0, 1) },
    uBrushStrength: { value: 0.0 },
    uRimColor: { value: new THREE.Color(0xffd7a3) },
    uRimStrength: { value: 0.42 }
  };
}

const GLSL_NOISE_AND_COAT = /* glsl */ `
  float hash13(vec3 p3) {
    p3 = fract(p3 * 0.1031);
    p3 += dot(p3, p3.zyx + 31.32);
    return fract((p3.x + p3.y) * p3.z);
  }

  vec3 hash33(vec3 p3) {
    p3 = fract(p3 * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yxz + 33.33);
    return fract((p3.xxy + p3.yxx) * p3.zyx);
  }

  float valueNoise3D(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);

    float n000 = hash13(i + vec3(0.0, 0.0, 0.0));
    float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
    float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
    float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
    float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
    float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
    float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
    float n111 = hash13(i + vec3(1.0, 1.0, 1.0));

    float nx00 = mix(n000, n100, f.x);
    float nx10 = mix(n010, n110, f.x);
    float nx01 = mix(n001, n101, f.x);
    float nx11 = mix(n011, n111, f.x);

    float nxy0 = mix(nx00, nx10, f.y);
    float nxy1 = mix(nx01, nx11, f.y);

    return mix(nxy0, nxy1, f.z);
  }

  float fbm3(vec3 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * valueNoise3D(p);
      p = p * 2.07 + vec3(13.1, 7.7, 19.3);
      a *= 0.5;
    }
    return v;
  }

  // Computes tabby stripe intensity [0..1] in anatomical cat space c
  float computeTabbyMask(vec3 c, float classicBlotch) {
    float ax = abs(c.x);
    float n = fbm3(c * 14.0) - 0.5;
    float fineN = valueNoise3D(c * 38.0) - 0.5;

    // Dorsal spine triple-line
    float spine = smoothstep(0.028, 0.008, ax) * smoothstep(0.46, 0.34, c.z) * smoothstep(-0.42, -0.32, c.z);
    float latSpine = smoothstep(0.018, 0.004, abs(ax - 0.058 + n * 0.012)) * smoothstep(0.35, 0.20, c.z) * smoothstep(-0.38, -0.25, c.z);

    // Flank stripes (mackerel vertical vs classic blotched whorls)
    float flankRegion = smoothstep(-0.38, -0.26, c.z) * smoothstep(0.32, 0.18, c.z) * smoothstep(0.26, 0.34, c.y);
    float mackerelWave = sin(c.z * 44.0 + c.y * 8.5 + n * 4.2 + fineN * 1.1);
    float blotchCenter = length((vec3(ax, c.y, c.z) - vec3(0.11, 0.45, -0.04)) * vec3(1.5, 1.2, 0.85));
    float classicWave = sin(blotchCenter * 38.0 + n * 4.8);
    float flankWave = mix(mackerelWave, classicWave, classicBlotch);
    float flankStripes = smoothstep(0.15, 0.72, flankWave) * flankRegion * smoothstep(0.03, 0.08, ax);

    // Chest necklaces ("mayor's chains")
    float chestRegion = smoothstep(0.18, 0.30, c.z) * smoothstep(0.47, 0.38, c.z) * smoothstep(0.58, 0.44, c.y);
    float necklace = smoothstep(0.35, 0.82, sin((c.y - ax * 0.45) * 48.0 + n * 2.5)) * chestRegion;

    // Leg bracelets
    float legRegion = smoothstep(0.35, 0.25, c.y) * smoothstep(0.05, 0.10, c.y) * step(-0.41, c.z);
    float legRings = smoothstep(0.28, 0.78, sin(c.y * 56.0 + c.z * 8.0 + n * 2.6)) * legRegion;

    // Tail rings + tip
    float tailRegion = smoothstep(-0.37, -0.45, c.z);
    float tailRings = smoothstep(0.18, 0.72, sin(c.z * 46.0 + n * 1.8)) * tailRegion;

    // Forehead "M" and cheek eyeliner stripes
    float headRegion = smoothstep(0.43, 0.50, c.z) * smoothstep(0.62, 0.68, c.y);
    float mChevron = sin((ax * 38.0 - c.z * 26.0 + c.y * 14.0) + n * 1.8);
    float browM = smoothstep(0.32, 0.82, mChevron) * headRegion * smoothstep(0.10, 0.01, ax);
    float cheekSweep = smoothstep(0.38, 0.82, sin((c.y - c.z * 0.35) * 62.0 + n * 2.2))
                     * smoothstep(0.45, 0.55, c.z) * smoothstep(0.05, 0.11, ax) * smoothstep(0.75, 0.65, c.y);

    return clamp(max(max(spine, latSpine * 0.85), max(max(flankStripes, necklace * 0.85), max(legRings * 0.8, max(tailRings, max(browM, cheekSweep * 0.8))))), 0.0, 1.0);
  }

  vec3 evaluateCatCoat(vec3 c, float shellH, float hairVar, int coatId) {
    float ax = abs(c.x);
    float edgeNoise = (fbm3(c * 22.0) - 0.5) * 0.032;

    // Agouti hair-shaft banding (dark root -> warm midshaft -> tipped guard hair)
    float agoutiBand = smoothstep(0.08, 0.38, shellH) * (1.0 - 0.32 * smoothstep(0.78, 1.0, shellH));

    if (coatId == 0) {
      // 0: Ginger Mackerel Tabby with white mittens, bib, chin & belly
      float stripe = computeTabbyMask(c, 0.0);
      vec3 gingerBase = mix(vec3(0.72, 0.34, 0.09), vec3(0.92, 0.57, 0.22), agoutiBand);
      vec3 gingerCream = vec3(0.95, 0.76, 0.48);
      // Countershading: warmer/paler toward lower flanks
      gingerBase = mix(gingerCream, gingerBase, smoothstep(0.30, 0.48, c.y));
      vec3 gingerStripe = vec3(0.48, 0.16, 0.035);
      vec3 col = mix(gingerBase, gingerStripe, stripe * 0.88);

      // Warm cream tail tip
      float tailTip = smoothstep(-0.88, -0.99, c.z);
      col = mix(col, vec3(0.96, 0.88, 0.74), tailTip * 0.7);

      // White spotting: mittens, chest bib, belly, muzzle pads & chin
      float mittens = smoothstep(0.088, 0.058, c.y + edgeNoise * 0.6) * step(-0.40, c.z);
      float bib = smoothstep(0.105, 0.065, ax + edgeNoise * 0.5)
                * smoothstep(0.18, 0.28, c.z) * smoothstep(0.56, 0.44, c.y);
      float belly = smoothstep(0.365, 0.315, c.y + edgeNoise) * smoothstep(0.10, 0.05, ax)
                  * smoothstep(-0.35, -0.24, c.z) * smoothstep(0.34, 0.20, c.z);
      float muzzleWhite = smoothstep(0.548, 0.596, c.z + edgeNoise * 0.4)
                        * smoothstep(0.705, 0.662, c.y)
                        * smoothstep(0.068, 0.038, ax);
      float earBackSpot = smoothstep(0.80, 0.84, c.y) * smoothstep(0.06, 0.11, ax) * 0.22;

      float whiteMask = clamp(max(max(mittens, bib), max(belly, muzzleWhite)), 0.0, 1.0);
      col = mix(col, vec3(0.96, 0.94, 0.90), whiteMask);
      col += earBackSpot * vec3(0.12, 0.08, 0.04);
      return col * (1.0 + hairVar * 0.14);
    }

    if (coatId == 1) {
      // 1: Brown / Silver Classic Agouti Tabby
      float stripe = computeTabbyMask(c, 0.78);
      vec3 agoutiRoot = vec3(0.22, 0.19, 0.17);
      vec3 agoutiMid = vec3(0.64, 0.55, 0.45);
      vec3 agoutiTip = vec3(0.34, 0.29, 0.24);
      vec3 base = mix(agoutiRoot, agoutiMid, smoothstep(0.06, 0.52, shellH));
      base = mix(base, agoutiTip, smoothstep(0.76, 1.0, shellH) * 0.55);

      // Warm rufous nose bridge & underside countershading
      float rufousTint = smoothstep(0.44, 0.32, c.y) * 0.35 + smoothstep(0.56, 0.65, c.z) * 0.25;
      base = mix(base, vec3(0.72, 0.54, 0.38), clamp(rufousTint, 0.0, 0.45));

      vec3 darkStripe = vec3(0.075, 0.062, 0.055);
      vec3 col = mix(base, darkStripe, stripe * 0.92);

      // Dark tail tip & dark paw soles
      col = mix(col, darkStripe, smoothstep(-0.88, -0.98, c.z) * 0.85);

      // Pale ivory chin & eye-liner highlights
      float ivoryChin = smoothstep(0.545, 0.598, c.z) * smoothstep(0.685, 0.640, c.y) * smoothstep(0.058, 0.025, ax);
      col = mix(col, vec3(0.90, 0.87, 0.81), ivoryChin * 0.88);
      return col * (1.0 + hairVar * 0.16);
    }

    if (coatId == 2) {
      // 2: Tuxedo (Jet black with crisp white blaze, bib, belly & socks)
      vec3 blackCoat = mix(vec3(0.032, 0.030, 0.036), vec3(0.068, 0.064, 0.075), smoothstep(0.25, 0.95, shellH));
      float socks = smoothstep(0.095, 0.065, c.y + edgeNoise * 0.5) * step(-0.40, c.z);
      float bib = smoothstep(0.105, 0.070, ax + edgeNoise * 0.45)
                * smoothstep(0.16, 0.26, c.z) * smoothstep(0.57, 0.45, c.y);
      float belly = smoothstep(0.36, 0.32, c.y + edgeNoise * 0.7) * smoothstep(0.095, 0.055, ax)
                  * smoothstep(-0.34, -0.22, c.z) * smoothstep(0.30, 0.18, c.z);
      float blaze = smoothstep(0.542, 0.588, c.z + edgeNoise * 0.35)
                  * smoothstep(0.725, 0.662, c.y + ax * 0.95)
                  * smoothstep(0.068, 0.032, ax);

      float whiteMask = clamp(max(max(socks, bib), max(belly, blaze)), 0.0, 1.0);
      vec3 whiteFur = vec3(0.96, 0.95, 0.93);
      return mix(blackCoat, whiteFur, whiteMask) * (1.0 + hairVar * 0.10);
    }

    if (coatId == 3) {
      // 3: Seal Point Siamese (Thermomelanism on mask, ears, lower legs, tail)
      float n = (fbm3(c * 12.0) - 0.5) * 0.04;
      vec3 creamBody = mix(vec3(0.84, 0.76, 0.64), vec3(0.93, 0.88, 0.79), smoothstep(0.32, 0.52, c.y));
      // Subtle warm fawn saddle shading on back
      float saddle = smoothstep(0.45, 0.57, c.y + n) * smoothstep(0.25, -0.25, c.z) * 0.28;
      creamBody = mix(creamBody, vec3(0.66, 0.54, 0.42), saddle);

      float faceDist = length((c - vec3(0.0, 0.698, 0.608)) * vec3(1.05, 1.15, 0.95));
      float maskPoint = smoothstep(0.145, 0.065, faceDist + n * 0.6);
      float earPoint = smoothstep(0.755, 0.815, c.y + n * 0.5) * smoothstep(0.40, 0.48, c.z);
      float legPoint = smoothstep(0.25, 0.06, c.y + n * 0.8) * step(-0.40, c.z);
      float tailPoint = smoothstep(-0.35, -0.52, c.z + n);

      float pointMask = clamp(max(max(maskPoint, earPoint), max(legPoint, tailPoint)), 0.0, 1.0);
      vec3 sealDark = vec3(0.105, 0.068, 0.052);
      return mix(creamBody, sealDark, pointMask) * (1.0 + hairVar * 0.11);
    }

    if (coatId == 4) {
      // 4: Russian Blue (Plush pewter-blue double coat with silver guard-hair tips)
      vec3 underSlate = vec3(0.21, 0.24, 0.29);
      vec3 midBlue = vec3(0.32, 0.36, 0.43);
      vec3 silverTip = vec3(0.66, 0.71, 0.78);
      vec3 col = mix(underSlate, midBlue, smoothstep(0.08, 0.55, shellH));
      col = mix(col, silverTip, smoothstep(0.68, 1.0, shellH) * 0.58);
      // Faint ghost tail rings
      float ghostRings = smoothstep(0.3, 0.8, sin(c.z * 44.0)) * smoothstep(-0.42, -0.55, c.z) * 0.12;
      col *= (1.0 - ghostRings);
      return col * (1.0 + hairVar * 0.12);
    }

    // 5: Calico Tricolor (Piebald white + bold organic orange-tabby & ink-black patches)
    vec3 whiteBase = vec3(0.96, 0.94, 0.91);
    float patchField1 = fbm3(c * 4.6 + vec3(2.4, 1.1, 5.7));
    float patchField2 = fbm3(c * 5.2 + vec3(9.3, 4.8, 1.9));
    // Bias colored patches toward dorsal back, crown/ears, and tail
    float dorsalBias = smoothstep(0.24, 0.54, c.y) * 0.26 + smoothstep(-0.32, -0.50, c.z) * 0.24;
    float orangeMask = smoothstep(0.53, 0.58, patchField1 + dorsalBias * 0.55);
    float blackMask = smoothstep(0.55, 0.60, patchField2 + dorsalBias * 0.52) * (1.0 - orangeMask * 0.85);

    float stripe = computeTabbyMask(c, 0.2);
    vec3 orangePatch = mix(vec3(0.84, 0.43, 0.13), vec3(0.52, 0.18, 0.04), stripe * 0.75);
    vec3 blackPatch = vec3(0.045, 0.042, 0.048);

    vec3 col = mix(whiteBase, orangePatch, orangeMask);
    col = mix(col, blackPatch, blackMask);
    return col * (1.0 + hairVar * 0.12);
  }

  // Dual-grid 3D procedural fur strand evaluator (seam-free in metric rest-pose space)
  void evaluateFurStrand(vec3 coatPos, vec3 combDir, float shellH, out float keepAlpha, out float hairVar) {
    // Slightly shear lookup along comb tangent with shell height so hairs curve cohesively
    vec3 warped = coatPos - combDir * (shellH * shellH * 0.009);

    // Coarse clumping + fine individual hair grid
    vec3 pFine = warped * 560.0;
    vec3 cellA = floor(pFine);
    vec3 fA = fract(pFine);
    vec3 rndA = hash33(cellA);
    vec2 offsetA = fA.xz + vec2(fA.y * 0.37, -fA.y * 0.29) - (0.22 + rndA.xy * 0.56);
    float distA = length(offsetA);
    float maxHA = 0.28 + rndA.z * 0.72;

    // Second staggered 3D hair lattice for lush double-coat density
    vec3 pSub = warped * 740.0 + vec3(0.47, 0.61, 0.33);
    vec3 cellB = floor(pSub);
    vec3 fB = fract(pSub);
    vec3 rndB = hash33(cellB + vec3(17.0, 31.0, 43.0));
    vec2 offsetB = fB.xy + vec2(fB.z * 0.31, fB.z * 0.41) - (0.22 + rndB.xy * 0.56);
    float distB = length(offsetB);
    float maxHB = 0.20 + rndB.z * 0.68;

    // Clump modulation so guard hairs group naturally like real feline pelage
    float clump = valueNoise3D(warped * 95.0);
    maxHA = clamp(maxHA * (0.82 + clump * 0.34), 0.16, 1.0);
    maxHB = clamp(maxHB * (0.78 + clump * 0.30), 0.14, 0.92);

    // Taper radius from dense undercoat root to crisp wispy tip
    float baseRadius = mix(0.62, 0.13, pow(shellH, 0.74));
    float normA = shellH / max(maxHA, 0.001);
    float normB = shellH / max(maxHB, 0.001);

    bool hitA = (shellH <= maxHA) && (distA <= baseRadius * (1.0 - 0.42 * normA));
    bool hitB = (shellH <= maxHB) && (distB <= baseRadius * 0.92 * (1.0 - 0.45 * normB));

    keepAlpha = (hitA || hitB) ? 1.0 : 0.0;
    hairVar = (hitA ? (rndA.x - 0.5) : (rndB.y - 0.5)) * 1.4 + (clump - 0.5) * 0.45;
  }
`;

export function createCatFurShellMaterials(sharedUniforms) {
  const materials = [];

  for (let i = 0; i <= SHELL_COUNT; i++) {
    const shellH = i / SHELL_COUNT;
    const isBase = i === 0;

    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: isBase ? 0.88 : 0.66,
      metalness: 0.02,
      envMapIntensity: isBase ? 0.45 : 0.72,
      side: THREE.FrontSide
    });

    const uShellH = { value: shellH };
    mat.userData.uShellH = uShellH;
    mat.customProgramCacheKey = () => (isBase ? 'cat-fur-skin-v1' : 'cat-fur-shell-v1');

    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uShellH = uShellH;
      shader.uniforms.uCoatId = sharedUniforms.uCoatId;
      shader.uniforms.uFurScale = sharedUniforms.uFurScale;
      shader.uniforms.uTime = sharedUniforms.uTime;
      shader.uniforms.uBrushPos = sharedUniforms.uBrushPos;
      shader.uniforms.uBrushDir = sharedUniforms.uBrushDir;
      shader.uniforms.uBrushStrength = sharedUniforms.uBrushStrength;
      shader.uniforms.uRimColor = sharedUniforms.uRimColor;
      shader.uniforms.uRimStrength = sharedUniforms.uRimStrength;

      // Vertex shader: rest-pose groomed extrusion (pre-skinning) + world-space gravity & petting brush (post-skinning)
      shader.vertexShader = shader.vertexShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        attribute vec3 aCoatCoord;
        attribute vec4 aFurData;

        uniform float uShellH;
        uniform float uFurScale;
        uniform float uTime;
        uniform vec3 uBrushPos;
        uniform vec3 uBrushDir;
        uniform float uBrushStrength;

        varying vec3 vCoatCoord;
        varying vec3 vCombDir;
        varying float vFurLen;
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <begin_vertex>',
        /* glsl */ `
        #include <begin_vertex>
        vCoatCoord = aCoatCoord;
        vFurLen = aFurData.x * uFurScale;
        vCombDir = aFurData.yzw;

        if (uShellH > 0.0001 && vFurLen > 0.0001) {
          float h = uShellH;
          vec3 comb = length(vCombDir) > 0.001 ? normalize(vCombDir) : vec3(0.0, 0.0, -1.0);
          // Extrude outward along normal and sweep smoothly into groomed pelt direction
          vec3 growthDir = normalize(objectNormal + comb * (0.78 * h));
          transformed += growthDir * (vFurLen * h);
        }
        `
      );

      shader.vertexShader = shader.vertexShader.replace(
        '#include <project_vertex>',
        /* glsl */ `
        if (uShellH > 0.0001 && vFurLen > 0.0001) {
          vec4 wpCheck = modelMatrix * vec4(transformed, 1.0);
          vec3 worldDelta = vec3(0.0, -vFurLen * uShellH * uShellH * 0.16, 0.0);

          // Interactive tactile petting brush ripple & compression
          if (uBrushStrength > 0.001) {
            vec3 toCursor = wpCheck.xyz - uBrushPos;
            float bDist = length(toCursor);
            float influence = exp(-bDist * bDist * 95.0) * uBrushStrength * uShellH;
            vec3 partSide = length(toCursor) > 0.001 ? normalize(toCursor) : vec3(0.0, 1.0, 0.0);
            worldDelta += (uBrushDir * 0.024 + partSide * 0.009 - vec3(0.0, 0.011, 0.0)) * influence;
          }

          transformed += inverse(mat3(modelMatrix)) * worldDelta;
        }
        #include <project_vertex>
        `
      );

      // Fragment shader: procedural coat genetics + dual-grid strand discard + Kajiya-style rim velvet scatter
      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <common>',
        /* glsl */ `
        #include <common>
        uniform float uShellH;
        uniform int uCoatId;
        uniform vec3 uRimColor;
        uniform float uRimStrength;

        varying vec3 vCoatCoord;
        varying vec3 vCombDir;
        varying float vFurLen;

        ${GLSL_NOISE_AND_COAT}
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <color_fragment>',
        /* glsl */ `
        #include <color_fragment>
        float hairVar = 0.0;
        if (uShellH > 0.0001) {
          if (vFurLen < 0.0005) {
            discard;
          }
          float keepAlpha = 1.0;
          evaluateFurStrand(vCoatCoord, vCombDir, uShellH, keepAlpha, hairVar);
          if (keepAlpha < 0.5) {
            discard;
          }
        } else {
          hairVar = (valueNoise3D(vCoatCoord * 320.0) - 0.5) * 0.5;
        }

        vec3 coatRGB = evaluateCatCoat(vCoatCoord, uShellH, hairVar, uCoatId);

        // Deep root self-shadowing AO -> luminous plush fur tips
        float furRootAO = (uShellH <= 0.0001)
          ? 0.44
          : mix(0.46, 1.10, pow(uShellH, 0.58));

        diffuseColor.rgb *= coatRGB * furRootAO;
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <roughnessmap_fragment>',
        /* glsl */ `
        #include <roughnessmap_fragment>
        float coatGloss = (uCoatId == 2 || uCoatId == 4) ? 0.46 : 0.60;
        roughnessFactor = mix(0.86, coatGloss, smoothstep(0.0, 0.9, uShellH));
        `
      );

      shader.fragmentShader = shader.fragmentShader.replace(
        '#include <lights_fragment_end>',
        /* glsl */ `
        #include <lights_fragment_end>
        // Feline pelage forward/rim velvet sheen along silhouette guard hairs
        vec3 viewDirFrag = normalize(vViewPosition);
        float fresnelRim = pow(1.0 - clamp(abs(dot(normal, viewDirFrag)), 0.0, 1.0), 2.8);
        float tipSheen = mix(0.18, 1.0, pow(uShellH, 0.72));
        reflectedLight.indirectDiffuse += diffuseColor.rgb * uRimColor * (fresnelRim * tipSheen * uRimStrength);
        `
      );
    };

    materials.push(mat);
  }

  return materials;
}
