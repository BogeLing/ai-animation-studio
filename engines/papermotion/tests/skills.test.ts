import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

// Each skill lives in .agents/skills/ (the open Agent Skills location that Codex reads) with a copy in
// .claude/skills/ (which Claude Code reads), at the repository root and in this engine.
const engine = fileURLToPath(new URL('..', import.meta.url));
const bases = [join(engine, '..', '..'), engine];
const files = (dir: string): string[] => readdirSync(dir).flatMap(f => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : [join(dir, f)]));
const skills = (base: string, where: string): string[] => { const dir = join(base, where, 'skills'); return existsSync(dir) ? readdirSync(dir).sort() : []; };

describe('skills', () => {
  for (const base of bases) {
    const at = relative(join(engine, '..', '..'), base) || 'repository root';

    it(`${at}: .claude/skills mirrors .agents/skills exactly (run tools/sync-skills.sh after editing a skill)`, () => {
      expect(skills(base, '.agents').length).toBeGreaterThan(0);
      expect(skills(base, '.claude')).toEqual(skills(base, '.agents'));
      for (const name of skills(base, '.agents')) {
        const src = join(base, '.agents', 'skills', name), dst = join(base, '.claude', 'skills', name);
        const list = (dir: string) => files(dir).map(f => relative(dir, f)).sort();
        expect(list(dst), name).toEqual(list(src));
        for (const f of list(src)) expect(readFileSync(join(dst, f), 'utf8'), `${name}/${f}`).toBe(readFileSync(join(src, f), 'utf8'));
      }
    });

    it(`${at}: every SKILL.md follows the Agent Skills specification`, () => {
      for (const name of skills(base, '.agents')) {
        const text = readFileSync(join(base, '.agents', 'skills', name, 'SKILL.md'), 'utf8');
        const front = text.match(/^---\n([\s\S]*?)\n---\n/)?.[1] ?? '';
        const field = (key: string) => front.match(new RegExp(`^${key}: (.*)$`, 'm'))?.[1];
        expect(field('name'), name).toBe(name);
        expect(name).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
        expect(name.length).toBeLessThanOrEqual(64);
        expect(field('description')?.length ?? 0, `${name} description`).toBeGreaterThan(0);
        expect(field('description')!.length, `${name} description`).toBeLessThanOrEqual(1024);
        expect(field('compatibility')?.length ?? 0, `${name} compatibility`).toBeLessThanOrEqual(500);
      }
    });
  }
});
