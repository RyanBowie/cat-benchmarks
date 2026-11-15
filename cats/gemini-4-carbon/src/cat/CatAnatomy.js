import * as THREE from 'three';
import {
  COAT_PRESETS,
  createFurUniformState,
  createCatFurShellMaterials
} from '../shaders/furShader.js';
import {
  EYE_PRESETS,
  createCatIrisMaterial,
  createCorneaMaterial
} from '../shaders/eyeShader.js';

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function gaussian3D(px, py, pz, cx, cy, cz, rx, ry, rz) {
  const dx = (px - cx) / rx;
  const dy = (py - cy) / ry;
  const dz = (pz - cz) / rz;
  return Math.exp(-(dx * dx + dy * dy + dz * dz));
}

/**
 * Builds a closed, outward-oriented organic tube loft with seamless normals,
 * rest-pose coat coordinates (aCoatCoord), groomed fur vectors (aFurData),
 * and optional 4-bone skeletal skinning weights.
 */
function buildOrganicLoftGeometry({
  rings,
  radialSegments = 28,
  skinned = true,
  capStart = true,
  capEnd = true
}) {
  const ringCount = rings.length;
  const cols = radialSegments + 1;

  const positions = [];
  const uvs = [];
  const coatCoords = [];
  const furData = [];
  const skinIndices = [];
  const skinWeights = [];
  const indices = [];

  // Compute smooth tangents along ring centers
  const tangents = rings.map((r, i) => {
    const prev = rings[Math.max(0, i - 1)].center;
    const next = rings[Math.min(ringCount - 1, i + 1)].center;
    const t = new THREE.Vector3().subVectors(next, prev);
    if (t.lengthSq() < 1e-8) t.set(0, 0, 1);
    return t.normalize();
  });

  // Parallel-transport frame along rings to prevent twisting
  const frames = [];
  let prevUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(tangents[0].dot(prevUp)) > 0.92) {
    prevUp.set(0, 0, 1);
  }
  for (let i = 0; i < ringCount; i++) {
    const T = tangents[i];
    const R = new THREE.Vector3().crossVectors(prevUp, T);
    if (R.lengthSq() < 1e-6) {
      R.set(1, 0, 0);
    } else {
      R.normalize();
    }
    const U = new THREE.Vector3().crossVectors(T, R).normalize();
    prevUp = U.clone();
    frames.push({ R, U, T });
  }

  for (let i = 0; i < ringCount; i++) {
    const ring = rings[i];
    const { R, U, T } = frames[i];
    const vCoord = i / (ringCount - 1);

    for (let j = 0; j <= radialSegments; j++) {
      const uCoord = j / radialSegments;
      const theta = (j % radialSegments) / radialSegments * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      // Allow custom anatomical cross-section shaping per ring/angle
      let rx = ring.rx;
      let ry = ring.ry;
      let extraX = 0;
      let extraY = 0;
      let extraZ = 0;

      if (ring.profileFn) {
        const mod = ring.profileFn(theta, cosT, sinT);
        if (mod.rx !== undefined) rx = mod.rx;
        if (mod.ry !== undefined) ry = mod.ry;
        if (mod.dx !== undefined) extraX = mod.dx;
        if (mod.dy !== undefined) extraY = mod.dy;
        if (mod.dz !== undefined) extraZ = mod.dz;
      }

      const pos = new THREE.Vector3()
        .copy(ring.center)
        .addScaledVector(R, cosT * rx + extraX)
        .addScaledVector(U, sinT * ry + extraY);
      pos.z += extraZ;

      positions.push(pos.x, pos.y, pos.z);
      uvs.push(uCoord, vCoord);

      const cPos = ring.coatOffset
        ? new THREE.Vector3().addVectors(pos, ring.coatOffset)
        : pos;
      coatCoords.push(cPos.x, cPos.y, cPos.z);

      const fLen = typeof ring.furLength === 'function'
        ? ring.furLength(theta, cosT, sinT)
        : ring.furLength;
      const comb = ring.combDir || new THREE.Vector3(-T.x, -T.y, -T.z);
      furData.push(fLen, comb.x, comb.y, comb.z);

      if (skinned) {
        const bw = ring.boneWeights || [[0, 1], [0, 0], [0, 0], [0, 0]];
        skinIndices.push(bw[0][0], bw[1][0], bw[2][0], bw[3][0]);
        skinWeights.push(bw[0][1], bw[1][1], bw[2][1], bw[3][1]);
      }
    }
  }

  // Determine consistent outward CCW winding using mid-ring radial test
  const midRing = Math.floor(ringCount / 2);
  const aIdx = midRing * cols + 0;
  const bIdx = Math.min(ringCount - 1, midRing + 1) * cols + 0;
  const cIdx = Math.min(ringCount - 1, midRing + 1) * cols + 1;
  const va = new THREE.Vector3(positions[aIdx * 3], positions[aIdx * 3 + 1], positions[aIdx * 3 + 2]);
  const vb = new THREE.Vector3(positions[bIdx * 3], positions[bIdx * 3 + 1], positions[bIdx * 3 + 2]);
  const vc = new THREE.Vector3(positions[cIdx * 3], positions[cIdx * 3 + 1], positions[cIdx * 3 + 2]);
  const e1 = new THREE.Vector3().subVectors(vb, va);
  const e2 = new THREE.Vector3().subVectors(vc, va);
  const testN = new THREE.Vector3().crossVectors(e1, e2);
  const radialOut = new THREE.Vector3().subVectors(va, rings[midRing].center);
  const flipWinding = testN.dot(radialOut) < 0;

  for (let i = 0; i < ringCount - 1; i++) {
    for (let j = 0; j < radialSegments; j++) {
      const i0 = i * cols + j;
      const i1 = (i + 1) * cols + j;
      const i2 = (i + 1) * cols + (j + 1);
      const i3 = i * cols + (j + 1);

      if (!flipWinding) {
        indices.push(i0, i1, i2, i0, i2, i3);
      } else {
        indices.push(i0, i2, i1, i0, i3, i2);
      }
    }
  }

  const addEndCap = (ringIdx, isStart) => {
    const ring = rings[ringIdx];
    const centerVertIdx = positions.length / 3;
    const { T } = frames[ringIdx];
    const capPos = ring.center.clone().addScaledVector(T, isStart ? -0.004 : 0.004);
    positions.push(capPos.x, capPos.y, capPos.z);
    uvs.push(0.5, isStart ? 0 : 1);
    const cPos = ring.coatOffset ? capPos.clone().add(ring.coatOffset) : capPos;
    coatCoords.push(cPos.x, cPos.y, cPos.z);
    const fLen = typeof ring.furLength === 'function' ? ring.furLength(0, 1, 0) : ring.furLength;
    const comb = ring.combDir || new THREE.Vector3(0, 0, -1);
    furData.push(fLen, comb.x, comb.y, comb.z);
    if (skinned) {
      const bw = ring.boneWeights || [[0, 1], [0, 0], [0, 0], [0, 0]];
      skinIndices.push(bw[0][0], bw[1][0], bw[2][0], bw[3][0]);
      skinWeights.push(bw[0][1], bw[1][1], bw[2][1], bw[3][1]);
    }

    for (let j = 0; j < radialSegments; j++) {
      const v0 = ringIdx * cols + j;
      const v1 = ringIdx * cols + j + 1;
      const triA = isStart ? v1 : v0;
      const triB = isStart ? v0 : v1;
      if (!flipWinding) {
        indices.push(centerVertIdx, triA, triB);
      } else {
        indices.push(centerVertIdx, triB, triA);
      }
    }
  };

  if (capStart) addEndCap(0, true);
  if (capEnd) addEndCap(ringCount - 1, false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setAttribute('aCoatCoord', new THREE.Float32BufferAttribute(coatCoords, 3));
  geo.setAttribute('aFurData', new THREE.Float32BufferAttribute(furData, 4));
  if (skinned) {
    geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));
  }
  geo.setIndex(indices);
  geo.computeVertexNormals();

  // Weld seam normals across j=0 and j=radialSegments so shading & fur extrusion have zero seam
  const normAttr = geo.getAttribute('normal');
  const nA = new THREE.Vector3();
  const nB = new THREE.Vector3();
  for (let i = 0; i < ringCount; i++) {
    const idx0 = i * cols;
    const idxLast = i * cols + radialSegments;
    nA.fromBufferAttribute(normAttr, idx0);
    nB.fromBufferAttribute(normAttr, idxLast);
    nA.add(nB).normalize();
    normAttr.setXYZ(idx0, nA.x, nA.y, nA.z);
    normAttr.setXYZ(idxLast, nA.x, nA.y, nA.z);
  }
  normAttr.needsUpdate = true;

  return geo;
}

