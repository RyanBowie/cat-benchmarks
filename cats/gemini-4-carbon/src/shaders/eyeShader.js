import * as THREE from 'three';

export const EYE_PRESETS = {
  emerald: {
    name: 'Emerald Green',
    inner: 0x8fd45b,
    outer: 0x2b7a44,
    limbus: 0x0d2115
  },
  amber: {
    name: 'Hazel Amber',
    inner: 0xe6b645,
    outer: 0x8f6922,
    limbus: 0x221709
  },
  gold: {
    name: 'Vivid Gold',
    inner: 0xf7cf4a,
    outer: 0xc2831a,
    limbus: 0x291a08
  },
  copper: {
    name: 'Warm Copper',
    inner: 0xe8892c,
    outer: 0x8c3a10,
    limbus: 0x240f05
  },
  sapphire: {
    name: 'Siamese Sapphire',
    inner: 0x6cb8f7,
    outer: 0x1b5299,
    limbus: 0x091933
  },
  odd: {
    name: 'Odd-Eyed (Blue & Gold)',
    heterochromia: true,
    left: { inner: 0x6cb8f7, outer: 0x1b5299, limbus: 0x091933 },
    right: { inner: 0xf5cb47, outer: 0xbd7d19, limbus: 0x261807 }
  }
};

