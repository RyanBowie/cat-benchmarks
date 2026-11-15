import * as THREE from 'three';

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function damp(current, target, lambda, dt) {
  return THREE.MathUtils.lerp(current, target, 1 - Math.exp(-lambda * dt));
}

function smoothstep(e0, e1, x) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
}

export class CatAnimator {
  constructor(cat, callbacks = {}) {
    this.cat = cat;
    this.callbacks = callbacks; // { onMeow, onTrill, onPurrChange, onStep, onBellJingle, onEatTreat, onBatToy }

    this.time = 0;
    this.state = 'idle'; // 'idle' | 'walk' | 'sit' | 'sleep' | 'stretch' | 'groom' | 'knead' | 'pounce'
    this.stateTime = 0;
    this.lockedBehavior = false; // true when user explicitly picked a pose button

    // World locomotion state (catGroup in XZ plane)
    this.worldPos = new THREE.Vector3(0, 0, 0);
    this.heading = 0; // radians around Y (0 = facing +Z)
    this.speed = 0;
    this.gaitPhase = 0;
    this.turnRate = 0;
    this.prevFootDown = [true, true, true, true];

    // Navigation target (floor click, laser pointer, yarn ball, or treat)
    this.moveTarget = null; // { pos: Vector3, mode: 'walk'|'trot'|'stalk', arrivalState: 'idle'|'eat'|'bat'|'pounce' }
    this.activeTreat = null;
    this.activeYarn = null;
    this.laserActive = false;
    this.laserWorldPos = new THREE.Vector3(0, 0, 0.8);
    this.pounceStartPos = new THREE.Vector3();
    this.pounceEndPos = new THREE.Vector3();

    // Smooth blend weights for full-body poses (sum normalized or priority damped)
    this.weights = {
      sit: 0,
      sleep: 0,
      stretch: 0,
      groom: 0,
      knead: 0,
      crouch: 0
    };

    // Gaze & curiosity tracking
    this.gazeWorldTarget = new THREE.Vector3(0, 0.65, 2.2);
    this.hasExplicitGaze = false;
    this.headYaw = 0;
    this.headPitch = 0;
    this.headRoll = 0;
    this.eyeYaw = 0;
    this.eyePitch = 0;
    this.idleLookTimer = 2.0;
    this.idleLookOffset = new THREE.Vector3(0, 0.65, 2.2);

    // Blinking & eyelids
    this.blinkTimer = 2.8;
    this.blinkProgress = -1;
    this.eyeSquint = 0; // 0 = alert open, 1 = happy/sleepy closed

    // Ears & Whiskers
    this.earFlickL = 0;
    this.earFlickR = 0;
    this.earFlickTimer = 3.5;
    this.earRelax = 0;
    this.whiskerForward = 0;

    // Vocalization & Mouth
    this.meowTimer = -1;
    this.meowDuration = 0.78;
    this.jawOpen = 0;

    // Tactile petting & happiness state
    this.isBeingPetted = false;
    this.petZone = null; // 'chin' | 'head' | 'back' | 'nose'
    this.petPointWorld = new THREE.Vector3();
    this.prevPetPointWorld = new THREE.Vector3();
    this.petIntensity = 0;
    this.happiness = 0.25; // 0..1 drives purr engine & tail lift
    this.purrLevel = 0;
    this.elevatorButt = 0;
    this.chinLeanPitch = 0;
    this.chinLeanRoll = 0;

    // Lighting / pupil control
    this.ambientLightLevel = 0.75; // 0 = dark night -> 1 = bright sun
    this.manualPupilOverride = null; // null = automatic biological response, or [0.07..0.82]
    this.currentPupil = 0.26;

    // Collar bell physics pendulum
    this.bellAngleX = 0;
    this.bellVelX = 0;
    this.bellAngleZ = 0;
    this.bellVelZ = 0;

    // Autonomous idle variety timer
    this.autoBehaviorTimer = 15.0;

    // Scratch vectors to avoid GC churn
    this._tmpVecA = new THREE.Vector3();
    this._tmpVecB = new THREE.Vector3();
    this._invHeadMat = new THREE.Matrix4();
  }

  // ===========================================================================
  // PUBLIC INTERACTION & BEHAVIOR COMMANDS
  // ===========================================================================
  setBehavior(newState, userInitiated = true) {
    if (newState === 'walk_roam') {
      const angle = Math.random() * Math.PI * 2;
      const dist = 0.65 + Math.random() * 0.75;
      this.walkTo(
        new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * dist),
        'walk',
        'idle'
      );
      this.lockedBehavior = false;
      return;
    }

