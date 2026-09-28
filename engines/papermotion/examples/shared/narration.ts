import type { CaptionLine } from './captions';

/**
 * Narration for a film: a voice track and when each of its words is spoken, so pictures, sounds and subtitles
 * can follow the voice. `tools/voice/narrate.py` writes the audio (FLAC or WAV) and a timing JSON beside it.
 */

/** One block of the narration as `tools/voice/narrate.py` wrote it (seconds from the start of the audio). */
export interface VoiceBlock { id: string; text: string; start: number; end: number; words: [string, number, number][] }
export interface Voice { length: number; blocks: VoiceBlock[]; samples: Float32Array; rate: number }

/**
 * Fetch a narration from `public/` (e.g. `voice/tutorial.flac`, with `voice/tutorial.json` beside it) and decode
 * it at `rate` Hz, the rate the stage's soundtrack is mixed at. Call it in the catalog entry, before the stage.
 */
export async function loadVoice(file: string, rate = 48000): Promise<Voice> {
  const url = `/${file.replace(/^\//, '')}`, json = url.replace(/\.\w+$/, '.json');
  const get = (u: string) => fetch(u).then(r => { if (!r.ok) throw new Error(`${u}: HTTP ${r.status}; voice the script with tools/voice/narrate.py`); return r; });
  const [info, audio] = await Promise.all([get(json).then(r => r.json()), get(url).then(r => r.arrayBuffer())]);
  const decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(audio);
  return { length: info.length, blocks: info.blocks, samples: decoded.getChannelData(0), rate };
}

const norm = (w: string) => w.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * The narration on the film's clock: when each block and each word is spoken, `offset` seconds into the film.
 * Words of the script are matched to the voice's tokens in order, so a hyphenated word the voice split in two
 * still gets one time.
 *
 * @example
 * const n = new Narration(voice, 1.0);
 * if (this.moments.passed(n.at('install', 'Clone'))) this.cue('typing');   // when "Clone" is said
 * const subs = new Captions(n.subtitles());
 */
export class Narration {
  private readonly words = new Map<string, { word: string; start: number; end: number }[]>();

  constructor(readonly voice: Voice, readonly offset: number) {
    for (const b of voice.blocks) {
      const tokens = b.words.map(([w, s, e]) => ({ n: norm(w), s, e })), out: { word: string; start: number; end: number }[] = [];
      let j = 0;
      for (const word of b.text.match(/[\w'’-]+/g) ?? []) {
        const target = norm(word);
        if (!target) continue;
        let acc = '', start = tokens[j]?.s ?? b.end, end = start;
        while (j < tokens.length && acc.length < target.length) { acc += tokens[j].n; end = tokens[j].e; j++; }
        out.push({ word, start: start + offset, end: end + offset });
      }
      this.words.set(b.id, out);
    }
  }

  block(id: string): { start: number; end: number } {
    const b = this.voice.blocks.find(x => x.id === id);
    if (!b) throw new Error(`no narration block "${id}"`);
    return { start: b.start + this.offset, end: b.end + this.offset };
  }

  /** When the `nth` word starting with `prefix` (case-insensitive) is spoken in block `id`. Throws on a typo. */
  at(id: string, prefix: string, nth = 1): number {
    const p = norm(prefix), hits = (this.words.get(id) ?? []).filter(w => norm(w.word).startsWith(p));
    if (hits.length < nth) throw new Error(`no word "${prefix}" (#${nth}) in narration block "${id}"`);
    return hits[nth - 1].start;
  }

  /** Subtitles: each block split at punctuation (or every ~9 words), timed to its first word. */
  subtitles(maxWords = 9): CaptionLine[] {
    const lines: CaptionLine[] = [];
    for (const b of this.voice.blocks) {
      const words = this.words.get(b.id) ?? [], pieces = b.text.split(/(?<=[.:,;?!])\s+/);
      let i = 0;
      for (const piece of pieces) {
        const n = (piece.match(/[\w'’-]+/g) ?? []).filter(w => norm(w)).length;
        for (let k = 0; k < n; k += maxWords) {
          const count = Math.min(maxWords, n - k), chunk = piece.split(/\s+/).slice(k, k + count).join(' ');
          const first = words[i + k], next = words[i + k + count];
          if (first) lines.push({ from: first.start - 0.12, to: next ? next.start - 0.12 : b.end + this.offset + 0.35, text: chunk });
        }
        i += n;
      }
    }
    return lines;
  }
}