/**
 * Smooth piecewise linear bone weight blend along normalized parameter t in [0..1]
 */
function blendBoneChainWeights(t, stops) {
  // stops: [{ t: 0.0, bone: idx }, { t: 0.35, bone: idx }, ...]
  if (t <= stops[0].t) {
    return [[stops[0].bone, 1], [0, 0], [0, 0], [0, 0]];
  }
  const last = stops[stops.length - 1];
  if (t >= last.t) {
    return [[last.bone, 1], [0, 0], [0, 0], [0, 0]];
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];
    if (t >= a.t && t <= b.t) {
      const alpha = smoothstep(a.t, b.t, t);
      return [
        [a.bone, 1 - alpha],
        [b.bone, alpha],
        [0, 0],
        [0, 0]
      ];
    }
  }
  return [[stops[0].bone, 1], [0, 0], [0, 0], [0, 0]];
}

/**
 * Builds the sculpted feline skull & facial mask geometry (attached to headBone).
 * Uses analytical 3D Gaussian lobes for cheekbones, orbital eye sockets, brow ridges,
 * sloping nasal bridge, plump split mystacial whisker pads, philtrum cleft, and oral recess.
 */
function buildSculptedCatHeadGeometry(headWorldOrigin) {
  const geo = new THREE.SphereGeometry(1, 72, 56);
  const posAttr = geo.getAttribute('position');
  const count = posAttr.count;

  const coatCoords = new Float32Array(count * 3);
  const furData = new Float32Array(count * 4);

  const p = new THREE.Vector3();
  const comb = new THREE.Vector3();

  for (let i = 0; i < count; i++) {
    // Unit sphere point
    const ux = posAttr.getX(i);
    const uy = posAttr.getY(i);
    const uz = posAttr.getZ(i);
    const ax = Math.abs(ux);

    // Base feline cranium proportions: round domestic cat skull with compact, sweet muzzle
    let x = ux * 0.124;
    let y = uy * 0.108 + 0.024;
    let z = uz * 0.116 + 0.066;

    // 1. Gently flatten skull crown and widen zygomatic cheekbones + fluffy cheek ruffs
    if (uy > 0.2) {
      y -= (uy - 0.2) * 0.015 * (1.0 - Math.min(1, Math.abs(uz)));
    }
    const cheekRuff = gaussian3D(ax, uy, uz, 0.86, -0.18, -0.02, 0.42, 0.48, 0.52);
    x += Math.sign(ux) * cheekRuff * 0.027;
    y -= cheekRuff * 0.008;
    z -= cheekRuff * 0.004;

    // Taper smoothly at back/bottom occiput toward neck
    const backNeck = smoothstep(-0.25, -0.95, uz);
    x *= (1.0 - backNeck * 0.16);
    y -= backNeck * 0.012;

    // 2. Compact feline facial wedge & short sloping nasal bridge (not a long canine snout!)
    const nasalBridge = gaussian3D(ax, uy, uz, 0.0, 0.08, 0.92, 0.23, 0.30, 0.34);
    z += nasalBridge * 0.017;
    y += nasalBridge * 0.005;

    // Distinct feline brow "stop" concavity between eyes
    const browStop = gaussian3D(ax, uy, uz, 0.0, 0.34, 0.86, 0.32, 0.18, 0.25);
    z -= browStop * 0.013;

    // Supraorbital brow ridges & lower zygomatic orbital rim framing almond feline eyes
    const browArch = gaussian3D(ax, uy, uz, 0.44, 0.42, 0.78, 0.26, 0.14, 0.25);
    z += browArch * 0.015;
    y += browArch * 0.008;

    const lowerOrbitCheek = gaussian3D(ax, uy, uz, 0.46, -0.04, 0.80, 0.26, 0.14, 0.25);
    z += lowerOrbitCheek * 0.011;
    y += lowerOrbitCheek * 0.003;

    // 3. Concave orbital eye sockets so feline eyes nestle cleanly inside skull with zero fur occlusion
    const orbitSocket = gaussian3D(ax, uy, uz, 0.44, 0.19, 0.85, 0.23, 0.22, 0.24);
    z -= orbitSocket * 0.036;
    x -= Math.sign(ux) * orbitSocket * 0.005;

    // 4. Compact, plump rounded mystacial whisker pads + subtle central philtrum groove
    const whiskerPad = gaussian3D(ax, uy, uz, 0.28, -0.24, 0.88, 0.25, 0.24, 0.26);
    z += whiskerPad * 0.025;
    x += Math.sign(ux) * whiskerPad * 0.014;
    y -= whiskerPad * 0.008;

    // Central philtrum groove & inverted-Y upper lip split
    const philtrum = gaussian3D(ax, uy, uz, 0.0, -0.28, 0.95, 0.075, 0.20, 0.20);
    z -= philtrum * 0.005;

    // Nose tip shelf supporting wet rhinarium (~3.1cm ahead of eyes)
    const noseShelf = gaussian3D(ax, uy, uz, 0.0, -0.06, 0.98, 0.18, 0.15, 0.18);
    z += noseShelf * 0.019;

    // 5. Subtle inner palate recess under central skull while keeping outer upper lips plump & furred
    const innerPalateMask = smoothstep(-0.46, -0.86, uy) * smoothstep(0.05, 0.72, uz) * (1.0 - smoothstep(0.28, 0.56, ax));
    y += innerPalateMask * 0.026;
    const chinTuck = smoothstep(-0.52, -0.92, uy) * smoothstep(-0.05, 0.65, uz);
    x *= (1.0 - chinTuck * 0.18);

    posAttr.setXYZ(i, x, y, z);

    // Rest-pose world coat coordinate
    coatCoords[i * 3] = headWorldOrigin.x + x;
    coatCoords[i * 3 + 1] = headWorldOrigin.y + y;
    coatCoords[i * 3 + 2] = headWorldOrigin.z + z;

    // Variable fur length: zero fur inside actual eye aperture so fur shells never occlude the iris!
    let furLen = 0.0165;
    furLen -= (nasalBridge * 0.006 + whiskerPad * 0.005 + noseShelf * 0.005);
    furLen = Math.max(0.0075, furLen) + cheekRuff * 0.015;
    if (orbitSocket > 0.26) {
      furLen *= (1.0 - smoothstep(0.26, 0.48, orbitSocket));
    }
    if (innerPalateMask > 0.45) {
      furLen *= (1.0 - smoothstep(0.45, 0.80, innerPalateMask));
    }
    furLen = Math.max(0.0, furLen);

    // Fur comb radiates smoothly backward from nose tip over brow and outward/back across cheeks
    comb.set(ux * 0.45, uy * 0.25 - 0.12, -0.88).normalize();
    furData[i * 4] = furLen;
    furData[i * 4 + 1] = comb.x;
    furData[i * 4 + 2] = comb.y;
    furData[i * 4 + 3] = comb.z;
  }

  geo.setAttribute('aCoatCoord', new THREE.BufferAttribute(coatCoords, 3));
  geo.setAttribute('aFurData', new THREE.BufferAttribute(furData, 4));
  geo.computeVertexNormals();

  // Weld sphere UV-longitude seam normals
  return geo;
}

/**
 * Builds the articulated lower jaw & chin geometry (attached to jawBone).
 */
function buildLowerJawGeometry(jawWorldOrigin) {
  const rings = [];
  const steps = 14;
  for (let i = 0; i < steps; i++) {
    const t = i / (steps - 1);
    const z = -0.012 + t * 0.098; // compact feline chin tucked neatly behind rounded whisker pads (+0.086)
    const widthCurve = Math.sin(Math.min(1, t * 1.12) * Math.PI * 0.84);
    const rx = 0.016 + 0.036 * widthCurve * (1.0 - t * 0.36);
    const ry = 0.014 + 0.019 * Math.sin(t * Math.PI * 0.88);
    const cy = -0.001 - 0.005 * Math.sin(t * Math.PI * 0.72) + t * 0.003;

    rings.push({
      center: new THREE.Vector3(0, cy, z),
      rx,
      ry,
      coatOffset: jawWorldOrigin,
      furLength: (theta, cosT, sinT) => {
        // Keep full plush chin fur across front chin cushion (t >= 0.58); bare oral floor inside mouth
        if (t < 0.58 && sinT > 0.44) return 0.0;
        return 0.0135 * (1.0 - 0.18 * t);
      },
      combDir: new THREE.Vector3(0, -0.25, -0.96).normalize(),
      profileFn: (theta, cosT, sinT) => ({
        dy: sinT > 0 ? -sinT * ry * 0.32 : 0
      })
    });
  }

  return buildOrganicLoftGeometry({
    rings,
    radialSegments: 22,
    skinned: false,
    capStart: true,
    capEnd: true
  });
}