    this.moveTarget = null;
    this.state = newState;
    this.stateTime = 0;
    this.lockedBehavior = userInitiated && ['sit', 'sleep', 'knead', 'groom'].includes(newState);
  }

  walkTo(targetWorldVec, mode = 'walk', arrivalState = 'idle') {
    const clamped = targetWorldVec.clone();
    clamped.y = 0;
    if (clamped.length() > 1.75) {
      clamped.setLength(1.75);
    }
    this.moveTarget = {
      pos: clamped,
      mode,
      arrivalState
    };
    if (this.state !== 'pounce') {
      this.state = 'walk';
      this.stateTime = 0;
    }
    this.lockedBehavior = false;
  }

  triggerMeow() {
    if (this.state === 'sleep') {
      this.setBehavior('sit', false);
    }
    this.meowTimer = 0;
    this.meowDuration = 0.72 + Math.random() * 0.22;
    this.earFlickL = 0.32;
    this.earFlickR = 0.28;
    if (this.callbacks.onMeow) {
      this.callbacks.onMeow(this.meowDuration);
    }
  }

  boopNose() {
    this.blinkProgress = 0;
    this.earFlickL = 0.48;
    this.earFlickR = 0.48;
    this.whiskerForward = 0.85;
    this.happiness = clamp(this.happiness + 0.14, 0, 1);
    if (this.state === 'sleep') {
      this.setBehavior('idle', false);
    }
    if (this.callbacks.onTrill) {
      this.callbacks.onTrill();
    }
  }

  beginOrMovePetting(hitPoint, partName, dt) {
    const { furUniforms, bones } = this.cat;

    if (!this.isBeingPetted) {
      this.prevPetPointWorld.copy(hitPoint);
    }
    const strokeDelta = this._tmpVecA.subVectors(hitPoint, this.prevPetPointWorld);
    const strokeDist = strokeDelta.length();
    const strokeDir = strokeDist > 0.0005 ? strokeDelta.clone().normalize() : new THREE.Vector3(0, 0, -1);
    this.prevPetPointWorld.copy(hitPoint);
    this.petPointWorld.copy(hitPoint);

    this.isBeingPetted = true;
    this.petIntensity = clamp(this.petIntensity + dt * 4.5 + strokeDist * 6.0, 0.35, 1.0);

    // Update GPU fur shell tactile brush ripple
    furUniforms.uBrushPos.value.copy(hitPoint);
    furUniforms.uBrushDir.value.lerp(strokeDir, 0.35).normalize();
    furUniforms.uBrushStrength.value = damp(furUniforms.uBrushStrength.value, 1.0, 18, dt);

    // Classify anatomical petting zone
    const headWorld = this._tmpVecB;
    bones.head.getWorldPosition(headWorld);
    if (partName === 'jaw' || (partName === 'head' && hitPoint.y < headWorld.y + 0.015)) {
      this.petZone = 'chin';
    } else if (partName === 'head' || partName === 'earL' || partName === 'earR') {
      this.petZone = 'head';
    } else if (partName === 'nose') {
      this.petZone = 'nose';
    } else {
      this.petZone = 'back';
    }

    this.happiness = clamp(this.happiness + dt * 0.28, 0, 1);
  }

  endPetting() {
    this.isBeingPetted = false;
    this.petZone = null;
  }

  setLaserPointer(active, worldPos = null) {
    this.laserActive = active;
    if (worldPos) {
      this.laserWorldPos.copy(worldPos);
      this.laserWorldPos.y = 0;
    }
    if (active && (this.state === 'sleep' || this.state === 'groom' || this.state === 'knead')) {
      this.lockedBehavior = false;
      this.state = 'idle';
      this.stateTime = 0;
    }
  }

  notifyTreatSpawned(treatObj) {
    this.activeTreat = treatObj;
    this.lockedBehavior = false;
    if (this.state === 'sleep') {
      this.state = 'idle';
    }
    this.earFlickL = 0.45;
    this.earFlickR = 0.45;
    if (this.callbacks.onTrill) {
      this.callbacks.onTrill();
    }
  }

  notifyYarnSpawned(yarnObj) {
    this.activeYarn = yarnObj;
    if (this.state === 'sleep') {
      this.lockedBehavior = false;
      this.state = 'idle';
    }
  }

  setGazeTarget(worldPos, active = true) {
    this.hasExplicitGaze = active;
    if (worldPos) {
      this.gazeWorldTarget.copy(worldPos);
    }
  }

  getMoodStatus() {
    if (this.laserActive) {
      return this.state === 'pounce'
        ? 'Hunting • Pouncing on laser!'
        : 'Playful • Locked onto laser dot';
    }
    if (this.isBeingPetted) {
      if (this.petZone === 'chin') return 'Blissful • Leaning into chin scratches (Purring 26 Hz)';
      if (this.petZone === 'head') return 'Affectionate • Enjoying head pets (Purring)';
      return 'Happy • Arching into back strokes (Purring)';
    }
    switch (this.state) {
      case 'sleep':
        return 'Peaceful • Curled up napping in the warm light';
      case 'stretch':
        return 'Refreshed • Big feline bow stretch & yawn!';
      case 'groom':
        return 'Content • Washing face & ears with front paw';
      case 'knead':
        return 'Cozy • Making biscuits & purring softly';
      case 'sit':
        return this.purrLevel > 0.25 ? 'Content • Sitting pretty & purring' : 'Attentive • Sitting gracefully';
      case 'walk':
        return this.activeTreat ? 'Excited • Trotting over for a treat!' : 'Curious • Exploring the rug';
      case 'pounce':
        return 'Playful • Pouncing!';
      default:
        return this.purrLevel > 0.25 ? 'Affectionate • Relaxed & purring' : 'Curious • Watching attentively';
    }
  }

  // ===========================================================================
  // MAIN FRAME UPDATE
  // ===========================================================================
  update(rawDt) {
    const dt = Math.min(rawDt, 0.05);
    this.time += dt;
    this.stateTime += dt;
    this.cat.furUniforms.uTime.value = this.time;

    // 1. Reset all bones to clean bind rest pose before layering procedural channels
    this._resetToRestPose();

    // 2. High-level AI goal arbitration (Laser, Treat, Yarn, Autonomous Idle)
    this._updateBehaviorAI(dt);

    // 3. Smoothly damp full-body pose weights
    const wTarget = {
      sit: this.state === 'sit' || this.state === 'groom' ? 1 : 0,
      sleep: this.state === 'sleep' ? 1 : 0,
      stretch: this.state === 'stretch' ? 1 : 0,
      groom: this.state === 'groom' ? 1 : 0,
      knead: this.state === 'knead' ? 1 : 0,
      crouch: (this.laserActive && this.state !== 'pounce') || (this.state === 'pounce' && this.stateTime < 0.68) ? 1 : 0
    };
    for (const k of Object.keys(this.weights)) {
      const rate = k === 'sleep' || k === 'sit' ? 5.2 : 6.5;
      this.weights[k] = damp(this.weights[k], wTarget[k], rate, dt);
    }

    // 4. Locomotion & Pounce World Movement + 4-Beat Digitigrade Gait
    this._updateLocomotionAndGait(dt);

    // 5. Full-body Poses (Sit, Sleep Curl, Big Stretch + Yawn, Paw Grooming, Biscuit Kneading, Hunter Crouch)
    this._applyBodyPoses(dt);

    // 6. Subtle Additive Life: Breathing, Petting Lean/Elevator-Butt, Sinuous Tail Waves
    this._applyBreathingAndPetting(dt);
    this._applyTailDynamics(dt);

    // 7. Neck/Head Gaze Tracking, Saccadic Eyes, Pupil Dilation, Blinking, Ears, Whiskers & Vocal Jaw
    this._applyHeadEyesAndExpression(dt);

    // 8. Collar Brass Bell Pendulum Physics
    this._updateCollarBell(dt);

    // Sync world transform onto root group
    this.cat.catGroup.position.copy(this.worldPos);
    this.cat.catGroup.rotation.y = this.heading;
  }

  _resetToRestPose() {
    const { skeleton, restPose } = this.cat;
    for (const bone of skeleton.bones) {
      const rest = restPose.get(bone.name);
      if (rest) {
        bone.position.copy(rest.pos);
        bone.rotation.copy(rest.rot);
      }
    }
  }

  _updateBehaviorAI(dt) {
    // Priority 1: Laser pointer active -> stalk & pounce!
    if (this.laserActive && this.state !== 'pounce') {
      const dist = this.worldPos.distanceTo(this.laserWorldPos);
      if (dist > 0.58) {
        this.moveTarget = {
          pos: this.laserWorldPos.clone(),
          mode: dist > 1.05 ? 'trot' : 'stalk',
          arrivalState: 'pounce'
        };
        this.state = 'walk';
      } else if (dist > 0.16) {
        // Close enough to wiggle butt & pounce!
        this._startPounce(this.laserWorldPos);
      } else {
        this.moveTarget = null;
        this.state = 'idle';
      }
      return;
    }

    // Priority 2: Active treat on the floor -> trot over & eat!
    if (this.activeTreat && this.activeTreat.active && this.state !== 'pounce') {
      const treatFloor = new THREE.Vector3(this.activeTreat.mesh.position.x, 0, this.activeTreat.mesh.position.z);
      const mouthStop = treatFloor.clone().sub(
        treatFloor.clone().sub(this.worldPos).setLength(0.42)
      );
      const distToStop = this.worldPos.distanceTo(mouthStop);
      if (distToStop > 0.10) {
        this.moveTarget = { pos: mouthStop, mode: 'trot', arrivalState: 'eat' };
        this.state = 'walk';
      } else {
        // Eat treat!
        this.moveTarget = null;
        this.state = 'idle';
        this.jawOpen = 0.34;
        this.meowTimer = 0;
        this.meowDuration = 0.45;
        this.happiness = clamp(this.happiness + 0.25, 0, 1);
        if (this.callbacks.onEatTreat) {
          this.callbacks.onEatTreat(this.activeTreat);
        }
        this.activeTreat = null;
      }
      return;
    }

    // Priority 3: Moving yarn ball nearby -> chase & bat it with front paw!
    if (this.activeYarn && this.activeYarn.active && !this.lockedBehavior && this.state !== 'sleep' && this.state !== 'pounce') {
      const yarnFloor = new THREE.Vector3(this.activeYarn.mesh.position.x, 0, this.activeYarn.mesh.position.z);
      const yarnSpeed = this.activeYarn.velocity.length();
      const dist = this.worldPos.distanceTo(yarnFloor);
      if (yarnSpeed > 0.12 && dist > 0.46) {
        const approach = yarnFloor.clone().sub(yarnFloor.clone().sub(this.worldPos).setLength(0.40));
        this.moveTarget = { pos: approach, mode: 'trot', arrivalState: 'bat' };
        this.state = 'walk';
        return;
      } else if (dist < 0.54 && yarnSpeed > 0.04 && Math.random() < dt * 2.2) {
        if (this.callbacks.onBatToy) {
          const pushDir = yarnFloor.clone().sub(this.worldPos).setY(0).normalize();
          pushDir.applyAxisAngle(new THREE.Vector3(0, 1, 0), (Math.random() - 0.5) * 0.9);
          this.callbacks.onBatToy(this.activeYarn, pushDir);
        }
      }
    }

    // Auto-complete timed one-shot animations
    if (this.state === 'stretch' && this.stateTime > 5.0) {
      this.state = 'idle';
      this.stateTime = 0;
    }
    if (this.state === 'groom' && !this.lockedBehavior && this.stateTime > 6.5) {
      this.state = 'sit';
      this.stateTime = 0;
    }

    // Autonomous lifelike variety when unlocked & not being petted
    if (!this.lockedBehavior && !this.isBeingPetted && (this.state === 'idle' || this.state === 'sit')) {
      this.autoBehaviorTimer -= dt;
      if (this.autoBehaviorTimer <= 0) {
        this.autoBehaviorTimer = 9.0 + Math.random() * 8.0;
        const roll = Math.random();
        if (this.state === 'idle') {
          if (roll < 0.35) this.setBehavior('sit', false);
          else if (roll < 0.58) this.setBehavior('stretch', false);
          else if (roll < 0.80) this.setBehavior('walk_roam', false);
          else this.setBehavior('knead', false);
        } else if (this.state === 'sit') {
          if (roll < 0.45) this.setBehavior('groom', false);
          else if (roll < 0.72) this.setBehavior('idle', false);
          else this.setBehavior('stretch', false);
        }
      }
    }
  }

  _startPounce(targetPos) {
    this.state = 'pounce';
    this.stateTime = 0;
    this.moveTarget = null;
    this.pounceStartPos.copy(this.worldPos);
    // Land front paws right onto target!
    const dir = targetPos.clone().sub(this.worldPos).setY(0);
    const dist = dir.length();
    if (dist > 0.01) {
      dir.normalize();
      this.pounceEndPos.copy(targetPos).addScaledVector(dir, -0.26);
    } else {
      this.pounceEndPos.copy(this.worldPos);
    }
    this.pounceEndPos.y = 0;
  }

  _updateLocomotionAndGait(dt) {
    const { bones } = this.cat;

    // Pounce sequence: 0..0.68s butt-wiggle crouch -> 0.68..1.12s parabolic leap -> 1.12..1.38s landing absorb
    if (this.state === 'pounce') {
      const t = this.stateTime;
      const toTarget = this._tmpVecA.subVectors(this.pounceEndPos, this.pounceStartPos);
      if (toTarget.lengthSq() > 0.0004) {
        const desiredHeading = Math.atan2(toTarget.x, toTarget.z);
        let diff = desiredHeading - this.heading;
        diff = Math.atan2(Math.sin(diff), Math.cos(diff));
        this.heading += diff * Math.min(1, dt * 10);
      }

      if (t < 0.68) {
        // Adorable pre-pounce butt-wiggle calibration!
        const wiggleEnv = smoothstep(0.08, 0.25, t) * (1 - smoothstep(0.55, 0.68, t));
        bones.pelvis.rotation.z += Math.sin(t * 42.0) * 0.11 * wiggleEnv;
        bones.pelvis.position.x += Math.sin(t * 42.0) * 0.012 * wiggleEnv;
        this.whiskerForward = damp(this.whiskerForward, 1.0, 12, dt);
      } else if (t < 1.12) {
        const u = (t - 0.68) / 0.44;
        this.worldPos.lerpVectors(this.pounceStartPos, this.pounceEndPos, smoothstep(0, 1, u));
        const arc = Math.sin(u * Math.PI);
        bones.root.position.y += arc * 0.22;
        bones.root.rotation.x += (u - 0.5) * 0.55;
        // Reach front paws forward & spread claws mid-air!
        bones.frontL.shoulder.rotation.x -= arc * 0.68;
        bones.frontR.shoulder.rotation.x -= arc * 0.68;
        bones.hindL.hip.rotation.x += arc * 0.45;
        bones.hindR.hip.rotation.x += arc * 0.45;
        this._setClawExtension(arc * 0.95);
      } else if (t < 1.38) {
        const landU = (t - 1.12) / 0.26;
        const dip = Math.sin(landU * Math.PI) * 0.055;
        bones.root.position.y -= dip;
        if (t - dt < 1.12 && this.callbacks.onStep) {
          this.callbacks.onStep(0.9);
        }
      } else {
        this._setClawExtension(0);
        this.state = 'idle';
        this.stateTime = 0;
      }
      this.speed = damp(this.speed, 0, 10, dt);
      return;
    }

    // Standard ground locomotion
    let desiredSpeed = 0;
    let prevHeading = this.heading;

    if (this.state === 'walk' && this.moveTarget) {
      const toGoal = this._tmpVecA.subVectors(this.moveTarget.pos, this.worldPos);
      toGoal.y = 0;
      const dist = toGoal.length();

      if (dist < 0.06) {
        const nextState = this.moveTarget.arrivalState;
        this.moveTarget = null;
        if (nextState === 'pounce') {
          this._startPounce(this.laserWorldPos);
          return;
        }
        this.state = nextState === 'sit' ? 'sit' : 'idle';
        this.stateTime = 0;
      } else {
        const targetYaw = Math.atan2(toGoal.x, toGoal.z);
        let yawDiff = targetYaw - this.heading;
        yawDiff = Math.atan2(Math.sin(yawDiff), Math.cos(yawDiff));
        const maxTurn = 4.2 * dt;
        this.heading += clamp(yawDiff, -maxTurn, maxTurn);

        const baseTopSpeed = this.moveTarget.mode === 'trot' ? 0.92 : this.moveTarget.mode === 'stalk' ? 0.44 : 0.62;
        const alignFactor = clamp(Math.cos(yawDiff), 0.25, 1.0);
        const slowDown = smoothstep(0.0, 0.32, dist);
        desiredSpeed = baseTopSpeed * alignFactor * (0.32 + 0.68 * slowDown);
      }
    }

    this.speed = damp(this.speed, desiredSpeed, 8.5, dt);
    this.turnRate = damp(this.turnRate, (this.heading - prevHeading) / Math.max(dt, 0.001), 10, dt);

    if (this.speed > 0.015) {
      this.worldPos.x += Math.sin(this.heading) * this.speed * dt;
      this.worldPos.z += Math.cos(this.heading) * this.speed * dt;

      const strideLength = 0.46;
      this.gaitPhase = (this.gaitPhase + (this.speed * dt) / strideLength) % 1.0;

      const gaitWeight = clamp(this.speed / 0.35, 0, 1);

      // Subtle double-frequency torso vertical bob & lateral hip/shoulder sway
      const bob = Math.sin(this.gaitPhase * Math.PI * 4) * 0.011 * gaitWeight;
      bones.root.position.y += bob;
      bones.pelvis.rotation.z += Math.sin(this.gaitPhase * Math.PI * 2) * 0.055 * gaitWeight;
      bones.chest.rotation.z -= Math.sin(this.gaitPhase * Math.PI * 2) * 0.045 * gaitWeight;

      // Natural spine C-curve into turns!
      const steerBend = clamp(this.turnRate * 0.065, -0.22, 0.22) * gaitWeight;
      bones.spine1.rotation.y += steerBend * 0.55;
      bones.spine2.rotation.y += steerBend * 0.75;
      bones.chest.rotation.y += steerBend * 0.85;
      bones.neck.rotation.y += steerBend * 0.65;

      // 4-Beat Diagonal Feline Footfall Sequence: HL(0.0), FL(0.25), HR(0.50), FR(0.75)
      this._animateForelimbStep(bones.frontL, (this.gaitPhase + 0.25) % 1.0, gaitWeight, 1);
      this._animateForelimbStep(bones.frontR, (this.gaitPhase + 0.75) % 1.0, gaitWeight, 3);
      this._animateHindlimbStep(bones.hindL, (this.gaitPhase + 0.00) % 1.0, gaitWeight, 0);
      this._animateHindlimbStep(bones.hindR, (this.gaitPhase + 0.50) % 1.0, gaitWeight, 2);
    }
  }

  _animateForelimbStep(limb, phase, weight, footIdx) {
    // phase 0.0 .. 0.62 = stance (planted sweeping back), 0.62 .. 1.0 = swing (lifted reaching forward)
    const stanceEnd = 0.62;
    let swingAmount = 0;
    let lift = 0;
    let wristCurl = 0;
    let scapulaPump = 0;

    if (phase < stanceEnd) {
      const u = phase / stanceEnd; // 0 (front touch) -> 1 (toe-off back)
      swingAmount = THREE.MathUtils.lerp(-0.34, 0.34, u);
      // Scapula blade rises smoothly at mid-stance as limb supports body weight!
      scapulaPump = Math.sin(u * Math.PI) * 0.017;
      if (!this.prevFootDown[footIdx] && this.callbacks.onStep) {
        this.callbacks.onStep(0.35 * weight);
      }
      this.prevFootDown[footIdx] = true;
    } else {
      const u = (phase - stanceEnd) / (1.0 - stanceEnd); // 0 -> 1 forward swing
      swingAmount = THREE.MathUtils.lerp(0.34, -0.34, smoothstep(0, 1, u));
      lift = Math.sin(u * Math.PI);
      wristCurl = Math.sin(u * Math.PI * 0.9) * 0.58;
      scapulaPump = -0.008 * lift;
      this.prevFootDown[footIdx] = false;
    }

    limb.scapula.position.y += scapulaPump * weight;
    limb.shoulder.rotation.x += (swingAmount - lift * 0.28) * weight;
    limb.elbow.rotation.x += (-lift * 0.52) * weight;
    limb.wrist.rotation.x += wristCurl * weight;
    // Keep paw flat during stance; relax naturally during swing
    const totalRot = limb.shoulder.rotation.x + limb.elbow.rotation.x + limb.wrist.rotation.x;
    const restRot = 0;
    limb.paw.rotation.x -= (totalRot - restRot) * (1.0 - lift * 0.65) * weight;
  }

  _animateHindlimbStep(limb, phase, weight, footIdx) {
    const stanceEnd = 0.62;
    let swingAmount = 0;
    let lift = 0;

    if (phase < stanceEnd) {
      const u = phase / stanceEnd;
      swingAmount = THREE.MathUtils.lerp(-0.32, 0.34, u);
      if (!this.prevFootDown[footIdx] && this.callbacks.onStep) {
        this.callbacks.onStep(0.32 * weight);
      }
      this.prevFootDown[footIdx] = true;
    } else {
      const u = (phase - stanceEnd) / (1.0 - stanceEnd);
      swingAmount = THREE.MathUtils.lerp(0.34, -0.32, smoothstep(0, 1, u));
      lift = Math.sin(u * Math.PI);
      this.prevFootDown[footIdx] = false;
    }

    limb.hip.rotation.x += (swingAmount - lift * 0.32) * weight;
    limb.knee.rotation.x += (lift * 0.56) * weight;
    limb.hock.rotation.x += (-lift * 0.42 + Math.max(0, swingAmount) * 0.25) * weight;
    const totalRot = limb.hip.rotation.x + limb.knee.rotation.x + limb.hock.rotation.x;
    limb.paw.rotation.x -= totalRot * (1.0 - lift * 0.6) * weight;
  }

  _applyBodyPoses(dt) {
    const { bones, mouth } = this.cat;
    const { sit, sleep, stretch, groom, knead, crouch } = this.weights;

    // -------------------------------------------------------------------------
    // A. SIT POSE (Regal upright chest, straight front legs, haunches & hocks flat on rug)
    // -------------------------------------------------------------------------
    if (sit > 0.001) {
      bones.root.position.y -= 0.205 * sit;
      bones.root.position.z -= 0.040 * sit;
      bones.root.rotation.x -= 0.68 * sit; // Pelvis settles onto rug while chest stays proud!

      bones.spine1.rotation.x += 0.10 * sit;
      bones.spine2.rotation.x += 0.12 * sit;
      bones.chest.rotation.x += 0.14 * sit;
      bones.neck.rotation.x += 0.28 * sit;
      bones.head.rotation.x += 0.06 * sit;

      // Fold hind legs so hocks & hind paws rest completely flat along the rug (y ~ 0.026)
      for (const hLimb of [bones.hindL, bones.hindR]) {
        hLimb.hip.rotation.x -= 0.24 * sit;
        hLimb.knee.rotation.x += 1.41 * sit;
        hLimb.hock.rotation.x -= 1.62 * sit;
        hLimb.paw.rotation.x += 0.44 * sit;
      }

      // Keep front legs sleek & vertical directly beneath chest with paws flat at y ~ 0.024
      for (const [sx, fLimb] of [[1, bones.frontL], [-1, bones.frontR]]) {
        fLimb.scapula.position.y += 0.036 * sit;
        fLimb.scapula.position.x -= sx * 0.016 * sit;
        fLimb.shoulder.rotation.x += 0.34 * sit;
        fLimb.elbow.rotation.x -= 0.08 * sit;
        fLimb.wrist.rotation.x += 0.06 * sit;
        fLimb.paw.rotation.x += 0.02 * sit;
      }
    }

    // -------------------------------------------------------------------------
    // B. GROOM POSE (Additive over Sit: lifts right front paw right up to cheek & ear!)
    // -------------------------------------------------------------------------
    if (groom > 0.001) {
      const cyc = this.stateTime * 2.6;
      const wipeWave = 0.5 + 0.5 * Math.sin(cyc);
      const rArm = bones.frontR;
      rArm.scapula.position.y += 0.035 * groom;
      rArm.scapula.position.z += 0.025 * groom;
      rArm.shoulder.rotation.x -= (2.15 + wipeWave * 0.30) * groom;
      rArm.shoulder.rotation.z += 0.22 * groom;
      rArm.elbow.rotation.x -= (0.42 - wipeWave * 0.20) * groom;
      rArm.wrist.rotation.x += (0.58 + wipeWave * 0.22) * groom;

      // Dip & tilt head down toward the raised paw so paw strokes muzzle & right ear!
      bones.neck.rotation.x += 0.28 * groom;
      bones.head.rotation.z += 0.24 * groom;
      bones.head.rotation.x += (0.34 - wipeWave * 0.14) * groom;
      bones.head.rotation.y -= 0.22 * groom;

      const lickPhase = Math.max(0, -Math.sin(cyc));
      this.jawOpen = Math.max(this.jawOpen, lickPhase * 0.24 * groom);
      mouth.tonguePivot.position.z = 0.048 + lickPhase * 0.018 * groom;
      mouth.tonguePivot.rotation.x = lickPhase * 0.25 * groom;
    }

    // -------------------------------------------------------------------------
    // C. SLEEP / CURLED LOAF POSE (Cozy C-curl resting flat on the warm rug)
    // -------------------------------------------------------------------------
    if (sleep > 0.001) {
      bones.root.position.y -= 0.365 * sleep;
      bones.root.rotation.z += 0.14 * sleep;

      // Curl spine & neck smoothly to the right into a cozy ball
      bones.spine1.rotation.y -= 0.32 * sleep;
      bones.spine2.rotation.y -= 0.36 * sleep;
      bones.chest.rotation.y -= 0.34 * sleep;
      bones.neck.rotation.y -= 0.42 * sleep;
      bones.neck.rotation.x += 0.26 * sleep;
      bones.head.rotation.y -= 0.38 * sleep;
      bones.head.rotation.x += 0.18 * sleep;
      bones.head.rotation.z -= 0.20 * sleep;

      // Tuck forelimbs horizontally under brisket into classic cat loaf (humerus horizontal back, forearm horizontal forward, paws tucked!)
      for (const fLimb of [bones.frontL, bones.frontR]) {
        fLimb.scapula.position.y += 0.072 * sleep;
        fLimb.shoulder.rotation.x += 1.32 * sleep;
        fLimb.elbow.rotation.x -= 2.48 * sleep;
        fLimb.wrist.rotation.x += 1.95 * sleep;
      }

      // Fold hindlimbs snugly beneath flanks above y=0
      for (const hLimb of [bones.hindL, bones.hindR]) {
        hLimb.hip.rotation.x -= 0.88 * sleep;
        hLimb.knee.rotation.x += 1.85 * sleep;
        hLimb.hock.rotation.x -= 1.48 * sleep;
      }
    }

    // -------------------------------------------------------------------------
    // D. BIG FELINE BOW STRETCH + SATISFYING YAWN ("Ooooh big stretch!")
    // -------------------------------------------------------------------------
    if (stretch > 0.001) {
      const t = this.stateTime;
      const bowEnv = smoothstep(0.0, 0.7, t) * (1.0 - smoothstep(3.1, 3.8, t)) * stretch;
      const archEnv = smoothstep(3.3, 3.9, t) * (1.0 - smoothstep(4.4, 5.0, t)) * stretch;

      if (bowEnv > 0.001) {
        // Classic feline anterior play/wake bow: chest dips low, rump stays high, front paws reach far forward on floor!
        bones.root.position.y -= 0.138 * bowEnv;
        bones.root.position.z -= 0.08 * bowEnv;
        bones.root.rotation.x += 0.36 * bowEnv;

        bones.spine1.rotation.x -= 0.12 * bowEnv;
        bones.spine2.rotation.x -= 0.16 * bowEnv;
        bones.chest.rotation.x -= 0.22 * bowEnv;
        bones.neck.rotation.x -= 0.28 * bowEnv;
        bones.head.rotation.x -= 0.18 * bowEnv;

        for (const fLimb of [bones.frontL, bones.frontR]) {
          fLimb.shoulder.rotation.x -= 0.99 * bowEnv;
          fLimb.elbow.rotation.x += 0.10 * bowEnv;
          fLimb.wrist.rotation.x += 0.44 * bowEnv;
          fLimb.paw.rotation.x += 0.14 * bowEnv;
        }
        for (const hLimb of [bones.hindL, bones.hindR]) {
          hLimb.hip.rotation.x -= 0.42 * bowEnv;
          hLimb.knee.rotation.x += 0.24 * bowEnv;
          hLimb.hock.rotation.x -= 0.18 * bowEnv;
        }

        // Big mid-stretch yawn showing fangs & curled pink tongue!
        const yawnCurve = smoothstep(0.65, 1.35, t) * (1.0 - smoothstep(2.45, 3.05, t));
        this.jawOpen = Math.max(this.jawOpen, yawnCurve * 0.54 * stretch);
        mouth.tonguePivot.position.z = 0.048 + yawnCurve * 0.016;
        mouth.tonguePivot.rotation.x = -yawnCurve * 0.28;
        this._setClawExtension(bowEnv * 0.88);
      }

      if (archEnv > 0.001) {
        bones.root.position.y += 0.032 * archEnv;
        bones.spine1.rotation.x += 0.26 * archEnv;
        bones.spine2.rotation.x += 0.24 * archEnv;
        bones.chest.rotation.x -= 0.20 * archEnv;
        bones.neck.rotation.x -= 0.18 * archEnv;
        this._setClawExtension(archEnv * 0.35);
      }
    } else if (knead <= 0.01 && this.state !== 'pounce') {
      this._setClawExtension(0);
    }

    // -------------------------------------------------------------------------
    // E. KNEADING ("MAKING BISCUITS")
    // -------------------------------------------------------------------------
    if (knead > 0.001) {
      bones.root.position.y -= 0.062 * knead;
      bones.spine1.rotation.x += 0.08 * knead;
      bones.neck.rotation.x += 0.14 * knead;

      // Flex hind & base forelimbs slightly so standing paws stay right at floor y ~ 0.022!
      for (const hLimb of [bones.hindL, bones.hindR]) {
        hLimb.hip.rotation.x -= 0.22 * knead;
        hLimb.knee.rotation.x += 0.44 * knead;
        hLimb.hock.rotation.x -= 0.22 * knead;
      }
      for (const fLimb of [bones.frontL, bones.frontR]) {
        fLimb.shoulder.rotation.x += 0.32 * knead;
        fLimb.elbow.rotation.x -= 0.66 * knead;
        fLimb.wrist.rotation.x += 0.34 * knead;
      }

      const kPhase = this.time * 4.2;
      const liftL = Math.max(0, Math.sin(kPhase));
      const liftR = Math.max(0, -Math.sin(kPhase));

      bones.frontL.scapula.position.y += (1 - liftL) * 0.010 * knead;
      bones.frontL.shoulder.rotation.x -= liftL * 0.24 * knead;
      bones.frontL.elbow.rotation.x -= liftL * 0.32 * knead;
      bones.frontL.wrist.rotation.x += liftL * 0.48 * knead;

      bones.frontR.scapula.position.y += (1 - liftR) * 0.010 * knead;
      bones.frontR.shoulder.rotation.x -= liftR * 0.24 * knead;
      bones.frontR.elbow.rotation.x -= liftR * 0.32 * knead;
      bones.frontR.wrist.rotation.x += liftR * 0.48 * knead;

      this._setClawExtension((0.35 + 0.55 * Math.max(liftL, liftR)) * knead);
      this.happiness = clamp(this.happiness + dt * 0.18, 0, 1);
    }

    // -------------------------------------------------------------------------
    // F. LOW HUNTER CROUCH (Laser Pointer / Stalking)
    // -------------------------------------------------------------------------
    if (crouch > 0.001) {
      const stalkMod = 1.0 - clamp(this.speed / 0.8, 0, 0.55);
      const cAmt = crouch * stalkMod;
      bones.root.position.y -= 0.135 * cAmt;
      bones.neck.rotation.x -= 0.18 * cAmt;
      bones.head.rotation.x -= 0.12 * cAmt;

      for (const fLimb of [bones.frontL, bones.frontR]) {
        fLimb.shoulder.rotation.x += 0.32 * cAmt;
        fLimb.elbow.rotation.x -= 0.62 * cAmt;
        fLimb.wrist.rotation.x += 0.30 * cAmt;
      }
      for (const hLimb of [bones.hindL, bones.hindR]) {
        hLimb.hip.rotation.x -= 0.36 * cAmt;
        hLimb.knee.rotation.x += 0.68 * cAmt;
        hLimb.hock.rotation.x -= 0.32 * cAmt;
      }
    }
  }

  _applyBreathingAndPetting(dt) {
    const { bones, furUniforms } = this.cat;

    // Subtle organic breathing cycle (slower when sleeping, faster after trotting)
    const breathFreq = this.state === 'sleep' ? 0.24 : 0.40 + this.speed * 0.35;
    const breathWave = Math.sin(this.time * Math.PI * 2 * breathFreq);
    bones.spine2.scale.set(1 + breathWave * 0.016, 1 + breathWave * 0.018, 1);
    bones.chest.scale.set(1 + breathWave * 0.014, 1 + breathWave * 0.016, 1);
    bones.root.position.y += breathWave * 0.003;

    // Subtle idle weight shifting when standing
    const standFactor = 1.0 - clamp(this.weights.sit + this.weights.sleep + this.weights.stretch + this.speed * 2, 0, 1);
    if (standFactor > 0.01) {
      bones.root.position.x += Math.sin(this.time * 0.72) * 0.006 * standFactor;
      bones.spine1.rotation.y += Math.sin(this.time * 0.55) * 0.025 * standFactor;
    }

    // Tactile petting decay & body lean responses
    if (!this.isBeingPetted) {
      this.petIntensity = damp(this.petIntensity, 0, 3.5, dt);
      furUniforms.uBrushStrength.value = damp(furUniforms.uBrushStrength.value, 0, 8, dt);
      this.happiness = damp(this.happiness, this.state === 'knead' ? 0.85 : 0.22, 0.25, dt);
    }

    const targetChinPitch = this.isBeingPetted && this.petZone === 'chin' ? -0.32 : this.isBeingPetted && this.petZone === 'head' ? 0.14 : 0;
    const targetChinRoll = this.isBeingPetted && (this.petZone === 'chin' || this.petZone === 'head')
      ? clamp((this.petPointWorld.x - this.worldPos.x) * 1.4, -0.26, 0.26)
      : 0;
    const targetElevatorButt = this.isBeingPetted && this.petZone === 'back' ? 1.0 : 0.0;

    this.chinLeanPitch = damp(this.chinLeanPitch, targetChinPitch, 6.5, dt);
    this.chinLeanRoll = damp(this.chinLeanRoll, targetChinRoll, 6.5, dt);
    this.elevatorButt = damp(this.elevatorButt, targetElevatorButt, 5.5, dt);

    if (this.elevatorButt > 0.005) {
      bones.pelvis.position.y += 0.032 * this.elevatorButt;
      bones.spine1.rotation.x += 0.14 * this.elevatorButt;
      bones.spine2.rotation.x -= 0.10 * this.elevatorButt;
    }

    // Purr intensity drives Web Audio purr synthesizer
    const targetPurr = (this.isBeingPetted || this.state === 'knead')
      ? clamp(this.happiness * 1.15, 0.35, 1.0)
      : this.happiness > 0.55
        ? (this.happiness - 0.55) * 1.2
        : 0;
    this.purrLevel = damp(this.purrLevel, targetPurr, 2.8, dt);
    if (this.callbacks.onPurrChange) {
      this.callbacks.onPurrChange(this.purrLevel);
    }
  }

  _applyTailDynamics(dt) {
    const { tail } = this.cat.bones;
    const { sit, sleep, crouch } = this.weights;

    // Emotional tail posture:
    // - Happy/petted/walking greeting -> proud vertical question-mark lift!
    // - Sitting -> wraps gracefully around right flank toward front paws
    // - Sleeping -> curled snugly around nose/body
    // - Laser crouch -> held low with rapid tip twitches!
    const happyLift = clamp((this.happiness - 0.35) * 1.4 + this.elevatorButt * 0.65, 0, 1) * (1 - sleep) * (1 - crouch);
    const waveSpeed = crouch > 0.3 ? 8.5 : sleep > 0.5 ? 0.7 : 1.85 + this.speed * 1.6;
    const waveAmp = crouch > 0.3 ? 0.14 : sleep > 0.5 ? 0.025 : 0.10;

    for (let i = 0; i < tail.length; i++) {
      const frac = i / (tail.length - 1);
      const tb = tail[i];

      // Traveling S-wave down the 7 tail vertebrae
      const sWave = Math.sin(this.time * waveSpeed - i * 0.68) * waveAmp * (0.35 + frac * 0.95);

      // Base vertical lift vs question-mark tip hook
      let pitch = 0;
      let yaw = sWave;

      if (happyLift > 0.01) {
        const upright = i < 4 ? 0.34 : -0.18; // tail.rotation.x > 0 lifts tail UP; negative tip hooks forward!
        pitch += upright * happyLift;
      }

      if (sit > 0.01) {
        // Counteract pelvis sit tilt and sweep tail neatly around side
        pitch += (i === 0 ? 0.45 : 0.04) * sit * (1 - happyLift * 0.6);
        yaw += (0.24 + frac * 0.20) * sit * (1 - happyLift * 0.7);
      }

      if (sleep > 0.01) {
        pitch += (i === 0 ? 0.22 : 0.02) * sleep;
        yaw += (0.38 + frac * 0.12) * sleep;
      }

      if (crouch > 0.01) {
        pitch += (i === 0 ? 0.12 : -0.04) * crouch;
      }

      tb.rotation.x += pitch;
      tb.rotation.y += yaw;
    }
  }

  _applyHeadEyesAndExpression(dt) {
    const { bones, eyes, whiskers } = this.cat;
    const { sleep, groom, stretch } = this.weights;

    // 1. Determine active 3D look-at point
    let lookTarget = this._tmpVecA;
    if (this.laserActive) {
      lookTarget.copy(this.laserWorldPos).setY(0.03);
    } else if (this.activeTreat && this.activeTreat.active) {
      lookTarget.copy(this.activeTreat.mesh.position);
    } else if (this.activeYarn && this.activeYarn.active && this.activeYarn.velocity.lengthSq() > 0.01) {
      lookTarget.copy(this.activeYarn.mesh.position);
    } else if (this.moveTarget) {
      lookTarget.copy(this.moveTarget.pos).setY(0.35);
    } else if (this.hasExplicitGaze) {
      lookTarget.copy(this.gazeWorldTarget);
    } else {
      // Autonomous natural saccadic curiosity shifts
      this.idleLookTimer -= dt;
      if (this.idleLookTimer <= 0) {
        this.idleLookTimer = 1.8 + Math.random() * 3.4;
        const yawOff = (Math.random() - 0.5) * 1.1;
        const hOff = 0.35 + Math.random() * 0.65;
        this.idleLookOffset.set(
          this.worldPos.x + Math.sin(this.heading + yawOff) * 1.8,
          hOff,
          this.worldPos.z + Math.cos(this.heading + yawOff) * 1.8
        );
      }
      lookTarget.copy(this.idleLookOffset);
    }

    // Compute desired yaw/pitch relative to cat's current heading & head height
    const headOrigin = this._tmpVecB.set(
      this.worldPos.x + Math.sin(this.heading) * 0.42,
      0.68 - this.weights.sit * 0.04 - this.weights.crouch * 0.12,
      this.worldPos.z + Math.cos(this.heading) * 0.42
    );
    const dirToLook = lookTarget.clone().sub(headOrigin);
    const horizDist = Math.max(0.15, Math.hypot(dirToLook.x, dirToLook.z));
    const worldYaw = Math.atan2(dirToLook.x, dirToLook.z);
    let relYaw = Math.atan2(Math.sin(worldYaw - this.heading), Math.cos(worldYaw - this.heading));
    let relPitch = -Math.atan2(dirToLook.y, horizDist); // positive rotation.x nods DOWN!

    // Suppress external gaze during deep sleep, grooming, or big stretch yawn
    const gazeSuppression = clamp(1.0 - sleep - groom * 0.85 - stretch * 0.75, 0, 1);
    relYaw = clamp(relYaw, -1.05, 1.05) * gazeSuppression;
    relPitch = clamp(relPitch, -0.52, 0.58) * gazeSuppression;

    // Eyes dart rapidly (saccade), neck & head follow with soft organic damping
    this.eyeYaw = damp(this.eyeYaw, clamp(relYaw * 0.32, -0.24, 0.24), 22, dt);
    this.eyePitch = damp(this.eyePitch, clamp(relPitch * 0.32, -0.20, 0.22), 22, dt);
    this.headYaw = damp(this.headYaw, relYaw * 0.78, 8.5, dt);
    this.headPitch = damp(this.headPitch, relPitch * 0.75, 8.5, dt);
    // Cute curious head tilt when tracking laser or yarn!
    const curiosityRoll = (this.laserActive || (this.activeYarn && this.activeYarn.active))
      ? clamp(relYaw * 0.22, -0.16, 0.16)
      : 0;
    this.headRoll = damp(this.headRoll, curiosityRoll + this.chinLeanRoll, 7.0, dt);

    bones.neck.rotation.y += this.headYaw * 0.42;
    bones.neck.rotation.x += this.headPitch * 0.38 + this.chinLeanPitch * 0.35;
    bones.head.rotation.y += this.headYaw * 0.58;
    bones.head.rotation.x += this.headPitch * 0.62 + this.chinLeanPitch * 0.65;
    bones.head.rotation.z += this.headRoll;

    eyes.left.eyeballGroup.rotation.y = this.eyeYaw;
    eyes.left.eyeballGroup.rotation.x = this.eyePitch;
    eyes.right.eyeballGroup.rotation.y = this.eyeYaw;
    eyes.right.eyeballGroup.rotation.x = this.eyePitch;

    // 2. Biological Pupil Dilation (Slit in bright sun -> Wide saucer when hunting laser, pouncing, or moonlit!)
    let targetPupil = THREE.MathUtils.lerp(0.74, 0.16, this.ambientLightLevel);
    if (this.laserActive || this.state === 'pounce') {
      targetPupil = Math.max(targetPupil, 0.76);
    } else if (this.activeTreat || (this.activeYarn && this.activeYarn.velocity.lengthSq() > 0.02)) {
      targetPupil = Math.max(targetPupil, 0.56);
    } else if (this.isBeingPetted) {
      targetPupil = Math.max(targetPupil, 0.42);
    }
    if (this.manualPupilOverride !== null) {
      targetPupil = this.manualPupilOverride;
    }
    this.currentPupil = damp(this.currentPupil, targetPupil, 6.0, dt);
    this.cat.setPupilDilation(this.currentPupil);

    // 3. Natural Blinking & Happy/Sleepy Eyelid Squint
    this.blinkTimer -= dt;
    if (this.blinkTimer <= 0 && this.blinkProgress < 0) {
      this.blinkProgress = 0;
      this.blinkTimer = 2.6 + Math.random() * 4.2;
    }
    let blinkShut = 0;
    if (this.blinkProgress >= 0) {
      this.blinkProgress += dt / 0.16;
      if (this.blinkProgress >= 1) {
        this.blinkProgress = -1;
      } else {
        blinkShut = Math.sin(this.blinkProgress * Math.PI);
      }
    }

    const yawnSquint = this.state === 'stretch'
      ? smoothstep(0.6, 1.3, this.stateTime) * (1 - smoothstep(2.4, 3.1, this.stateTime)) * 0.92
      : 0;
    const petSquint = this.isBeingPetted
      ? (this.petZone === 'chin' ? 0.88 : 0.72)
      : this.state === 'knead'
        ? 0.58 + 0.25 * Math.sin(this.time * 1.4)
        : 0;
    const targetSquint = Math.max(sleep, yawnSquint, petSquint);
    this.eyeSquint = damp(this.eyeSquint, targetSquint, 8.0, dt);

    const lidClose = clamp(Math.max(this.eyeSquint, blinkShut), 0, 1);
    for (const eye of [eyes.left, eyes.right]) {
      eye.upperLid.rotation.x = THREE.MathUtils.lerp(-0.84, 0.12, lidClose);
      eye.lowerLid.rotation.x = THREE.MathUtils.lerp(0.66, -0.06, lidClose);
    }

    // 4. Independent Cupped Ear Pinna Dynamics (Alert perk, airplane relax, dream/sound flicks)
    this.earFlickTimer -= dt;
    if (this.earFlickTimer <= 0) {
      this.earFlickTimer = 2.8 + Math.random() * 5.0;
      if (Math.random() < 0.5) this.earFlickL = 0.28 + Math.random() * 0.22;
      else this.earFlickR = 0.28 + Math.random() * 0.22;
    }
    this.earFlickL = damp(this.earFlickL, 0, 14, dt);
    this.earFlickR = damp(this.earFlickR, 0, 14, dt);

    const targetEarRelax = (this.isBeingPetted && (this.petZone === 'head' || this.petZone === 'chin'))
      ? 0.55
      : sleep * 0.35;
    this.earRelax = damp(this.earRelax, targetEarRelax, 7.0, dt);

    const alertPerk = (this.laserActive || this.activeTreat) ? 0.14 : 0;
    bones.earL.rotation.z -= this.earRelax * 0.42 + this.earFlickL * 0.35;
    bones.earL.rotation.y += this.earRelax * 0.32 - alertPerk;
    bones.earL.rotation.x += alertPerk * 0.6;

    bones.earR.rotation.z += this.earRelax * 0.42 + this.earFlickR * 0.35;
    bones.earR.rotation.y -= this.earRelax * 0.32 - alertPerk;
    bones.earR.rotation.x += alertPerk * 0.6;

    // 5. Vibrissae (Whisker) Forward Sweep when Curious/Hunting/Yawning
    const targetWhisker = (this.laserActive || this.activeTreat || this.jawOpen > 0.2) ? 0.65 : 0.0;
    this.whiskerForward = damp(this.whiskerForward, targetWhisker, 8.0, dt);
    whiskers.left.rotation.y = -this.whiskerForward * 0.28 + Math.sin(this.time * 5.3) * 0.015;
    whiskers.right.rotation.y = this.whiskerForward * 0.28 - Math.sin(this.time * 5.3) * 0.015;

    // 6. Vocalization Jaw Sync (Meow contour)
    if (this.meowTimer >= 0) {
      this.meowTimer += dt;
      const u = this.meowTimer / this.meowDuration;
      if (u >= 1.0) {
        this.meowTimer = -1;
      } else {
        const meowOpen = Math.sin(u * Math.PI) * (0.34 + 0.06 * Math.sin(u * 18.0));
        this.jawOpen = Math.max(this.jawOpen, meowOpen);
      }
    }

    bones.jaw.rotation.x += this.jawOpen;
    if (this.cat.mouth && this.cat.mouth.setOralVisible) {
      this.cat.mouth.setOralVisible(this.jawOpen > 0.03);
    }
    this.jawOpen = damp(this.jawOpen, 0, 12, dt);
  }

  _setClawExtension(amount) {
    const a = clamp(amount, 0, 1);
    for (const cg of this.cat.clawGroups) {
      cg.scale.setScalar(0.35 + a * 0.78);
      cg.position.set(0, 0.004 - a * 0.005, -0.006 + a * 0.009);
    }
  }

  _updateCollarBell(dt) {
    const { collar } = this.cat;
    if (!collar.group.visible) return;

    // Simple damped pendulum excited by movement speed, gait bounce, and pouncing
    const exciteX = -this.speed * 0.55 + Math.sin(this.gaitPhase * Math.PI * 4) * this.speed * 0.45;
    const exciteZ = clamp(this.turnRate * 0.12, -0.45, 0.45);

    this.bellVelX += ((exciteX - this.bellAngleX) * 48 - this.bellVelX * 5.5) * dt;
    this.bellAngleX += this.bellVelX * dt;

    this.bellVelZ += ((exciteZ - this.bellAngleZ) * 48 - this.bellVelZ * 5.5) * dt;
    this.bellAngleZ += this.bellVelZ * dt;

    collar.bellPivot.rotation.x = clamp(this.bellAngleX, -0.65, 0.65);
    collar.bellPivot.rotation.z = clamp(this.bellAngleZ, -0.55, 0.55);

    const jingleEnergy = Math.hypot(this.bellVelX, this.bellVelZ);
    if (jingleEnergy > 1.8 && Math.random() < dt * 4.5 && this.callbacks.onBellJingle) {
      this.callbacks.onBellJingle(clamp(jingleEnergy * 0.15, 0.1, 0.45));
    }
  }
}