export function createCatIrisMaterial(initialColors = EYE_PRESETS.emerald) {
  const uniforms = {
    uInnerColor: { value: new THREE.Color(initialColors.inner || 0x8fd45b) },
    uOuterColor: { value: new THREE.Color(initialColors.outer || 0x2b7a44) },
    uLimbusColor: { value: new THREE.Color(initialColors.limbus || 0x0d2115) },
    uPupilDilation: { value: 0.28 }, // 0.07 razor vertical slit -> 0.82 wide nocturnal saucer
    uLightDir: { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() },
    uEnvBrightness: { value: 1.0 }
  };

  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      void main() {
        vUv = uv;
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uInnerColor;
      uniform vec3 uOuterColor;
      uniform vec3 uLimbusColor;
      uniform float uPupilDilation;
      uniform vec3 uLightDir;
      uniform float uEnvBrightness;

      varying vec2 vUv;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;

      float hash12(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      float noise2D(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        f = f * f * (3.0 - 2.0 * f);
        float a = hash12(i);
        float b = hash12(i + vec2(1.0, 0.0));
        float c = hash12(i + vec2(0.0, 1.0));
        float d = hash12(i + vec2(1.0, 1.0));
        return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
      }

      void main() {
        // Centered eye-disc coordinates in [-1, 1]
        vec2 p = (vUv - 0.5) * 2.0;
        float r = length(p);
        float angle = atan(p.y, p.x);

        // Outer sclera border beyond iris radius 0.90
        float irisRadius = 0.90;
        float rn = r / irisRadius;

        // Feline vertical slit-to-round pupil SDF
        float dil = clamp(uPupilDilation, 0.06, 0.85);
        float pupilHeight = mix(0.66, 0.76, dil);
        float pupilHalfWidth = mix(0.052, pupilHeight, pow(dil, 1.18));

        // Pointed feline vertical vesica slit morphing smoothly into a round pupil
        float yNorm = clamp(abs(p.y) / pupilHeight, 0.0, 1.3);
        float slitPinch = mix(pow(max(0.0, 1.0 - yNorm * yNorm), 0.78), sqrt(max(0.0, 1.0 - yNorm * yNorm)), smoothstep(0.25, 0.75, dil));
        float allowedX = pupilHalfWidth * slitPinch;
        float pupilDist = (abs(p.x) - allowedX) / max(0.04, pupilHalfWidth * 0.35 + 0.03);
        if (yNorm > 1.0) {
          pupilDist = max(pupilDist, (yNorm - 1.0) * 8.0);
        }
        float pupilMask = 1.0 - smoothstep(-0.08, 0.09, pupilDist);

        // Radial iris collagen stroma fibers + concentric crypts
        float fiber1 = noise2D(vec2(angle * 18.0, rn * 6.5));
        float fiber2 = noise2D(vec2(angle * 42.0 + fiber1 * 1.6, rn * 12.0));
        float crypts = noise2D(vec2(angle * 9.0 - 2.1, rn * 4.2));
        float radialPattern = fiber1 * 0.52 + fiber2 * 0.33 + crypts * 0.15;

        // Color gradient from pupillary collarette to outer ciliary zone
        float collarette = smoothstep(0.12, 0.58, rn + (crypts - 0.5) * 0.08);
        vec3 irisCol = mix(uInnerColor, uOuterColor, collarette);
        irisCol *= (0.74 + radialPattern * 0.56);

        // Subtle warm melanin flecks & collarette highlight ring
        float ringGlow = exp(-pow((rn - (0.26 + dil * 0.32)) * 5.2, 2.0)) * 0.24;
        irisCol += uInnerColor * ringGlow;

        // Dark pupillary ruff edge right around the slit pupil
        float ruff = exp(-max(0.0, pupilDist) * 3.4) * (1.0 - pupilMask);
        irisCol = mix(irisCol, uLimbusColor * 0.65, ruff * 0.62);

        // Dark limbal ring & sclera blend at outer iris edge
        float limbus = smoothstep(0.74, 0.98, rn);
        irisCol = mix(irisCol, uLimbusColor, limbus * 0.88);

        // Concave iris caustic illumination (light entering cornea brightens opposite side of iris bowl!)
        vec3 localLight = uLightDir;
        float nDotL = clamp(dot(vWorldNormal, localLight), 0.0, 1.0);
        float caustic = clamp(-p.x * localLight.x - p.y * localLight.y, -0.35, 0.65);
        float irisIllum = (0.48 + 0.62 * nDotL + max(0.0, caustic) * 0.55) * uEnvBrightness;
        irisCol *= irisIllum;

        // Deep velvet-black pupil interior with faint tapetum lucidum hint
        vec3 pupilCol = vec3(0.008, 0.009, 0.014) + uInnerColor * (0.018 * (1.0 - dil));
        vec3 col = mix(irisCol, pupilCol, pupilMask);

        // Dark pigmented feline limbal & conjunctival rim (cats do not show a white sclera ring)
        if (rn > 0.90) {
          vec3 darkRim = uLimbusColor * (0.35 + 0.25 * nDotL) * uEnvBrightness;
          col = mix(col, darkRim, smoothstep(0.88, 1.02, rn));
        }

        // Subtle upper-eyelid shadow cast onto top of iris
        float upperLidShadow = smoothstep(0.32, 0.85, p.y);
        col *= (1.0 - upperLidShadow * 0.38);

        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  return material;
}

export function createCorneaMaterial() {
  // Custom optical cornea dome: zero-cost crystal-clear wet lens reflection + dual window catchlights
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0.45, 0.72, 0.52).normalize() },
      uSunColor: { value: new THREE.Color(0xfff5e4) },
      uSkyColor: { value: new THREE.Color(0xbfd8ff) },
      uGlossStrength: { value: 1.0 }
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vRadialNorm;

      void main() {
        vRadialNorm = length(position.xy);
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunDir;
      uniform vec3 uSunColor;
      uniform vec3 uSkyColor;
      uniform float uGlossStrength;

      varying vec3 vWorldNormal;
      varying vec3 vWorldPos;
      varying float vRadialNorm;

      void main() {
        vec3 N = normalize(vWorldNormal);
        vec3 V = normalize(cameraPosition - vWorldPos);
        vec3 R = reflect(-V, N);

        // Smooth fade to zero before cornea cap perimeter so no bright rim ring ever forms
        float capFade = 1.0 - smoothstep(0.017, 0.0245, vRadialNorm);

        // Subtle tear-film reflection
        float fresnel = (0.02 + 0.22 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.2)) * capFade;

        // Crisp primary window/sun specular catchlight (sharp pinpoint so iris fibers stay rich & vivid)
        vec3 H1 = normalize(uSunDir + V);
        float spec1 = pow(clamp(dot(N, H1), 0.0, 1.0), 340.0) * 1.55;
        // Subtle soft window reflection around catchlight
        float windowGlow = pow(clamp(dot(N, H1), 0.0, 1.0), 48.0) * 0.08;

        // Secondary bounce catchlight
        vec3 fillDir = normalize(vec3(-uSunDir.x * 0.8, 0.45, 0.65));
        vec3 H2 = normalize(fillDir + V);
        float spec2 = pow(clamp(dot(N, H2), 0.0, 1.0), 180.0) * 0.28;

        // Sky hemisphere reflection on curved wet dome
        float skyFactor = smoothstep(-0.1, 0.65, R.y);
        vec3 envRefl = mix(vec3(0.02, 0.015, 0.015), uSkyColor * 0.20, skyFactor) * fresnel;

        vec3 col = (envRefl + (uSunColor * (spec1 + windowGlow) + uSkyColor * spec2) * capFade) * uGlossStrength;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}
