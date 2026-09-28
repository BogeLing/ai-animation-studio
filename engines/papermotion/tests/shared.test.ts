import { describe, expect, it } from 'vitest';
import { Mixer } from '../src';
import { DAY, dayAt, mixHex } from '../examples/shared/daySky';
import { foley } from '../examples/shared/foley';
import { CueClock } from '../examples/shared/kit';
import { lofi } from '../examples/shared/lofi';
import { Narration, type Voice } from '../examples/shared/narration';
import { HopPath, follow } from '../examples/shared/walk';

const SR = 8000;
const peak = (b: Float32Array) => b.reduce((m, x) => Math.max(m, Math.abs(x)), 0);
const rms = (b: Float32Array, from: number, to: number) => {
  const s = b.subarray(Math.floor(from * SR), Math.floor(to * SR));
  return Math.sqrt(s.reduce((a, x) => a + x * x, 0) / Math.max(1, s.length));
};

describe('HopPath', () => {
  const walk = new HopPath([
    { a: 0, b: 900, start: 1, duration: 1.5, hops: 3, height: 60 },
    { a: 900, b: 1800, start: 4, duration: 2, hops: 4, height: 70 },
  ]);

  it('stands still between moves and lands exactly at each end', () => {
    expect(walk.at(0)).toEqual({ x: 0, lift: 0, moving: false });
    expect(walk.at(3)).toEqual({ x: 900, lift: 0, moving: false });
    expect(walk.at(9)).toEqual({ x: 1800, lift: 0, moving: false });
    expect(walk.at(1.75).moving).toBe(true);
    expect(walk.at(1.75).lift).toBeGreaterThan(50);
  });

  it('lists every touchdown, the last of each move being the arrival', () => {
    expect(walk.landings()).toEqual([1.5, 2, 2.5, 4.5, 5, 5.5, 6]);
    expect(walk.arrivals()).toEqual([2.5, 6]);
    for (const t of walk.landings()) expect(walk.at(t - 1e-9).lift).toBeLessThan(0.5);
  });

  it('rejects overlapping moves', () => {
    expect(() => new HopPath([{ a: 0, b: 1, start: 0, duration: 2, hops: 1, height: 1 }, { a: 1, b: 2, start: 1, duration: 1, hops: 1, height: 1 }])).toThrow();
  });

  it('follow clamps the camera to the film', () => {
    expect(follow(100, 400, 1000, 5000)).toBe(1000);
    expect(follow(2000, 400, 1000, 5000)).toBe(2400);
    expect(follow(9000, 400, 1000, 5000)).toBe(5000);
  });
});

describe('CueClock', () => {
  it('fires each moment once, even where t - dt drifts', () => {
    const clock = new CueClock(), dt = 1 / 60;
    let fired = 0;
    for (let k = 0; k < 900; k++) {
      clock.step(k * dt);
      for (const at of [8, 8.4, 10.4, 12.8]) if (clock.passed(at)) fired++;
    }
    expect(fired).toBe(4);
  });
});

describe('day sky', () => {
  it('blends colours and hits the keys exactly', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#102030', '#102030', 0.3)).toBe('#102030');
    expect(() => mixHex('red', '#ffffff', 0.5)).toThrow();
    expect(dayAt(0)).toEqual(DAY[0]);
    expect(dayAt(4)).toEqual(DAY[4]);
    const mid = dayAt(3.5);
    expect(mid.sun.y).toBeGreaterThan(DAY[3].sun.y);
    expect(mid.sun.y).toBeLessThan(DAY[4].sun.y);
  });
});

describe('lofi', () => {
  it('plays where its sections are and nowhere else', () => {
    const len = 12, mix = new Mixer(len, SR).bus('music', { gain: 1 });
    lofi(mix, len, SR, { sections: [{ from: 2, to: 8, drums: 1, tune: 1 }], crackle: 0, swells: false });
    const out = mix.render({ ceiling: -1 }).left;
    expect(out.every(Number.isFinite)).toBe(true);
    expect(rms(out, 0, 1.9)).toBeLessThan(1e-4);
    expect(rms(out, 2, 8)).toBeGreaterThan(0.01);
  });

  it('names a missing chord', () => {
    const mix = new Mixer(4, SR).bus('music');
    expect(() => lofi(mix, 4, SR, { sections: [{ from: 0, to: 4 }], loop: ['Hmaj7'] })).toThrow(/Hmaj7/);
  });
});

describe('foley', () => {
  it('every effect is finite, audible and within range', () => {
    const buffers: [string, Float32Array][] = [
      ['pop', foley.pop(1, SR)], ['knock', foley.knock(1, SR)], ['letter', foley.letter(1, SR, 3)], ['slide', foley.slide(1, SR)],
      ['whoosh', foley.whoosh(1, SR)], ['swish', foley.swish(1, SR)], ['tape', foley.tape(1, SR)], ['tap', foley.tap(1, SR)],
      ['click', foley.click(1, SR)], ['crumple', foley.crumple(1, SR)], ['stamp', foley.stamp(1, SR)], ['clank', foley.clank(1, SR)],
      ['shutter', foley.shutter(1, SR)], ['whirr', foley.whirr(1, SR)], ['chime', foley.chime(SR)], ['uhOh', foley.uhOh(SR)],
      ['birds', foley.birds(1, SR)], ['gull', foley.gull(SR)], ['surf', foley.surf(1, SR, 6)], ['pluck', foley.pluck(1, SR)],
    ];
    for (const [name, b] of buffers) {
      expect(b.every(Number.isFinite), name).toBe(true);
      expect(peak(b), name).toBeGreaterThan(0.01);
      expect(peak(b), name).toBeLessThanOrEqual(name === "surf" ? 1 : 0.9 + 1e-6);
    }
  });
});

describe('Narration', () => {
  const voice: Voice = {
    length: 6, rate: 48000, samples: new Float32Array(1),
    blocks: [{
      id: 'a', text: 'Hello paper-plane world. Second part here, with more words to split.', start: 0.2, end: 4,
      words: [['Hello', 0.2, 0.5], ['paper', 0.5, 0.8], ['plane', 0.8, 1.1], ['world', 1.1, 1.5], ['Second', 2, 2.3], ['part', 2.3, 2.5], ['here', 2.5, 2.8],
        ['with', 2.9, 3], ['more', 3, 3.2], ['words', 3.2, 3.4], ['to', 3.4, 3.5], ['split', 3.5, 3.9]],
    }],
  };
  const n = new Narration(voice, 1);

  it('puts words on the film clock, a hyphenated word at its first token', () => {
    expect(n.block('a')).toEqual({ start: 1.2, end: 5 });
    expect(n.at('a', 'paper')).toBeCloseTo(1.5);
    expect(n.at('a', 'world')).toBeCloseTo(2.1);
    expect(n.at('a', 'w', 2)).toBeCloseTo(3.9);
    expect(() => n.at('a', 'nope')).toThrow(/nope/);
    expect(() => n.block('b')).toThrow(/b/);
  });

  it('cuts subtitles at punctuation and at the word limit, each timed to its first word', () => {
    const subs = n.subtitles(4);
    expect(subs.map(s => s.text)).toEqual(['Hello paper-plane world.', 'Second part here,', 'with more words to', 'split.']);
    expect(subs[0].from).toBeCloseTo(1.08);
    expect(subs[0].to).toBeCloseTo(subs[1].from);
    expect(subs[3].to).toBeCloseTo(5.35);
  });
});
