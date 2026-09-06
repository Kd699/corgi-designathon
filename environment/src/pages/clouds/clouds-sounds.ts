// Interface sounds for the clouds voice flow, from procedural-sounds
// (https://procedural-sounds.vercel.app · https://github.com/m1ckc3s/procedural-sounds,
// MIT). The player below is that product's exported "Copy player" runtime —
// a standalone recipe interpreter, kept byte-faithful where possible so
// sounds copied from the site keep working — and the three patches are
// hand-picked recipes from its curated library pools.

type Frequency = number | { start: number; end: number; time?: number };

type Layer = {
  source:
    | { type: "sine" | "triangle" | "square" | "sawtooth"; frequency: Frequency; detune?: number; fm?: { ratio: number; depth: number } }
    | { type: "noise"; color?: "white" | "pink" | "brown" };
  envelope?: { attack?: number; decay: number; sustain?: number; release?: number; curve?: "ramp" };
  gain?: number;
  delay?: number;
  filter?: FilterSpec | FilterSpec[];
  effects?: EffectSpec[];
};

type FilterSpec = {
  type: BiquadFilterType;
  frequency: number;
  Q?: number;
  resonance?: number;
  envelope?: { attack?: number; peak: number; decay: number };
};

type EffectSpec =
  | { type: "reverb"; decay?: number; mix?: number; damping?: number; roomSize?: number; preDelay?: number }
  | { type: "delay"; delay: number; feedback: number; wet: number; lowpass?: number };

export type Patch = Layer | { layers: Layer[] };

let sharedCtx: AudioContext | undefined;

/** The one AudioContext — the mic level analyser shares it with playback. */
export function getAudioContext(): AudioContext {
  sharedCtx ??= new AudioContext();
  return sharedCtx;
}