/**
 * Builds a closed, 3D thin-walled cupped feline pinna (ear) with convex furred back
 * and concave recessed concha cavity, plus a separate smooth inner-skin shell.
 */
function buildCuppedCatEarGeometries(sideSign, earWorldOrigin) {
  // sideSign: +1 for Left ear, -1 for Right ear
  const rings = [];
  const heightSteps = 18;
  const radialSegments = 26;

  for (let i = 0; i < heightSteps; i++) {
    const v = i / (heightSteps - 1); // 0 = skull base -> 1 = softly rounded tip
    // Natural feline ear taper: broad cupped base, gentle S-curve helix, softly rounded tip
    const taper = Math.pow(1.0 - v, 0.72) * (0.86 + 0.22 * Math.sin(v * Math.PI * 0.85));
    const width = 0.054 * taper + 0.005 * (1.0 - v);
    const thickness = 0.022 * (1.0 - v * 0.72) + 0.003;

    // Slight forward cup & outward cant
    const cx = sideSign * (v * 0.022);
    const cy = v * 0.132;
    const cz = v * 0.016 - Math.sin(v * Math.PI) * 0.008;

    rings.push({
      center: new THREE.Vector3(cx, cy, cz),
      rx: width,
      ry: thickness,
      coatOffset: earWorldOrigin,
      furLength: (theta, cosT, sinT) => {
        // sinT > 0 faces forward (+Z in ear frame): concave inner pinna is bare skin; back/rim has short sleek fur
        if (sinT > 0.18 && v > 0.06 && v < 0.93) {
          return 0.0;
        }
        // Slightly longer fur at base blending seamlessly into skull
        const baseFluff = (1.0 - smoothstep(0.0, 0.30, v)) * 0.009;
        return 0.0065 * (1.0 - v * 0.45) + baseFluff;
      },
      combDir: new THREE.Vector3(sideSign * 0.18, 0.95, -0.20).normalize(),
      profileFn: (theta, cosT, sinT) => {
        // Concave cup: push front face (+sinT) inward toward the back wall (-sinT) to form realistic hollow pinna!
        let cupDepth = 0;
        if (sinT > 0) {
          const edgeMargin = Math.pow(Math.max(0, 1.0 - cosT * cosT), 0.65);
          cupDepth = -sinT * edgeMargin * thickness * 1.38 * smoothstep(0.02, 0.18, v) * smoothstep(0.99, 0.82, v);
        }
        return { dy: cupDepth };
      }
    });
  }

  const earFurGeo = buildOrganicLoftGeometry({
    rings,
    radialSegments,
    skinned: false,
    capStart: false,
    capEnd: true
  });

  // Dedicated smooth inner-concha skin patch sitting inside the cup with soft depth shading
  const skinPos = [];
  const skinColors = [];
  const skinUvs = [];
  const skinIndices = [];
  const uSteps = 16;
  const vSteps = 16;
  for (let iv = 0; iv <= vSteps; iv++) {
    const v = 0.05 + (iv / vSteps) * 0.82;
    const taper = Math.pow(1.0 - v, 0.78) * (0.80 + 0.18 * Math.sin(v * Math.PI * 0.85));
    const halfW = 0.039 * taper;
    const cx = sideSign * (v * 0.022);
    const cy = v * 0.132;
    const cz = v * 0.016 - Math.sin(v * Math.PI) * 0.008;

    for (let iu = 0; iu <= uSteps; iu++) {
      const u = (iu / uSteps) * 2 - 1; // -1 .. +1 across ear opening
      const archDepth = -0.011 * (1.0 - u * u) * (1.0 - v * 0.62) + 0.0012;
      const ridge = Math.exp(-Math.pow((u - sideSign * 0.18) * 5.0, 2)) * 0.0018 * (1.0 - v);
      skinPos.push(cx + u * halfW, cy, cz + archDepth + ridge);
      skinUvs.push((u + 1) * 0.5, v);

      // Soft natural ear-canal shadow near base & lateral margins so concha never looks flat
      const canalShade = 0.72 + 0.28 * smoothstep(0.05, 0.55, v) * (0.82 + 0.18 * (1.0 - u * u));
      skinColors.push(canalShade, canalShade * 0.96, canalShade * 0.95);
    }
  }
  const cols = uSteps + 1;
  for (let iv = 0; iv < vSteps; iv++) {
    for (let iu = 0; iu < uSteps; iu++) {
      const a = iv * cols + iu;
      const b = a + 1;
      const c = (iv + 1) * cols + (iu + 1);
      const d = (iv + 1) * cols + iu;
      skinIndices.push(a, b, c, a, c, d);
    }
  }
  const innerSkinGeo = new THREE.BufferGeometry();
  innerSkinGeo.setAttribute('position', new THREE.Float32BufferAttribute(skinPos, 3));
  innerSkinGeo.setAttribute('color', new THREE.Float32BufferAttribute(skinColors, 3));
  innerSkinGeo.setAttribute('uv', new THREE.Float32BufferAttribute(skinUvs, 2));
  innerSkinGeo.setIndex(skinIndices);
  innerSkinGeo.computeVertexNormals();

  return { earFurGeo, innerSkinGeo };
}

/**
 * Builds the sculpted wet feline rhinarium (nose leather) with nostrils and philtrum cleft.
 */
function buildRhinariumGeometry() {
  const geo = new THREE.SphereGeometry(1, 36, 28);
  const pos = geo.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const ux = pos.getX(i);
    const uy = pos.getY(i);
    const uz = pos.getZ(i);
    const ax = Math.abs(ux);

    // Classic triangular feline nose pad: wider across top wings, tapering down to philtrum point
    const topFlare = smoothstep(-0.7, 0.55, uy);
    let x = ux * (0.007 + 0.0145 * topFlare);
    let y = uy * 0.0145;
    let z = uz * 0.011;

    // Flatten front slightly & carve subtle comma-shaped lateral nostrils
    if (uz > 0.15) {
      z *= 0.82;
    }
    const nostril = gaussian3D(ax, uy, uz, 0.58, -0.08, 0.65, 0.28, 0.30, 0.38);
    z -= nostril * 0.0048;
    x -= Math.sign(ux) * nostril * 0.0016;

    // Vertical philtrum groove down front center
    const cleft = gaussian3D(ax, uy, uz, 0.0, -0.35, 0.85, 0.13, 0.65, 0.35);
    z -= cleft * 0.0022;

    pos.setXYZ(i, x, y, z);
  }
  geo.computeVertexNormals();
  return geo;
}

/**
 * Attaches base + 14 extruded fur shell meshes sharing a single BufferGeometry
 * (and sharing the Skeleton when skinned=true).
 */
function createMultiShellFurObject({
  geometry,
  furMaterials,
  skeleton = null,
  bindMatrix = null,
  parent,
  name
}) {
  const group = new THREE.Group();
  group.name = name;
  const meshes = [];

  for (let i = 0; i < furMaterials.length; i++) {
    let mesh;
    if (skeleton) {
      mesh = new THREE.SkinnedMesh(geometry, furMaterials[i]);
      mesh.bind(skeleton, bindMatrix || new THREE.Matrix4());
      // Generous frustum margin for skeletal poses
      mesh.frustumCulled = false;
    } else {
      mesh = new THREE.Mesh(geometry, furMaterials[i]);
    }
    mesh.castShadow = i === 0;
    mesh.receiveShadow = true;
    mesh.name = `${name}_shell_${i}`;
    mesh.userData.isCatSurface = i === 0;
    mesh.userData.partName = name;
    group.add(mesh);
    meshes.push(mesh);
  }

  parent.add(group);
  return { group, baseMesh: meshes[0], meshes };
}

/**
 * Builds the complete Realistic 3D Cat character from scratch:
 * - 35-bone hierarchical skeleton (spine, digitigrade fore/hind limbs, 7-bone tail, neck, head, jaw, ears)
 * - Continuous lofted skinned torso + neck, 4 skinned digitigrade legs & paws, skinned sinuous tail
 * - Sculpted feline head, articulated lower jaw with fangs & tongue, cupped ears with furnishings, vibrissae whiskers
 * - Multi-layer optical eyes with dynamic slit-to-round pupils, wet cornea domes & animated eyelids
 * - Underside leathery "toe bean" paw pads, retractable claws, and toggleable leather collar + brass bell
 */
