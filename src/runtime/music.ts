export interface MusicTrack {
  readonly title: string;
  readonly bpm: number;
  readonly steps: readonly (readonly [lead: number, bass: number])[];
  readonly leadVolume?: number;
  readonly bassVolume?: number;
}

const C3 = 130.8, E3 = 164.8, F3 = 174.6, G3 = 196, A3 = 220, B2 = 123.5;
const C5 = 523, D5 = 587, E5 = 659, F5 = 698, G5 = 784, A5 = 880, E4 = 330, A4 = 440, B4 = 494, G4 = 392;
const note = (midi: number) => 440 * 2 ** ((midi - 69) / 12);
const D3 = note(50), Fs3 = note(54), Cs3 = note(49), Fs5 = note(78), B5 = note(83), Cs5 = note(73), Cs6 = note(85), D6 = note(86);

export const MUSIC_TRACKS: Readonly<Record<'overworld' | 'underground' | 'sky', MusicTrack>> = {
  // Astro Hop src/audio/sfx.js, MIT ©2026 Nuno Amorim; notes unchanged.
  overworld: {
    title: 'Astro Hop Overworld', bpm: 138,
    steps: [
      [E5, C3], [0, 0], [G5, G3], [0, 0], [E5, C3], [C5, 0], [D5, G3], [E5, 0],
      [F5, F3], [0, 0], [A5, C3], [0, 0], [G5, F3], [E5, 0], [D5, G3], [C5, 0],
      [E5, A3], [0, 0], [G5, E3], [0, 0], [A5, A3], [G5, 0], [E5, E3], [C5, 0],
      [D5, G3], [E5, 0], [D5, B2], [C5, 0], [C5, C3], [0, 0], [0, G3], [0, 0],
    ],
  },
  underground: {
    title: 'Astro Hop Underground', bpm: 112,
    steps: [
      [A4, A3], [0, 0], [0, 0], [C5, 0], [0, A3], [0, 0], [B4, E3], [0, 0],
      [A4, A3], [0, 0], [0, 0], [E4, 0], [0, A3], [0, 0], [G4, E3], [0, 0],
      [F3 * 2, F3], [0, 0], [0, 0], [A4, 0], [0, F3], [0, 0], [G4, C3], [0, 0],
      [E4, A3], [0, 0], [0, 0], [0, 0], [B4, E3], [0, 0], [A4, A3], [0, 0],
    ],
  },
  // "Skyward Steps": original SkyStride composition, not a sampled song.
  // Eight bars in D major, with an ascending answer and a dominant pickup
  // that resolves into the first bar when the loop repeats.
  sky: {
    title: 'Skyward Steps', bpm: 126, leadVolume: 0.055, bassVolume: 0.13,
    steps: [
      [D5, D3], [Fs5, 0], [A5, A3], [0, 0], [Fs5, Fs3], [E5, 0], [D5, A3], [0, 0],
      [E5, B2], [Fs5, 0], [A5, Fs3], [B5, 0], [A5, D3], [0, 0], [Fs5, Fs3], [0, 0],
      [G5, G3], [0, 0], [B5, D3], [A5, 0], [G5, G3], [Fs5, 0], [E5, D3], [0, 0],
      [Fs5, A3], [E5, 0], [Cs5, E3], [E5, 0], [A5, Cs3], [0, 0], [Cs6, E3], [0, 0],
      [D6, D3], [0, 0], [A5, A3], [Fs5, 0], [G5, Fs3], [A5, 0], [Fs5, A3], [0, 0],
      [B5, B2], [A5, 0], [Fs5, Fs3], [E5, 0], [D5, D3], [Fs5, 0], [A5, Fs3], [0, 0],
      [G5, G3], [B5, 0], [A5, D3], [G5, 0], [Fs5, G3], [E5, 0], [D5, D3], [0, 0],
      [E5, A3], [Fs5, 0], [A5, E3], [0, 0], [Cs5, Cs3], [E5, 0], [A4, E3], [0, 0],
    ],
  },
};

export function musicForTheme(theme: string): MusicTrack | undefined {
  if (theme === 'cave' || theme === 'underground') return MUSIC_TRACKS.underground;
  if (theme === 'overworld' || theme === 'sky') return MUSIC_TRACKS[theme];
  return undefined;
}