export function playSound(patch: Patch): void {
  const ctx = getAudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  const S = 0.0001;
  const t0 = ctx.currentTime;

  function noiseBuffer(seconds: number, color?: string): AudioBuffer {
    const len = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    if (color === "pink") {
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
        b6 = w * 0.115926;
      }
    } else if (color === "brown") {
      let last = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      }
    } else {
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    return buf;
  }

  function reverb(o: Extract<EffectSpec, { type: "reverb" }>) {
    const decay = o.decay ?? 0.5;
    const mix = o.mix ?? 0.3;
    const damping = o.damping ?? 0;
    const input = ctx.createGain(), output = ctx.createGain();
    const dry = ctx.createGain(); dry.gain.value = 1 - mix;
    input.connect(dry); dry.connect(output);
    const wet = ctx.createGain(); wet.gain.value = mix; input.connect(wet);
    const wetOut = ctx.createGain(); wetOut.connect(output);
    const len = Math.ceil(ctx.sampleRate * decay * (o.roomSize ?? 1));
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.28));
      if (damping > 0) {
        const c = Math.min(damping, 0.99);
        let prev = 0;
        for (let i = 0; i < len; i++) { prev = d[i] * (1 - c) + prev * c; d[i] = prev; }
      }
    }
    const conv = ctx.createConvolver(); conv.buffer = buf;
    const pre = o.preDelay ?? 0;
    if (pre > 0) {
      const pd = ctx.createDelay(Math.max(pre + 0.01, 1));
      pd.delayTime.value = pre;
      wet.connect(pd); pd.connect(conv);
    } else {
      wet.connect(conv);
    }
    conv.connect(wetOut);
    return { input, output };
  }

  function shimmer(o: Extract<EffectSpec, { type: "delay" }>) {
    const input = ctx.createGain(), output = ctx.createGain();
    input.connect(output);
    const delay = ctx.createDelay(1); delay.delayTime.value = o.delay;
    const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = o.lowpass ?? 4000;
    const fb = ctx.createGain(); fb.gain.value = o.feedback;
    const wet = ctx.createGain(); wet.gain.value = o.wet;
    input.connect(delay); delay.connect(lp); lp.connect(fb); fb.connect(delay);
    lp.connect(wet); wet.connect(output);
    return { input, output };
  }

  const layers: Layer[] = "layers" in patch ? patch.layers : [patch];
  for (const layer of layers) {
    const t = t0 + (layer.delay || 0);
    const gain = layer.gain ?? 0.5;
    const env = layer.envelope;
    const a = env?.attack || 0;
    const d = env ? env.decay : 0;
    const sus = env?.sustain || 0;
    const rel = env?.release || 0;
    const dur = env ? a + d + rel : 0.5;

    const g = ctx.createGain();
    if (!env) {
      g.gain.setValueAtTime(gain, t);
      g.gain.setTargetAtTime(S, t, 0.15);
    } else if (env.curve === "ramp") {
      const peak = Math.max(gain, S);
      g.gain.setValueAtTime(S, t);
      if (a > 0) g.gain.exponentialRampToValueAtTime(peak, t + a);
      else g.gain.setValueAtTime(peak, t);
      g.gain.exponentialRampToValueAtTime(S, t + a + d);
    } else {
      g.gain.setValueAtTime(S, t);
      if (a > 0) g.gain.linearRampToValueAtTime(gain, t + a);
      else g.gain.setValueAtTime(gain, t);
      if (sus > 0) {
        g.gain.setTargetAtTime(Math.max(sus * gain, S), t + a, d / 3);
        if (rel > 0) g.gain.setTargetAtTime(S, t + a + d, rel / 3);
      } else {
        g.gain.setTargetAtTime(S, t + a, d / 3);
      }
    }

    let src: AudioBufferSourceNode | OscillatorNode;
    const s = layer.source;
    if (s.type === "noise") {
      const b = ctx.createBufferSource();
      b.buffer = noiseBuffer(dur + 0.1, s.color);
      src = b;
    } else {
      const osc = ctx.createOscillator();
      osc.type = s.type;
      const f = s.frequency;
      if (typeof f === "number") {
        osc.frequency.setValueAtTime(f, t);
      } else {
        osc.frequency.setValueAtTime(f.start, t);
        osc.frequency.exponentialRampToValueAtTime(Math.max(f.end, 1), t + Math.min(f.time ?? dur, dur));
      }
      if (s.detune) osc.detune.value = s.detune;
      if (s.fm) {
        const carrier = typeof f === "number" ? f : f.start;
        const mod = ctx.createOscillator();
        mod.type = "sine";
        mod.frequency.value = carrier * s.fm.ratio;
        const mg = ctx.createGain();
        mg.gain.value = s.fm.depth;
        mod.connect(mg); mg.connect(osc.frequency);
        mod.start(t); mod.stop(t + dur + 0.1);
      }
      src = osc;
    }
    src.start(t); src.stop(t + dur + 0.1);

    let node: AudioNode = src;
    const filters = !layer.filter ? [] : Array.isArray(layer.filter) ? layer.filter : [layer.filter];
    for (const f of filters) {
      const bq = ctx.createBiquadFilter();
      bq.type = f.type;
      bq.frequency.setValueAtTime(f.frequency, t);
      bq.Q.value = f.Q ?? f.resonance ?? 1;
      if (f.envelope) {
        const peakAt = t + (f.envelope.attack || 0);
        bq.frequency.linearRampToValueAtTime(f.envelope.peak, peakAt);
        bq.frequency.exponentialRampToValueAtTime(Math.max(f.frequency, 1), peakAt + f.envelope.decay);
      }
      node.connect(bq); node = bq;
    }
    node.connect(g);

    let out: AudioNode = g;
    for (const fx of layer.effects || []) {
      const built = fx.type === "reverb" ? reverb(fx) : fx.type === "delay" ? shimmer(fx) : null;
      if (!built) continue;
      out.connect(built.input); out = built.output;
    }
    out.connect(ctx.destination);
  }
}

// The recipes — plain patch objects out of the library's transition and
// notification pools, chosen by contour: rising to open the mic, falling
// to close it, a quick two-tone chime when a widget lands.

const VOICE_START: Patch = {
  source: { type: "sine", frequency: { start: 339.225, end: 678.449 } },
  envelope: { attack: 0.004, decay: 0.112, sustain: 0, release: 0, curve: "ramp" },
  gain: 0.188,
  effects: [{ type: "delay", delay: 0.083, feedback: 0.194, wet: 0.194, lowpass: 3921 }],
  filter: { type: "lowpass", frequency: 714.2349904865259, Q: 5.32695814004476 },
};

const VOICE_END: Patch = {
  source: { type: "sine", frequency: { start: 720, end: 360 } },
  envelope: { attack: 0.002, decay: 0.08, sustain: 0, release: 0.025 },
  gain: 0.12,
  filter: { type: "lowpass", frequency: 1413.5381452319937, Q: 3.0540309085288526 },
};

const WIDGET_APPEAR: Patch = {
  layers: [
    { source: { type: "sine", frequency: 814.177 }, envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.015 }, gain: 0.1 },
    { source: { type: "sine", frequency: 1408.596 }, envelope: { attack: 0, decay: 0.05, sustain: 0, release: 0.015 }, gain: 0.08, delay: 0.06 },
  ],
};

export const playVoiceStart = () => playSound(VOICE_START);
export const playVoiceEnd = () => playSound(VOICE_END);
export const playWidgetAppear = () => playSound(WIDGET_APPEAR);
