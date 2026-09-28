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

const norm = (w: string) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
/** Chinese and Japanese are written without spaces between words. */
const UNSPACED = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;

/**
 * Cue words in another language, for a film timed to one narration and re-voiced in another: block id → the
 * word the scene asks for → the word to wait for instead (and which occurrence of it).
 */
export type Cues = Record<string, Record<string, string | [string, number]>>;

interface TimedWord { word: string; start: number; end: number }

/**
 * The narration on the film's clock: when each block and each word is spoken, `offset` seconds into the film.
 * Words of the script are matched to the voice's tokens in order, so a hyphenated word the voice split in two
 * still gets one time. In Chinese or Japanese the words are the ones the voice split the text into.
 *
 * @example
 * const n = new Narration(voice, 1.0);
 * if (this.moments.passed(n.at('install', 'Clone'))) this.cue('typing');   // when "Clone" is said
 * const subs = new Captions(n.subtitles());
 */
export class Narration {
  private readonly words = new Map<string, TimedWord[]>();

  /** `cues` re-maps the words `at` is asked for, when the scene was timed to a narration in another language. */
  constructor(readonly voice: Voice, readonly offset: number, readonly cues: Cues = {}) {
    for (const b of voice.blocks) {
      if (UNSPACED.test(b.text)) {
        this.words.set(b.id, b.words.map(([word, s, e]) => ({ word, start: s + offset, end: e + offset })));
        continue;
      }
      const tokens = b.words.map(([w, s, e]) => ({ n: norm(w), s, e })), out: TimedWord[] = [];
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

  /**
   * When the `nth` word starting with `prefix` (case-insensitive) is spoken in block `id`. Throws on a typo. In
   * Chinese or Japanese, `prefix` is any run of characters, inside a word or across words.
   */
  at(id: string, prefix: string, nth = 1): number {
    const cue = this.cues[id]?.[prefix];
    const [p, k] = cue === undefined ? [prefix, nth] : typeof cue === 'string' ? [cue, nth] : cue;
    const words = this.words.get(id) ?? [], want = norm(p);
    const hits = UNSPACED.test(want) ? this.runs(words, want) : words.filter(w => norm(w.word).startsWith(want)).map(w => w.start);
    if (hits.length < k) throw new Error(`no word "${p}" (#${k}) in narration block "${id}"`);
    return hits[k - 1];
  }

  /** When each occurrence of `run` starts, found in the block's words run together (inside a word: by its share of the characters). */
  private runs(words: TimedWord[], run: string): number[] {
    const text = words.map(w => norm(w.word)).join(''), hits: number[] = [];
    for (let i = text.indexOf(run); i >= 0; i = text.indexOf(run, i + 1)) {
      let at = i;
      for (const w of words) {
        const n = norm(w.word).length;
        if (at < n) { hits.push(w.start + ((w.end - w.start) * at) / n); break; }
        at -= n;
      }
    }
    return hits;
  }

  /**
   * Subtitles: each block split at punctuation (or every ~9 words), timed to its first word. Chinese and Japanese
   * lines hold up to `maxChars` characters (a Latin letter counts half), join short clauses, and drop the
   * punctuation at their ends.
   */
  subtitles(maxWords = 9, maxChars = 18): CaptionLine[] {
    const lines: CaptionLine[] = [];
    for (const b of this.voice.blocks) {
      const words = this.words.get(b.id) ?? [];
      if (UNSPACED.test(b.text)) {
        lines.push(...this.unspaced(b, words, maxChars));
        continue;
      }
      const pieces = b.text.split(/(?<=[.:,;?!])\s+/);
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

  /**
   * A Chinese or Japanese block's subtitles. Each sentence goes on as few strips as fit, cut at punctuation (a
   * colon or semicolon best), between words only where a clause is too long for one strip, into strips of even
   * length; no strip of a word or two, or that shows for less than 1.2 s.
   */
  private unspaced(b: VoiceBlock, words: TimedWord[], maxChars: number): CaptionLine[] {
    // Each word takes the text from where it starts to where the next one does (its punctuation, a space).
    let pos = 0;
    const starts = words.map(w => { const i = b.text.indexOf(w.word, pos); if (i >= 0) pos = i + w.word.length; return i >= 0 ? i : pos; });
    const units = words.map((w, k) => ({ w, text: b.text.slice(k ? starts[k] : 0, starts[k + 1] ?? b.text.length) }));
    const shown = (text: string) => text.replace(/[，、：；,;:]\s*(?=\S)/g, ' ').replace(/[，。、：；,.;:\s]+$/, '').trim();
    // A character of Chinese is as wide as the font size; a Latin letter about 0.6 of it, a space 0.3.
    const width = (text: string) => [...shown(text)].reduce((n, ch) => n + (UNSPACED.test(ch) || ch > '　' ? 1 : ch === ' ' ? 0.3 : 0.6), 0);
    const join = (us: typeof units) => us.map(u => u.text).join('');
    const mark = (k: number) => units[k].text.trim().slice(-1);

    const parts: (typeof units)[] = [];
    for (let s = 0; s < units.length;) {
      let e = s;
      while (e < units.length - 1 && !/[。！？.!?]/.test(mark(e))) e++;
      // best[j]: the cheapest way to lay out the sentence's first j words; each strip costs 1, plus its cut and slack.
      const n = e - s + 1, best = [0], from = [0];
      const at = (k: number) => (k < units.length ? units[k].w.start : b.end + this.offset + 0.35);
      for (let j = 1; j <= n; j++) {
        best[j] = Infinity;
        for (let i = j - 1; i >= 0; i--) {
          const w = width(join(units.slice(s + i, s + j)));
          if (w > maxChars && j - i > 1) break;
          const end = mark(s + j - 1), cut = /[：；:;]/.test(end) ? -0.15 : /[。！？.!?，、,]/.test(end) ? 0 : 1.5;
          const short = (w < 3.5 ? 0.4 : 0) + (at(s + j) - at(s + i) < 1.2 ? 0.5 : 0);
          const cost = best[i] + 1 + cut + short + 0.3 * ((maxChars - Math.min(w, maxChars)) / maxChars) ** 2;
          if (cost < best[j]) { best[j] = cost; from[j] = i; }
        }
      }
      const cuts: number[] = [];
      for (let j = n; j > 0; j = from[j]) cuts.unshift(j);
      cuts.forEach((j, k) => parts.push(units.slice(s + (k ? cuts[k - 1] : 0), s + j)));
      s = e + 1;
    }
    return parts.map((p, k, all) => ({
      from: p[0].w.start - 0.12,
      to: all[k + 1] ? all[k + 1][0].w.start - 0.12 : b.end + this.offset + 0.35,
      text: shown(join(p)),
    }));
  }
}
