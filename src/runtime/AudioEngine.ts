// Port of Astro Hop src/audio/sfx.js, MIT ©2026 Nuno Amorim.
// Lifecycle scoped to each mounted course; no global input listeners.
// Retro sound engine — everything is synthesized with the Web Audio API
// (oscillators + gain envelopes), no audio files needed. This is how the
// sounds of the 80s were made: square and triangle waves with quick
// pitch sweeps.

const MUTE_KEY = 'skystride.audio-muted.v1';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private pendingMusic: string | null = null;
  private musicNotes = new Set<AudioScheduledSourceNode>();
  muted = false;
  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      this.muted = false;
    }

  }

  unlock() {
    this.ensure();
    if (this.pendingMusic) { const kind = this.pendingMusic; this.pendingMusic = null; this.startMusic(kind); }
  }
  suspend() { this.stopMusic(); void this.ctx?.suspend(); }
  dispose() { this.stopMusic(); void this.ctx?.close(); this.ctx = null; }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 1;
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.5;
      this.musicGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(muted: boolean) {
    this.muted = muted;
    try {
      localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch {
      /* ignore */
    }
    if (this.master) this.master.gain.value = muted ? 0 : 1;
  }

  toggleMute() {
    this.setMuted(!this.muted);
    return this.muted;
  }

  /** One enveloped oscillator note: the building block of every effect. */
  tone({ type = 'square', from = 440, to = null, dur = 0.1, delay = 0, vol = 0.25, dest = null }: { type?: OscillatorType; from?: number; to?: number | null; dur?: number; delay?: number; vol?: number; dest?: GainNode | null }) {
    if (!this.ctx) return;
    const t0 = this.ctx!.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t0);
    if (to && to !== from) osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain);
    gain.connect(dest ?? this.master!);
    if (dest === this.musicGain) {
      this.musicNotes.add(osc);
      osc.onended = () => { this.musicNotes.delete(osc); osc.disconnect(); gain.disconnect(); };
    } else osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  /** A burst of white noise (impacts, breaking). */
  noise({ dur = 0.15, delay = 0, vol = 0.3 }) {
    if (!this.ctx) return;
    const t0 = this.ctx!.currentTime + delay;
    const length = Math.ceil(this.ctx.sampleRate * dur);
    const buffer = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(gain);
    gain.connect(this.master!);
    src.start(t0);
  }

  /** Play several notes in a row (power-ups, fanfares). */
  arpeggio(freqs: number[], { step = 0.07, dur = 0.09, type = 'square', vol = 0.22 }: { step?: number; dur?: number; type?: OscillatorType; vol?: number } = {}) {
    freqs.forEach((f, i) => this.tone({ type, from: f, dur, delay: i * step, vol }));
  }

  play(name: string) {
    if (!this.ctx) return;
    switch (name) {
      case 'jump':
        this.tone({ from: 180, to: 520, dur: 0.18, vol: 0.2 });
        break;
      case 'coin':
        this.tone({ from: 988, dur: 0.07, vol: 0.2 });
        this.tone({ from: 1319, dur: 0.22, delay: 0.07, vol: 0.2 });
        break;
      case 'stomp':
        this.tone({ from: 280, to: 60, dur: 0.12, vol: 0.3 });
        this.noise({ dur: 0.06, vol: 0.15 });
        break;
      case 'bump':
        this.tone({ type: 'triangle', from: 120, to: 80, dur: 0.08, vol: 0.3 });
        break;
      case 'break':
        this.noise({ dur: 0.2, vol: 0.3 });
        this.tone({ from: 200, to: 70, dur: 0.15, vol: 0.2 });
        break;
      case 'fireball':
        this.tone({ from: 700, to: 180, dur: 0.09, vol: 0.16 });
        break;
      case 'powerup':
        this.arpeggio([392, 523, 659, 784, 1047], { type: 'triangle', vol: 0.25 });
        break;
      case 'oneup':
        this.arpeggio([523, 659, 784, 1047, 1319], { step: 0.08 });
        break;
      case 'hurt':
        this.tone({ from: 400, to: 120, dur: 0.25, vol: 0.25 });
        break;
      case 'death':
        this.arpeggio([494, 440, 392, 330, 262, 196], { step: 0.11, dur: 0.12, vol: 0.25 });
        break;
      case 'flag':
        this.arpeggio([523, 659, 784, 1047, 1319, 1568], { step: 0.09, dur: 0.12, type: 'triangle', vol: 0.3 });
        break;
    }
  }

  // ------------------------------------------------------------- music
  // Two tiny original loops, scheduled bar by bar slightly ahead of time.
  // Each entry: [lead-note, bass-note] per eighth-note step (0 = rest).

  startMusic(kind: string) {
    if (!this.ctx) {
      this.pendingMusic = kind; // starts on the first user gesture
      return;
    }
    this.stopMusic();

    const C3 = 130.8, E3 = 164.8, F3 = 174.6, G3 = 196, A3 = 220, B2 = 123.5;
    const C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, E4 = 330, A4 = 440, B4 = 494, C4 = 262, D4 = 294, G4 = 392;

    const tracks: Record<string, { bpm: number; steps: number[][] }> = {
      overworld: {
        bpm: 138,
        steps: [
          [E5, C3], [0, 0], [G5, G3], [0, 0], [E5, C3], [C5, 0], [D5, G3], [E5, 0],
          [F5, F3], [0, 0], [A5, C3], [0, 0], [G5, F3], [E5, 0], [D5, G3], [C5, 0],
          [E5, A3], [0, 0], [G5, E3], [0, 0], [A5, A3], [G5, 0], [E5, E3], [C5, 0],
          [D5, G3], [E5, 0], [D5, B2], [C5, 0], [C5, C3], [0, 0], [0, G3], [0, 0],
        ],
      },
      underground: {
        bpm: 112,
        steps: [
          [A4, A3], [0, 0], [0, 0], [C5, 0], [0, A3], [0, 0], [B4, E3], [0, 0],
          [A4, A3], [0, 0], [0, 0], [E4, 0], [0, A3], [0, 0], [G4, E3], [0, 0],
          [F3 * 2, F3], [0, 0], [0, 0], [A4, 0], [0, F3], [0, 0], [G4, C3], [0, 0],
          [E4, A3], [0, 0], [0, 0], [0, 0], [B4, E3], [0, 0], [A4, A3], [0, 0],
        ],
      },
    };

    const track = tracks[kind];
    if (!track) return;

    const stepDur = 60 / track.bpm / 2; // eighth notes
    const loopDur = track.steps.length * stepDur;

    const scheduleLoop = (t0: number) => {
      track.steps.forEach(([lead, bass], i) => {
        const delay = t0 + i * stepDur - this.ctx!.currentTime;
        if (lead) {
          this.tone({ type: 'square', from: lead, dur: stepDur * 0.85, delay, vol: 0.07, dest: this.musicGain });
        }
        if (bass) {
          this.tone({ type: 'triangle', from: bass, dur: stepDur * 1.6, delay, vol: 0.16, dest: this.musicGain });
        }
      });
    };

    let nextLoop = this.ctx!.currentTime + 0.1;
    scheduleLoop(nextLoop);
    nextLoop += loopDur;
    // wake up shortly before each loop ends and schedule the next one
    this.musicTimer = setInterval(() => {
      if (this.ctx!.currentTime > nextLoop - 0.3) {
        scheduleLoop(nextLoop);
        nextLoop += loopDur;
      }
    }, 100);
  }

  stopMusic() {
    this.pendingMusic = null;
    for (const note of this.musicNotes) { try { note.stop(); } catch { /* already ended */ } note.disconnect(); }
    this.musicNotes.clear();
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
