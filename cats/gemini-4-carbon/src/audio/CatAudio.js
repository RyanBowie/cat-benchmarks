/**
 * Pure Web Audio API Feline Bio-Acoustic Synthesizer (Zero external audio files)
 * Synthesizes:
 * - Realistic dual-phase 26 Hz laryngeal purr with respiratory breath modulation
 * - Formant-shaped expressive Meow ("Mrrrow!")
 * - Cute feline greeting/boop Chirrup Trill ("Prrrp!")
 * - Brass collar bell tinkle, soft paw step, and treat crunch
 */
export class CatAudioEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.purrGain = null;
    this.purrOscA = null;
    this.purrOscB = null;
    this.breathLfo = null;
    this.initialized = false;
  }

  unlock() {
    if (this.initialized) {
      if (this.ctx && this.ctx.state === 'suspended') {
        this.ctx.resume();
      }
      return;
    }

    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 0.85;
    this.masterGain.connect(this.ctx.destination);

    this._initContinuousPurr();
    this.initialized = true;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setTargetAtTime(muted ? 0 : 0.85, this.ctx.currentTime, 0.04);
    }
  }

  _initContinuousPurr() {
    const ctx = this.ctx;

    // Feline laryngeal purr: 25.8 Hz + 27.1 Hz sawtooth/triangle glottal pulses through warm lowpass chest cavity
    this.purrGain = ctx.createGain();
    this.purrGain.gain.value = 0.0;

    const chestFilter = ctx.createBiquadFilter();
    chestFilter.type = 'lowpass';
    chestFilter.frequency.value = 155;
    chestFilter.Q.value = 2.4;

    // Respiratory inhale/exhale swell (~0.42 Hz breathing envelope)
    const breathModGain = ctx.createGain();
    breathModGain.gain.value = 0.68;

    this.breathLfo = ctx.createOscillator();
    this.breathLfo.type = 'sine';
    this.breathLfo.frequency.value = 0.42;
    const breathDepth = ctx.createGain();
    breathDepth.gain.value = 0.30;
    this.breathLfo.connect(breathDepth);
    breathDepth.connect(breathModGain.gain);

    this.purrOscA = ctx.createOscillator();
    this.purrOscA.type = 'sawtooth';
    this.purrOscA.frequency.value = 25.6;

    this.purrOscB = ctx.createOscillator();
    this.purrOscB.type = 'triangle';
    this.purrOscB.frequency.value = 51.8;
    const subGain = ctx.createGain();
    subGain.gain.value = 0.45;
    this.purrOscB.connect(subGain);

    this.purrOscA.connect(chestFilter);
    subGain.connect(chestFilter);
    chestFilter.connect(breathModGain);
    breathModGain.connect(this.purrGain);
    this.purrGain.connect(this.masterGain);

    this.purrOscA.start();
    this.purrOscB.start();
    this.breathLfo.start();
  }

  setPurrIntensity(level) {
    if (!this.initialized || !this.purrGain) return;
    const target = Math.max(0, Math.min(1, level)) * 0.22;
    this.purrGain.gain.setTargetAtTime(target, this.ctx.currentTime, 0.14);
  }

  playMeow(duration = 0.76) {
    this.unlock();
    if (!this.ctx || this.muted) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sawtooth';

    // Authentic feline pitch arc: soft onset -> warm peak -> gentle downward glide
    const basePitch = 470 + (Math.random() - 0.5) * 65;
    osc.frequency.setValueAtTime(basePitch * 0.78, now);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 1.24, now + duration * 0.28);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.92, now + duration * 0.72);
    osc.frequency.exponentialRampToValueAtTime(basePitch * 0.68, now + duration);

    // Subtle vocal vibrato
    const vib = this.ctx.createOscillator();
    vib.frequency.value = 6.5;
    const vibGain = this.ctx.createGain();
    vibGain.gain.value = 8.0;
    vib.connect(vibGain);
    vibGain.connect(osc.frequency);

    // Moving oral formant ("M-ee-aa-ow" F1 opening then rounding)
    const formant1 = this.ctx.createBiquadFilter();
    formant1.type = 'bandpass';
    formant1.Q.value = 3.2;
    formant1.frequency.setValueAtTime(620, now);
    formant1.frequency.exponentialRampToValueAtTime(1450, now + duration * 0.32);
    formant1.frequency.exponentialRampToValueAtTime(780, now + duration * 0.92);

    const formant2 = this.ctx.createBiquadFilter();
    formant2.type = 'peaking';
    formant2.frequency.value = 2350;
    formant2.gain.value = 6.0;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.0001, now);
    env.gain.linearRampToValueAtTime(0.16, now + duration * 0.14);
    env.gain.setValueAtTime(0.14, now + duration * 0.55);
    env.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(formant1);
    formant1.connect(formant2);
    formant2.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    vib.start(now);
    osc.stop(now + duration + 0.03);
    vib.stop(now + duration + 0.03);
  }

  playTrill() {
    this.unlock();
    if (!this.ctx || this.muted) return;

    // Cute feline "prrrp!" activation trill (rolled R modulation + rising pitch!)
    const now = this.ctx.currentTime;
    const dur = 0.34;

    const osc = this.ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(340, now);
    osc.frequency.exponentialRampToValueAtTime(640, now + dur);

    const rollLfo = this.ctx.createOscillator();
    rollLfo.frequency.value = 32; // classic feline trill roll!
    const rollDepth = this.ctx.createGain();
    rollDepth.gain.value = 0.07;

    const env = this.ctx.createGain();
    env.gain.setValueAtTime(0.08, now);
    env.gain.exponentialRampToValueAtTime(0.001, now + dur);

    rollLfo.connect(rollDepth);
    rollDepth.connect(env.gain);

    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1100;
    bp.Q.value = 1.8;

    osc.connect(bp);
    bp.connect(env);
    env.connect(this.masterGain);

    osc.start(now);
    rollLfo.start(now);
    osc.stop(now + dur + 0.02);
    rollLfo.stop(now + dur + 0.02);
  }

  playBellJingle(intensity = 0.25) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    for (const [freq, ratio] of [[3480, 1.0], [5290, 0.55]]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq + (Math.random() - 0.5) * 45;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(intensity * 0.045 * ratio, now);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
      osc.connect(g);
      g.connect(this.masterGain);
      osc.start(now);
      osc.stop(now + 0.15);
    }
  }

  playSoftStep(weight = 0.3) {
    if (!this.initialized || !this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(95, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.055);

    const g = this.ctx.createGain();
    g.gain.setValueAtTime(weight * 0.035, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);

    osc.connect(g);
    g.connect(this.masterGain);
    osc.start(now);
    osc.stop(now + 0.065);
  }

  playTreatCrunch() {
    this.unlock();
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;

    // 3 quick happy munches
    for (let k = 0; k < 3; k++) {
      const t0 = now + k * 0.14;
      const bufSize = Math.floor(this.ctx.sampleRate * 0.055);
      const buffer = this.ctx.createBuffer(1, bufSize, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufSize * 0.35));
      }
      const src = this.ctx.createBufferSource();
      src.buffer = buffer;

      const filter = this.ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.value = 1650 + k * 220;
      filter.Q.value = 1.6;

      const g = this.ctx.createGain();
      g.gain.value = 0.14;

      src.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      src.start(t0);
    }
  }
}
