import { rand, store } from './util.js';

/* =========================================================
   Audio (all synthesized)
   ========================================================= */
export const Sfx = (() => {
  let ctx = null, out = null, master = null, noiseBuf = null;
  let muted = store.get('testudo.muted', false);
  const gates = {};
  function init() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain(); master.gain.value = muted ? 0 : 0.8;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -16; comp.ratio.value = 4;
      out = ctx.createGain(); out.gain.value = 1;
      out.connect(comp); comp.connect(master); master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
  }
  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (hold) g.gain.setValueAtTime(peak, t + a + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + (hold || 0) + rel);
  }
  function noise(o) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (o.when || 0), dur = o.dur || 0.3;
    const s = ctx.createBufferSource(); s.buffer = noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f0 || 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    const g = ctx.createGain(); env(g, t, o.attack || 0.004, o.gain || 0.3, o.hold || 0, dur);
    s.connect(f); f.connect(g); g.connect(out);
    s.start(t, Math.random() * 1.2); s.stop(t + (o.attack || 0.004) + (o.hold || 0) + dur + 0.05);
  }
  function tone(o) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (o.when || 0), dur = o.dur || 0.3;
    const osc = ctx.createOscillator(); osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1) osc.frequency.exponentialRampToValueAtTime(o.f1, t + (o.hold || 0) + dur);
    if (o.detune) osc.detune.value = o.detune;
    const g = ctx.createGain(); env(g, t, o.attack || 0.008, o.gain || 0.2, o.hold || 0, dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(out);
    osc.start(t); osc.stop(t + (o.attack || 0.008) + (o.hold || 0) + dur + 0.05);
  }
  function gate(name, ms) {
    const now = performance.now();
    if ((gates[name] || 0) > now) return false;
    gates[name] = now + ms; return true;
  }
  return {
    init,
    get muted() { return muted; },
    toggle() { muted = !muted; store.set('testudo.muted', muted); if (master) master.gain.value = muted ? 0 : 0.8; return muted; },
    horn() {
      const parts = [[146.8, 0, 0.32], [196, 0.36, 0.75]];
      for (const [f, w, h] of parts) for (const det of [-8, 0, 9]) {
        tone({ f0: f, type: 'sawtooth', when: w, attack: 0.06, hold: h, dur: 0.25, gain: 0.07, detune: det, lp: 1300 });
      }
      tone({ f0: 73.4, type: 'triangle', attack: 0.05, hold: 1.0, dur: 0.3, gain: 0.12 });
    },
    volley() {
      if (!gate('volley', 200)) return;
      for (let i = 0; i < 5; i++) noise({ when: i * 0.06, dur: 0.9, f0: 3200, f1: 650, q: 1.6, gain: 0.09 });
    },
    creak() {
      tone({ f0: 70, f1: 105, type: 'sawtooth', dur: 0.9, gain: 0.03, lp: 500 });
      noise({ dur: 0.9, f0: 900, q: 9, gain: 0.05 });
    },
    thunk() {
      if (!gate('thunk', 35)) return;
      noise({ dur: 0.07, type: 'lowpass', f0: rand(700, 1100), gain: 0.45 });
      tone({ f0: rand(150, 200), f1: 70, dur: 0.08, type: 'triangle', gain: 0.25 });
    },
    clang() {
      if (!gate('clang', 70)) return;
      tone({ f0: rand(1100, 1800), dur: 0.22, type: 'square', gain: 0.03, lp: 4200 });
      noise({ dur: 0.08, type: 'highpass', f0: 2800, gain: 0.16 });
    },
    hit() {
      if (!gate('hit', 60)) return;
      noise({ dur: 0.13, type: 'lowpass', f0: 520, gain: 0.5 });
      tone({ f0: 120, f1: 48, dur: 0.14, gain: 0.4 });
    },
    bigHit() {
      tone({ f0: 85, f1: 26, dur: 0.75, gain: 0.95 });
      noise({ dur: 0.6, type: 'lowpass', f0: 1400, f1: 180, gain: 0.85 });
      for (let i = 0; i < 4; i++) tone({ when: i * 0.05, f0: rand(900, 1700), dur: 0.3, type: 'square', gain: 0.03, lp: 4000 });
    },
    throwPila() {
      for (let i = 0; i < 4; i++) noise({ when: i * 0.05, dur: 0.32, f0: 1600, f1: 420, q: 1.3, gain: 0.12 });
    },
    shout(low) {
      for (let i = 0; i < 7; i++) {
        tone({ when: rand(0, 0.12), f0: rand(low ? 110 : 150, low ? 180 : 260), f1: rand(90, 140), type: 'sawtooth', attack: 0.05, hold: 0.45, dur: 0.35, gain: 0.018, lp: 1100 });
      }
      noise({ attack: 0.05, hold: 0.4, dur: 0.4, f0: 750, q: 0.8, gain: 0.12 });
    },
    drum(soft) {
      if (!gate('drum', 150)) return;
      tone({ f0: 95, f1: 44, dur: 0.32, gain: soft ? 0.22 : 0.5 });
      noise({ dur: 0.08, type: 'lowpass', f0: 320, gain: soft ? 0.12 : 0.25 });
    },
    victory() {
      const n = [392, 494, 587, 784];
      n.forEach((f, i) => tone({ when: i * 0.13, f0: f, type: 'triangle', attack: 0.01, hold: i === 3 ? 0.5 : 0.08, dur: 0.3, gain: 0.13 }));
      [392, 494, 587].forEach((f) => tone({ when: 0.39, f0: f, type: 'sawtooth', attack: 0.02, hold: 0.5, dur: 0.4, gain: 0.03, lp: 1500 }));
    },
    defeat() {
      [392, 349, 311, 262].forEach((f, i) => tone({ when: i * 0.32, f0: f, type: 'sawtooth', attack: 0.04, hold: 0.22, dur: 0.3, gain: 0.05, lp: 900 }));
    },
    deny() { tone({ f0: 170, dur: 0.12, type: 'square', gain: 0.05, lp: 1200 }); },
    click() { tone({ f0: 660, dur: 0.06, type: 'triangle', gain: 0.08 }); },
  };
})();