export function createRealisticCat() {
  const catGroup = new THREE.Group();
  catGroup.name = 'RealisticCat';

  const furUniforms = createFurUniformState();
  const furMaterials = createCatFurShellMaterials(furUniforms);

  // =========================================================================
  // 1. SKELETON & BONE HIERARCHY (Rest-pose world coordinates)
  // =========================================================================
  const bones = [];
  const boneIndexMap = new Map();
  const makeBone = (name, parentBone, lx, ly, lz) => {
    const b = new THREE.Bone();
    b.name = name;
    b.position.set(lx, ly, lz);
    if (parentBone) parentBone.add(b);
    boneIndexMap.set(name, bones.length);
    bones.push(b);
    return b;
  };

  // Root center of mass at (0, 0.54, -0.05)
  const rootBone = makeBone('root', null, 0, 0.54, -0.05);
  catGroup.add(rootBone);

  // Pelvis & lumbar-to-cervical spine
  const pelvisBone = makeBone('pelvis', rootBone, 0, 0.00, -0.27);     // world (0, 0.54, -0.32)
  const spine1Bone = makeBone('spine1', rootBone, 0, 0.02, -0.07);     // world (0, 0.56, -0.12)
  const spine2Bone = makeBone('spine2', spine1Bone, 0, -0.005, 0.19);  // world (0, 0.555, +0.07)
  const chestBone = makeBone('chest', spine2Bone, 0, 0.012, 0.18);     // world (0, 0.567, +0.25)
  const neckBone = makeBone('neck', chestBone, 0, 0.042, 0.115);       // world (0, 0.609, +0.365)
  const headBone = makeBone('head', neckBone, 0, 0.076, 0.085);        // world (0, 0.685, +0.450)
  const jawBone = makeBone('jaw', headBone, 0, -0.019, 0.096);
  const earLBone = makeBone('earL', headBone, 0.064, 0.094, 0.054);
  const earRBone = makeBone('earR', headBone, -0.064, 0.094, 0.054);

  // 7-Bone Sinuous Tail attached to pelvis
  const tailBones = [];
  const tailOffsets = [
    [0, -0.010, -0.090],  // tail0: world (0, 0.530, -0.410)
    [0, -0.022, -0.092],  // tail1: world (0, 0.508, -0.502)
    [0, -0.036, -0.092],  // tail2: world (0, 0.472, -0.594)
    [0, -0.040, -0.092],  // tail3: world (0, 0.432, -0.686)
    [0, -0.028, -0.092],  // tail4: world (0, 0.404, -0.778)
    [0, -0.006, -0.090],  // tail5: world (0, 0.398, -0.868)
    [0, 0.018, -0.086]    // tail6: world (0, 0.416, -0.954)
  ];
  let prevTail = pelvisBone;
  for (let i = 0; i < tailOffsets.length; i++) {
    const [tx, ty, tz] = tailOffsets[i];
    const tb = makeBone(`tail${i}`, prevTail, tx, ty, tz);
    tailBones.push(tb);
    prevTail = tb;
  }

  // Digitigrade Forelimbs (scapula -> shoulder -> elbow -> wrist -> paw)
  const createFrontLimbBones = (tag, sx) => {
    const scapula = makeBone(`scapula${tag}`, chestBone, sx * 0.100, -0.032, 0.010);  // (sx*0.100, 0.535, +0.260)
    const shoulder = makeBone(`shoulder${tag}`, scapula, sx * 0.012, -0.112, 0.028);  // (sx*0.112, 0.423, +0.288)
    const elbow = makeBone(`elbow${tag}`, shoulder, -sx * 0.004, -0.156, -0.076);     // (sx*0.108, 0.267, +0.212)
    const wrist = makeBone(`wrist${tag}`, elbow, -sx * 0.003, -0.172, 0.020);         // (sx*0.105, 0.095, +0.232)
    const paw = makeBone(`pawF${tag}`, wrist, 0, -0.073, 0.048);                      // (sx*0.105, 0.022, +0.280)
    return { scapula, shoulder, elbow, wrist, paw };
  };
  const frontL = createFrontLimbBones('L', 1);
  const frontR = createFrontLimbBones('R', -1);

  // Digitigrade Hindlimbs (hip -> stifle/knee -> high hock -> metatarsus/paw)
  const createHindLimbBones = (tag, sx) => {
    const hip = makeBone(`hip${tag}`, pelvisBone, sx * 0.110, -0.038, -0.012);        // (sx*0.110, 0.502, -0.332)
    const knee = makeBone(`knee${tag}`, hip, sx * 0.010, -0.192, 0.114);              // (sx*0.120, 0.310, -0.218)
    const hock = makeBone(`hock${tag}`, knee, -sx * 0.006, -0.145, -0.146);           // (sx*0.114, 0.165, -0.364)
    const paw = makeBone(`pawH${tag}`, hock, 0, -0.143, 0.056);                       // (sx*0.114, 0.022, -0.308)
    return { hip, knee, hock, paw };
  };
  const hindL = createHindLimbBones('L', 1);
  const hindR = createHindLimbBones('R', -1);

  // Compute exact bind-pose world matrices
  catGroup.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  const identityBind = new THREE.Matrix4();

  // Save clean rest-pose local transforms on every bone for procedural animation blending
  const restPose = new Map();
  for (const b of bones) {
    restPose.set(b.name, {
      pos: b.position.clone(),
      quat: b.quaternion.clone(),
      rot: b.rotation.clone()
    });
  }

  // =========================================================================
  // 2. SKINNED CONTINUOUS TORSO + NECK LOFT
  // =========================================================================
  const torsoSplinePoints = [
    new THREE.Vector3(0, 0.515, -0.435), // 0: ischial rump cap
    new THREE.Vector3(0, 0.545, -0.340), // 1: muscular croup / pelvis
    new THREE.Vector3(0, 0.562, -0.190), // 2: lumbar loin
    new THREE.Vector3(0, 0.556, -0.020), // 3: mid-ribcage
    new THREE.Vector3(0, 0.560, 0.150),  // 4: anterior thorax
    new THREE.Vector3(0, 0.575, 0.265),  // 5: shoulders / withers
    new THREE.Vector3(0, 0.618, 0.375),  // 6: cervical neck
    new THREE.Vector3(0, 0.688, 0.475)   // 7: occipital skull junction
  ];
  const torsoCurve = new THREE.CatmullRomCurve3(torsoSplinePoints);
  const torsoSteps = 40;
  const torsoRings = [];

  const torsoStops = [
    { t: 0.08, bone: boneIndexMap.get('pelvis') },
    { t: 0.30, bone: boneIndexMap.get('spine1') },
    { t: 0.52, bone: boneIndexMap.get('spine2') },
    { t: 0.72, bone: boneIndexMap.get('chest') },
    { t: 0.87, bone: boneIndexMap.get('neck') },
    { t: 0.98, bone: boneIndexMap.get('head') }
  ];

  for (let i = 0; i < torsoSteps; i++) {
    const t = i / (torsoSteps - 1);
    const center = torsoCurve.getPoint(t);

    // Smooth anatomical width & depth along feline body
    const endCapStart = smoothstep(0.0, 0.09, t);
    const endCapNeck = 1.0 - 0.36 * smoothstep(0.76, 1.0, t);

    // Feline torso is deep at ribcage, slightly tucked at waist, muscular across haunches & shoulders
    const ribDepth = gaussian3D(t, 0, 0, 0.58, 0, 0, 0.24, 1, 1);
    const waistTuck = gaussian3D(t, 0, 0, 0.33, 0, 0, 0.14, 1, 1);
    const haunchBulk = gaussian3D(t, 0, 0, 0.15, 0, 0, 0.14, 1, 1);
    const neckRuff = gaussian3D(t, 0, 0, 0.82, 0, 0, 0.12, 1, 1);

    const rx = (0.114 + haunchBulk * 0.018 + ribDepth * 0.010 - waistTuck * 0.008) * endCapStart * endCapNeck;
    const ry = (0.126 + ribDepth * 0.028 + haunchBulk * 0.012 - waistTuck * 0.014) * endCapStart * (1.0 - 0.38 * smoothstep(0.76, 1.0, t));

    // Fur length: plush chest ruff & belly fluff, sleek dorsal saddle
    const baseFur = 0.021 + neckRuff * 0.010 + haunchBulk * 0.004;

    torsoRings.push({
      center,
      rx: Math.max(0.018, rx),
      ry: Math.max(0.018, ry),
      furLength: (theta, cosT, sinT) => {
        const bellyFluff = sinT < -0.2 ? (-sinT - 0.2) * 0.010 * (1.0 - smoothstep(0.85, 1.0, t)) : 0;
        return baseFur + bellyFluff;
      },
      combDir: new THREE.Vector3(0, -0.22, -0.97).normalize(),
      boneWeights: blendBoneChainWeights(t, torsoStops),
      profileFn: (theta, cosT, sinT) => {
        // Subtle paired dorsal scapula ridges at shoulders (t ~ 0.68)
        const scapulaZone = gaussian3D(t, 0, 0, 0.68, 0, 0, 0.11, 1, 1);
        const bladeBump = scapulaZone * Math.max(0, sinT) * Math.exp(-Math.pow((Math.abs(cosT) - 0.52) * 3.8, 2)) * 0.016;
        // Deep brisket keel under chest (t ~ 0.62)
        const brisket = ribDepth * (sinT < 0 ? -sinT * 0.022 * Math.pow(Math.max(0, 1 - cosT * cosT), 0.7) : 0);
        // Subtle primordial belly pouch before hind legs (t ~ 0.26)
        const pouch = gaussian3D(t, 0, 0, 0.25, 0, 0, 0.10, 1, 1) * (sinT < -0.5 ? (-sinT - 0.5) * 0.018 : 0);
        return {
          dy: bladeBump - brisket - pouch
        };
      }
    });
  }

  const torsoGeo = buildOrganicLoftGeometry({
    rings: torsoRings,
    radialSegments: 32,
    skinned: true,
    capStart: true,
    capEnd: true
  });
  createMultiShellFurObject({
    geometry: torsoGeo,
    furMaterials,
    skeleton,
    bindMatrix: identityBind,
    parent: catGroup,
    name: 'torso'
  });

  // =========================================================================
  // 3. SKINNED DIGITIGRADE FORELIMBS & HINDLIMBS
  // =========================================================================
  const buildSkinnedLimb = ({ isFront, sx, limbBones, name }) => {
    const rings = [];
    if (isFront) {
      // Forelimb curve anchored well inside chest mass so shoulder flexion/stretch never exposes a seam
      const pScap = new THREE.Vector3(sx * 0.064, 0.566, 0.242);
      const pShld = new THREE.Vector3(sx * 0.106, 0.428, 0.284);
      const pElbw = new THREE.Vector3(sx * 0.108, 0.267, 0.212);
      const pWrst = new THREE.Vector3(sx * 0.105, 0.095, 0.232);
      const pPawBack = new THREE.Vector3(sx * 0.105, 0.032, 0.256);
      const pPawTip = new THREE.Vector3(sx * 0.105, 0.022, 0.312);

      const curve = new THREE.CatmullRomCurve3([pScap, pShld, pElbw, pWrst, pPawBack, pPawTip]);
      const steps = 28;
      const stops = [
        { t: 0.10, bone: boneIndexMap.get('chest') },
        { t: 0.22, bone: boneIndexMap.get(limbBones.scapula.name) },
        { t: 0.38, bone: boneIndexMap.get(limbBones.shoulder.name) },
        { t: 0.60, bone: boneIndexMap.get(limbBones.elbow.name) },
        { t: 0.80, bone: boneIndexMap.get(limbBones.wrist.name) },
        { t: 0.92, bone: boneIndexMap.get(limbBones.paw.name) }
      ];

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const c = curve.getPoint(t);

        // Taper from muscular upper arm to sleek forearm/wrist, then flare into rounded feline paw
        const upperArm = 1.0 - smoothstep(0.0, 0.68, t);
        const pawFlare = gaussian3D(t, 0, 0, 0.91, 0, 0, 0.09, 1, 1);
        const tipCap = 1.0 - 0.58 * smoothstep(0.92, 1.0, t);

        const rx = (0.026 + upperArm * 0.034 + pawFlare * 0.015) * tipCap;
        const ry = (0.028 + upperArm * 0.040 + pawFlare * 0.004) * tipCap;

        rings.push({
          center: c,
          rx,
          ry,
          furLength: (theta, cosT, sinT) => {
            // Bare underside where paw pads touch the floor
            if (t > 0.82 && c.y + sinT * ry < 0.016) return 0.0;
            return 0.017 * (1.0 - 0.48 * smoothstep(0.45, 0.92, t));
          },
          combDir: t > 0.80
            ? new THREE.Vector3(0, -0.35, 0.93).normalize()
            : new THREE.Vector3(0, -0.96, -0.25).normalize(),
          boneWeights: blendBoneChainWeights(t, stops),
          profileFn: (theta, cosT, sinT) => {
            // Flatten bottom of paw so it plants naturally on floor y=0
            if (t > 0.80 && sinT < 0) {
              return { dy: -sinT * ry * 0.42 * smoothstep(0.80, 0.90, t) };
            }
            return {};
          }
        });
      }
    } else {
      // Hindlimb curve: broad muscular thigh/haunch -> forward stifle -> high backward hock -> vertical metatarsus -> paw
      const pHipRoot = new THREE.Vector3(sx * 0.088, 0.525, -0.328);
      const pThigh = new THREE.Vector3(sx * 0.116, 0.425, -0.285);
      const pKnee = new THREE.Vector3(sx * 0.120, 0.310, -0.218);
      const pHock = new THREE.Vector3(sx * 0.114, 0.165, -0.364);
      const pMeta = new THREE.Vector3(sx * 0.114, 0.055, -0.330);
      const pPawTip = new THREE.Vector3(sx * 0.114, 0.022, -0.272);

      const curve = new THREE.CatmullRomCurve3([pHipRoot, pThigh, pKnee, pHock, pMeta, pPawTip]);
      const steps = 30;
      const stops = [
        { t: 0.04, bone: boneIndexMap.get('pelvis') },
        { t: 0.22, bone: boneIndexMap.get(limbBones.hip.name) },
        { t: 0.48, bone: boneIndexMap.get(limbBones.knee.name) },
        { t: 0.74, bone: boneIndexMap.get(limbBones.hock.name) },
        { t: 0.90, bone: boneIndexMap.get(limbBones.paw.name) }
      ];

      for (let i = 0; i < steps; i++) {
        const t = i / (steps - 1);
        const c = curve.getPoint(t);

        // Broad muscular feline haunch/thigh tapering cleanly at hock, then flaring slightly at paw
        const thighMuscle = Math.pow(1.0 - smoothstep(0.0, 0.66, t), 1.15);
        const hockPoint = gaussian3D(t, 0, 0, 0.68, 0, 0, 0.08, 1, 1);
        const pawFlare = gaussian3D(t, 0, 0, 0.92, 0, 0, 0.08, 1, 1);
        const tipCap = 1.0 - 0.56 * smoothstep(0.92, 1.0, t);

        const rx = (0.025 + thighMuscle * 0.042 + pawFlare * 0.014) * tipCap;
        const ry = (0.027 + thighMuscle * 0.062 + hockPoint * 0.008 + pawFlare * 0.004) * tipCap;

        rings.push({
          center: c,
          rx,
          ry,
          furLength: (theta, cosT, sinT) => {
            if (t > 0.83 && c.y + sinT * ry < 0.016) return 0.0;
            const BritchesFluff = thighMuscle * 0.008;
            return (0.017 + BritchesFluff) * (1.0 - 0.46 * smoothstep(0.55, 0.92, t));
          },
          combDir: t > 0.82
            ? new THREE.Vector3(0, -0.35, 0.93).normalize()
            : new THREE.Vector3(0, -0.94, -0.32).normalize(),
          boneWeights: blendBoneChainWeights(t, stops),
          profileFn: (theta, cosT, sinT) => {
            if (t > 0.82 && sinT < 0) {
              return { dy: -sinT * ry * 0.42 * smoothstep(0.82, 0.91, t) };
            }
            return {};
          }
        });
      }
    }

    const limbGeo = buildOrganicLoftGeometry({
      rings,
      radialSegments: 22,
      skinned: true,
      capStart: true,
      capEnd: true
    });

    return createMultiShellFurObject({
      geometry: limbGeo,
      furMaterials,
      skeleton,
      bindMatrix: identityBind,
      parent: catGroup,
      name
    });
  };

  buildSkinnedLimb({ isFront: true, sx: 1, limbBones: frontL, name: 'frontLeftLeg' });
  buildSkinnedLimb({ isFront: true, sx: -1, limbBones: frontR, name: 'frontRightLeg' });
  buildSkinnedLimb({ isFront: false, sx: 1, limbBones: hindL, name: 'hindLeftLeg' });
  buildSkinnedLimb({ isFront: false, sx: -1, limbBones: hindR, name: 'hindRightLeg' });

  // =========================================================================
  // 4. PAW TOES, LEATHERY "TOE BEANS", & RETRACTABLE CLAWS
  // =========================================================================
  const pawPadMaterial = new THREE.MeshPhysicalMaterial({
    color: COAT_PRESETS[0].pawPadColor,
    roughness: 0.52,
    metalness: 0.0,
    clearcoat: 0.25,
    clearcoatRoughness: 0.45
  });

  const clawMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xf4efe2,
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 0.75
  });

  const clawGroups = [];
  const attachPawDetails = (pawBone) => {
    const padGroup = new THREE.Group();
    padGroup.position.set(0, -0.015, -0.005);
    pawBone.add(padGroup);

    // Central trilobed metacarpal/metatarsal cushion tucked underneath paw
    const mainPadGeo = new THREE.SphereGeometry(0.014, 16, 12);
    mainPadGeo.scale(1.10, 0.30, 0.95);
    const mainPad = new THREE.Mesh(mainPadGeo, pawPadMaterial);
    mainPad.position.set(0, 0, -0.006);
    padGroup.add(mainPad);

    // 4 digital toe beans tucked strictly underneath toes + retractable curved ivory claws
    const toeAngles = [-0.46, -0.16, 0.16, 0.46];
    const toeBeanGeo = new THREE.SphereGeometry(0.0068, 12, 10);
    toeBeanGeo.scale(0.78, 0.32, 1.05);

    const clawConeGeo = new THREE.ConeGeometry(0.0024, 0.013, 10);
    clawConeGeo.rotateX(Math.PI * 0.62);

    const pawClaws = new THREE.Group();
    pawBone.add(pawClaws);
    clawGroups.push(pawClaws);

    for (let t = 0; t < 4; t++) {
      const ang = toeAngles[t];
      const dist = t === 1 || t === 2 ? 0.012 : 0.009;
      const bean = new THREE.Mesh(toeBeanGeo, pawPadMaterial);
      bean.position.set(Math.sin(ang) * 0.018, 0.0005, Math.cos(ang) * dist);
      bean.rotation.y = ang * 0.6;
      padGroup.add(bean);

      // Retractable claw tucked completely inside toe fur sheath at rest
      const claw = new THREE.Mesh(clawConeGeo, clawMaterial);
      claw.position.set(Math.sin(ang) * 0.020, -0.002, Math.cos(ang) * (dist + 0.011));
      claw.rotation.y = ang * 0.5;
      pawClaws.add(claw);
    }
    pawClaws.scale.setScalar(0.15);
    pawClaws.position.set(0, 0.005, -0.012);
  };

  attachPawDetails(frontL.paw);
  attachPawDetails(frontR.paw);
  attachPawDetails(hindL.paw);
  attachPawDetails(hindR.paw);

  // =========================================================================
  // 5. SKINNED 7-BONE SINUOUS TAIL
  // =========================================================================
  const tailWorldPts = tailBones.map((tb) => {
    const v = new THREE.Vector3();
    tb.getWorldPosition(v);
    return v;
  });
  // Extend past final bone to plush tail tip
  const lastBonePt = tailWorldPts[tailWorldPts.length - 1];
  const prevBonePt = tailWorldPts[tailWorldPts.length - 2];
  const tailEndPt = lastBonePt.clone().add(new THREE.Vector3().subVectors(lastBonePt, prevBonePt).multiplyScalar(0.85));
  const tailRootCollar = new THREE.Vector3(0, 0.534, -0.378);

  const tailCurve = new THREE.CatmullRomCurve3([tailRootCollar, ...tailWorldPts, tailEndPt]);
  const tailSteps = 30;
  const tailRings = [];
  const tailStops = [
    { t: 0.02, bone: boneIndexMap.get('pelvis') },
    ...tailBones.map((tb, idx) => ({
      t: 0.08 + (idx / (tailBones.length - 1)) * 0.84,
      bone: boneIndexMap.get(tb.name)
    }))
  ];

  for (let i = 0; i < tailSteps; i++) {
    const t = i / (tailSteps - 1);
    const c = tailCurve.getPoint(t);
    const tipRound = Math.pow(1.0 - smoothstep(0.82, 1.0, t), 0.65);
    const r = (0.036 * (1.0 - t * 0.44) + 0.006) * Math.max(0.24, tipRound);

    tailRings.push({
      center: c,
      rx: r,
      ry: r,
      furLength: 0.025 + 0.008 * Math.sin(t * Math.PI * 0.85),
      combDir: new THREE.Vector3(0, -0.18, -0.98).normalize(),
      boneWeights: blendBoneChainWeights(t, tailStops)
    });
  }

  const tailGeo = buildOrganicLoftGeometry({
    rings: tailRings,
    radialSegments: 18,
    skinned: true,
    capStart: true,
    capEnd: true
  });
  createMultiShellFurObject({
    geometry: tailGeo,
    furMaterials,
    skeleton,
    bindMatrix: identityBind,
    parent: catGroup,
    name: 'tail'
  });

  // =========================================================================
  // 6. SCULPTED FELINE HEAD, ARTICULATED JAW, MOUTH/FANGS/TONGUE, & RHINARIUM
  // =========================================================================
  const headWorldOrigin = new THREE.Vector3();
  headBone.getWorldPosition(headWorldOrigin);

  const headGeo = buildSculptedCatHeadGeometry(headWorldOrigin);
  createMultiShellFurObject({
    geometry: headGeo,
    furMaterials,
    parent: headBone,
    name: 'head'
  });

  // Articulated Lower Jaw + Oral Cavity + Fangs + Pink Tongue
  const jawWorldOrigin = new THREE.Vector3();
  jawBone.getWorldPosition(jawWorldOrigin);
  const jawGeo = buildLowerJawGeometry(jawWorldOrigin);
  createMultiShellFurObject({
    geometry: jawGeo,
    furMaterials,
    parent: jawBone,
    name: 'jaw'
  });

  const oralGumMat = new THREE.MeshPhysicalMaterial({
    color: 0xb85c67,
    roughness: 0.42,
    clearcoat: 0.45
  });
  const tongueMat = new THREE.MeshPhysicalMaterial({
    color: 0xe37684,
    roughness: 0.58,
    clearcoat: 0.35
  });
  const toothMat = new THREE.MeshPhysicalMaterial({
    color: 0xfaf6eb,
    roughness: 0.18,
    clearcoat: 0.8
  });

  // Upper & lower oral interior groups (only revealed when mouth opens for meow / yawn / groom!)
  const upperOralGroup = new THREE.Group();
  upperOralGroup.visible = false;
  headBone.add(upperOralGroup);

  const palateGeo = new THREE.SphereGeometry(0.025, 16, 12);
  palateGeo.scale(0.95, 0.28, 1.22);
  const palateMesh = new THREE.Mesh(palateGeo, oralGumMat);
  palateMesh.position.set(0, -0.010, 0.142);
  upperOralGroup.add(palateMesh);

  const upperFangGeo = new THREE.ConeGeometry(0.0028, 0.012, 10);
  upperFangGeo.rotateX(Math.PI);
  for (const sx of [-1, 1]) {
    const uFang = new THREE.Mesh(upperFangGeo, toothMat);
    uFang.position.set(sx * 0.018, -0.017, 0.166);
    uFang.rotation.z = sx * -0.06;
    upperOralGroup.add(uFang);
  }

  const lowerOralGroup = new THREE.Group();
  lowerOralGroup.visible = false;
  jawBone.add(lowerOralGroup);

  const lowerGum = new THREE.Mesh(palateGeo, oralGumMat);
  lowerGum.scale.set(0.82, 0.24, 1.02);
  lowerGum.position.set(0, -0.004, 0.048);
  lowerOralGroup.add(lowerGum);

  const lowerFangGeo = new THREE.ConeGeometry(0.0024, 0.0095, 10);
  for (const sx of [-1, 1]) {
    const lFang = new THREE.Mesh(lowerFangGeo, toothMat);
    lFang.position.set(sx * 0.015, 0.002, 0.070);
    lowerOralGroup.add(lFang);
  }

  const tonguePivot = new THREE.Group();
  tonguePivot.position.set(0, -0.001, 0.036);
  lowerOralGroup.add(tonguePivot);

  const tongueGeo = new THREE.CapsuleGeometry(0.0115, 0.028, 8, 16);
  tongueGeo.rotateX(Math.PI * 0.5);
  tongueGeo.scale(1.12, 0.22, 1.0);
  const tongueMesh = new THREE.Mesh(tongueGeo, tongueMat);
  tongueMesh.position.set(0, 0.001, 0.018);
  tonguePivot.add(tongueMesh);

  // Wet Sculpted Rhinarium (Nose Leather) + Dark Lip Liner
  const noseMaterial = new THREE.MeshPhysicalMaterial({
    color: COAT_PRESETS[0].noseColor,
    roughness: 0.22,
    metalness: 0.0,
    clearcoat: 0.88,
    clearcoatRoughness: 0.16
  });
  const noseRimMaterial = new THREE.MeshStandardMaterial({
    color: COAT_PRESETS[0].noseRimColor,
    roughness: 0.65
  });

  const noseGeo = buildRhinariumGeometry();
  const noseMesh = new THREE.Mesh(noseGeo, noseMaterial);
  noseMesh.position.set(0, 0.007, 0.209);
  noseMesh.rotation.x = -0.09;
  noseMesh.userData.isCatSurface = true;
  noseMesh.userData.partName = 'nose';
  headBone.add(noseMesh);

  // =========================================================================
  // 7. CUPPED PINNAE (EARS) WITH INNER SKIN & WHITE EAR FURNISHINGS
  // =========================================================================
  const innerEarMaterial = new THREE.MeshPhysicalMaterial({
    color: COAT_PRESETS[0].innerEarColor,
    vertexColors: true,
    roughness: 0.72,
    metalness: 0.0,
    clearcoat: 0.06,
    side: THREE.DoubleSide
  });

  const earTuftMaterial = new THREE.MeshStandardMaterial({
    color: 0xf7f3eb,
    roughness: 0.58,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide
  });

  const setupCuppedEar = (earBone, sideSign, label) => {
    const earWorld = new THREE.Vector3();
    earBone.getWorldPosition(earWorld);
    const { earFurGeo, innerSkinGeo } = buildCuppedCatEarGeometries(sideSign, earWorld);

    // Natural alert ear angle: canted slightly outward & forward
    earBone.rotation.z = -sideSign * 0.22;
    earBone.rotation.y = sideSign * 0.24;
    earBone.rotation.x = 0.10;
    restPose.set(earBone.name, {
      pos: earBone.position.clone(),
      quat: earBone.quaternion.clone(),
      rot: earBone.rotation.clone()
    });

    createMultiShellFurObject({
      geometry: earFurGeo,
      furMaterials,
      parent: earBone,
      name: label
    });

    const innerSkin = new THREE.Mesh(innerSkinGeo, innerEarMaterial);
    innerSkin.receiveShadow = false;
    earBone.add(innerSkin);

    // Fine upward-fanning feline ear-furnishing wisps growing from medial ear base
    for (let w = 0; w < 9; w++) {
      const frac = w / 8;
      const startY = 0.010 + frac * 0.044;
      const startX = -sideSign * 0.032 * (1 - frac * 0.42);
      const endX = startX + sideSign * (0.036 - frac * 0.010);
      const endY = startY + 0.024 + (1 - frac) * 0.008;
      const wispCurve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(startX, startY, 0.004),
        new THREE.Vector3((startX + endX) * 0.5, (startY + endY) * 0.5 + 0.005, 0.009),
        new THREE.Vector3(endX, endY, 0.005)
      );
      const wispGeo = new THREE.TubeGeometry(wispCurve, 10, 0.00062 * (1 - frac * 0.35), 5, false);
      const wisp = new THREE.Mesh(wispGeo, earTuftMaterial);
      earBone.add(wisp);
    }
  };

  setupCuppedEar(earLBone, 1, 'earL');
  setupCuppedEar(earRBone, -1, 'earR');

  // =========================================================================
  // 8. MULTI-LAYER OPTICAL CAT EYES, CORNEA DOMES & ANIMATED EYELIDS
  // =========================================================================
  const irisMatL = createCatIrisMaterial(EYE_PRESETS.emerald);
  const irisMatR = createCatIrisMaterial(EYE_PRESETS.emerald);
  const corneaMat = createCorneaMaterial();

  const eyelidLinerMat = new THREE.MeshStandardMaterial({
    color: 0x1e1816,
    roughness: 0.68
  });

  const buildOpticalEye = (sideSign) => {
    const socketGroup = new THREE.Group();
    // Forward-convergent domestic cat eyes ~3.1cm behind nose tip
    socketGroup.position.set(sideSign * 0.049, 0.040, 0.146);
    socketGroup.rotation.y = sideSign * 0.17;
    socketGroup.rotation.z = -sideSign * 0.08;
    headBone.add(socketGroup);

    // Eyeball gaze gimbal (rotates for saccades & tracking!)
    const eyeballGroup = new THREE.Group();
    socketGroup.add(eyeballGroup);

    const eyeRadius = 0.0285;

    // Concave iris disc recessed slightly behind cornea plane
    const irisGeo = new THREE.CircleGeometry(eyeRadius * 0.96, 48);
    const irisPos = irisGeo.getAttribute('position');
    for (let i = 0; i < irisPos.count; i++) {
      const ix = irisPos.getX(i);
      const iy = irisPos.getY(i);
      const nr = Math.min(1, Math.hypot(ix, iy) / (eyeRadius * 0.96));
      irisPos.setZ(i, -0.0038 * (1.0 - nr * nr));
    }
    irisGeo.computeVertexNormals();

    const irisMesh = new THREE.Mesh(irisGeo, sideSign > 0 ? irisMatL : irisMatR);
    irisMesh.position.z = eyeRadius * 0.56;
    eyeballGroup.add(irisMesh);

    // Wet bulging refractive cornea dome sitting proud of iris
    const corneaGeo = new THREE.SphereGeometry(
      eyeRadius * 0.99,
      36,
      24,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.42
    );
    corneaGeo.rotateX(Math.PI * 0.5);
    const corneaMesh = new THREE.Mesh(corneaGeo, corneaMat);
    corneaMesh.position.z = eyeRadius * 0.04;
    corneaMesh.renderOrder = 4;
    eyeballGroup.add(corneaMesh);

    // Upper & Lower Animated Eyelids (dark charcoal lash margin tucked high when open, sweeping closed on blink)
    const lidGeoUpper = new THREE.SphereGeometry(
      eyeRadius * 1.02,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.52
    );
    const upperLid = new THREE.Mesh(lidGeoUpper, eyelidLinerMat);
    upperLid.rotation.x = -0.84;
    socketGroup.add(upperLid);

    const lidGeoLower = new THREE.SphereGeometry(
      eyeRadius * 1.015,
      32,
      14,
      0,
      Math.PI * 2,
      Math.PI * 0.52,
      Math.PI * 0.48
    );
    const lowerLid = new THREE.Mesh(lidGeoLower, eyelidLinerMat);
    lowerLid.rotation.x = 0.66;
    socketGroup.add(lowerLid);

    return { socketGroup, eyeballGroup, upperLid, lowerLid };
  };

  const eyeL = buildOpticalEye(1);
  const eyeR = buildOpticalEye(-1);

  // =========================================================================
  // 9. VIBRISSAE (MYSTACIAL & SUPERCILIARY WHISKERS)
  // =========================================================================
  const whiskerMaterial = new THREE.MeshPhysicalMaterial({
    color: COAT_PRESETS[0].whiskerColor,
    roughness: 0.30,
    metalness: 0.0,
    transparent: true,
    opacity: 0.88,
    clearcoat: 0.5
  });

  const buildTaperedWhiskerGeometry = (p0, p1, p2, baseRadius = 0.0014) => {
    const curve = new THREE.QuadraticBezierCurve3(p0, p1, p2);
    const segs = 14;
    const radSegs = 5;
    const frames = curve.computeFrenetFrames(segs, false);
    const pts = curve.getPoints(segs);
    const pos = [];
    const idx = [];
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      const r = baseRadius * (1.0 - t * 0.86);
      const N = frames.normals[i];
      const B = frames.binormals[i];
      for (let j = 0; j < radSegs; j++) {
        const a = (j / radSegs) * Math.PI * 2;
        const ca = Math.cos(a);
        const sa = Math.sin(a);
        pos.push(
          pts[i].x + (N.x * ca + B.x * sa) * r,
          pts[i].y + (N.y * ca + B.y * sa) * r,
          pts[i].z + (N.z * ca + B.z * sa) * r
        );
      }
    }
    for (let i = 0; i < segs; i++) {
      for (let j = 0; j < radSegs; j++) {
        const nj = (j + 1) % radSegs;
        const a = i * radSegs + j;
        const b = (i + 1) * radSegs + j;
        const c = (i + 1) * radSegs + nj;
        const d = i * radSegs + nj;
        idx.push(a, b, c, a, c, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };

  const whiskerGroupL = new THREE.Group();
  const whiskerGroupR = new THREE.Group();
  whiskerGroupL.position.set(0.032, -0.008, 0.178);
  whiskerGroupR.position.set(-0.032, -0.008, 0.178);
  headBone.add(whiskerGroupL);
  headBone.add(whiskerGroupR);

  // 3 staggered mystacial rows x 4 delicate tapered vibrissae per side
  for (const [sideSign, wGroup] of [[1, whiskerGroupL], [-1, whiskerGroupR]]) {
    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 4; col++) {
        const stagger = (row % 2) * 0.004;
        const ry = (row - 1) * 0.0072;
        const rz = (col - 1.5) * 0.009 + stagger;
        const len = 0.135 + col * 0.022 + (2 - row) * 0.010;
        const fanLift = (row - 1.2) * 0.016;
        const droop = -0.026 - (2 - row) * 0.015 + fanLift;
        const sweepBack = -0.026 - col * 0.020;

        const wGeo = buildTaperedWhiskerGeometry(
          new THREE.Vector3(sideSign * (0.005 + col * 0.002), ry, rz),
          new THREE.Vector3(sideSign * len * 0.52, ry + 0.008 + fanLift * 0.35, rz + sweepBack * 0.32),
          new THREE.Vector3(sideSign * len, ry + droop, rz + sweepBack),
          0.00062
        );
        wGroup.add(new THREE.Mesh(wGeo, whiskerMaterial));
      }
    }

    // 3 superciliary (eyebrow) vibrissae above each inner brow
    for (let b = 0; b < 3; b++) {
      const browGeo = buildTaperedWhiskerGeometry(
        new THREE.Vector3(sideSign * (0.034 + b * 0.006), 0.072, 0.158 - b * 0.005),
        new THREE.Vector3(sideSign * (0.062 + b * 0.011), 0.118 + b * 0.007, 0.146),
        new THREE.Vector3(sideSign * (0.095 + b * 0.014), 0.132 + b * 0.005, 0.118),
        0.00050
      );
      headBone.add(new THREE.Mesh(browGeo, whiskerMaterial));
    }
  }

  // =========================================================================
  // 10. OPTIONAL LEATHER COLLAR & SWINGING BRASS BELL
  // =========================================================================
  const collarGroup = new THREE.Group();
  collarGroup.name = 'collar';
  // TorusGeometry normal is +Z; -0.72 rad aligns torus hole concentrically along neck axis (0, +0.67, +0.74)
  collarGroup.position.set(0, 0.016, 0.022);
  collarGroup.rotation.x = -0.72;
  neckBone.add(collarGroup);

  const collarLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x8a3028,
    roughness: 0.42,
    metalness: 0.06
  });
  const brassMat = new THREE.MeshStandardMaterial({
    color: 0xf2c65e,
    roughness: 0.18,
    metalness: 0.92
  });

  const collarRingGeo = new THREE.TorusGeometry(0.098, 0.011, 14, 44);
  collarRingGeo.scale(0.94, 1.04, 1.0);
  const collarMesh = new THREE.Mesh(collarRingGeo, collarLeatherMat);
  collarMesh.castShadow = true;
  collarGroup.add(collarMesh);

  const bellPivot = new THREE.Group();
  bellPivot.position.set(0, -0.104, 0.008);
  bellPivot.rotation.x = 0.72;
  collarGroup.add(bellPivot);

  const loopGeo = new THREE.TorusGeometry(0.0065, 0.0018, 8, 16);
  const bellLoop = new THREE.Mesh(loopGeo, brassMat);
  bellPivot.add(bellLoop);

  const bellBodyGeo = new THREE.SphereGeometry(0.0155, 20, 16);
  const bellBody = new THREE.Mesh(bellBodyGeo, brassMat);
  bellBody.position.set(0, -0.016, 0);
  bellBody.castShadow = true;
  bellPivot.add(bellBody);

  // =========================================================================
  // 11. RUNTIME APPEARANCE & MATERIAL SETTERS
  // =========================================================================
  let currentEyePresetKey = 'emerald';

  function setEyePreset(presetKey) {
    const preset = EYE_PRESETS[presetKey] || EYE_PRESETS.emerald;
    currentEyePresetKey = presetKey;
    if (preset.heterochromia) {
      irisMatL.uniforms.uInnerColor.value.setHex(preset.left.inner);
      irisMatL.uniforms.uOuterColor.value.setHex(preset.left.outer);
      irisMatL.uniforms.uLimbusColor.value.setHex(preset.left.limbus);
      irisMatR.uniforms.uInnerColor.value.setHex(preset.right.inner);
      irisMatR.uniforms.uOuterColor.value.setHex(preset.right.outer);
      irisMatR.uniforms.uLimbusColor.value.setHex(preset.right.limbus);
    } else {
      irisMatL.uniforms.uInnerColor.value.setHex(preset.inner);
      irisMatL.uniforms.uOuterColor.value.setHex(preset.outer);
      irisMatL.uniforms.uLimbusColor.value.setHex(preset.limbus);
      irisMatR.uniforms.uInnerColor.value.setHex(preset.inner);
      irisMatR.uniforms.uOuterColor.value.setHex(preset.outer);
      irisMatR.uniforms.uLimbusColor.value.setHex(preset.limbus);
    }
  }

  function setCoatPreset(coatIdOrKey, syncDefaultEyes = true) {
    const preset = typeof coatIdOrKey === 'string'
      ? (COAT_PRESETS.find((p) => p.key === coatIdOrKey) || COAT_PRESETS[0])
      : (COAT_PRESETS[coatIdOrKey] || COAT_PRESETS[0]);
    furUniforms.uCoatId.value = preset.id;
    furUniforms.uRimColor.value.setHex(preset.rimTint);
    noseMaterial.color.setHex(preset.noseColor);
    noseRimMaterial.color.setHex(preset.noseRimColor);
    eyelidLinerMat.color.setHex(0x1b1615);
    pawPadMaterial.color.setHex(preset.pawPadColor);
    innerEarMaterial.color.setHex(preset.innerEarColor);
    whiskerMaterial.color.setHex(preset.whiskerColor);
    if (syncDefaultEyes && preset.defaultEyePreset) {
      setEyePreset(preset.defaultEyePreset);
    }
    return preset;
  }

  function setFurPlushness(scale) {
    furUniforms.uFurScale.value = scale;
  }

  function setPupilDilation(dilation) {
    irisMatL.uniforms.uPupilDilation.value = dilation;
    irisMatR.uniforms.uPupilDilation.value = dilation;
  }

  function setCollarVisible(visible) {
    collarGroup.visible = visible;
  }

  function updateEyeLighting(sunDir, sunColorHex, skyColorHex, envBrightness = 1.0) {
    irisMatL.uniforms.uLightDir.value.copy(sunDir);
    irisMatR.uniforms.uLightDir.value.copy(sunDir);
    irisMatL.uniforms.uEnvBrightness.value = envBrightness;
    irisMatR.uniforms.uEnvBrightness.value = envBrightness;
    corneaMat.uniforms.uSunDir.value.copy(sunDir);
    corneaMat.uniforms.uSunColor.value.setHex(sunColorHex);
    corneaMat.uniforms.uSkyColor.value.setHex(skyColorHex);
  }

  setCoatPreset(0, true);

  // Collect raycastable Shell-0 base meshes + nose for fast 60fps tactile hit-testing
  const interactiveMeshes = [];
  catGroup.traverse((obj) => {
    if (obj.isMesh && obj.userData.isCatSurface) {
      interactiveMeshes.push(obj);
    }
  });

  return {
    catGroup,
    skeleton,
    bones: {
      root: rootBone,
      pelvis: pelvisBone,
      spine1: spine1Bone,
      spine2: spine2Bone,
      chest: chestBone,
      neck: neckBone,
      head: headBone,
      jaw: jawBone,
      earL: earLBone,
      earR: earRBone,
      tail: tailBones,
      frontL,
      frontR,
      hindL,
      hindR
    },
    restPose,
    eyes: {
      left: eyeL,
      right: eyeR,
      irisMatL,
      irisMatR,
      corneaMat
    },
    whiskers: {
      left: whiskerGroupL,
      right: whiskerGroupR
    },
    mouth: {
      tonguePivot,
      tongueMesh,
      setOralVisible: (vis) => {
        upperOralGroup.visible = vis;
        lowerOralGroup.visible = vis;
      }
    },
    clawGroups,
    collar: {
      group: collarGroup,
      bellPivot
    },
    furUniforms,
    interactiveMeshes,
    setCoatPreset,
    setEyePreset,
    getEyePresetKey: () => currentEyePresetKey,
    setFurPlushness,
    setPupilDilation,
    setCollarVisible,
    updateEyeLighting
  };
}
