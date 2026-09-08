import { describe, it, expect, vi } from 'vitest';
import { NameGenerator } from '../../client/name-generator.js';

describe('NameGenerator.generate', () => {
  it('возвращает пару "прилагательное существительное" из списков', () => {
    for (let i = 0; i < 200; i++) {
      const name = NameGenerator.generate();
      const [adjective, noun] = name.split(' ');
      expect(adjective).toBeTruthy();
      expect(noun).toBeTruthy();
      expect(NameGenerator.adjectives).toContain(adjective);
      expect(NameGenerator.nouns).toContain(noun);
    }
  });
});

describe('NameGenerator.isUnique', () => {
  it('различает уникальные и повторяющиеся имена', () => {
    expect(NameGenerator.isUnique('весёлый слон', ['тихий ёж'])).toBe(true);
    expect(NameGenerator.isUnique('весёлый слон', ['весёлый слон'])).toBe(false);
    expect(NameGenerator.isUnique('весёлый слон', [])).toBe(true);
  });
});

describe('NameGenerator.generateUnique', () => {
  it('возвращает имя, не входящее в список существующих', () => {
    const existing = ['весёлый слон', 'тигр'];
    const name = NameGenerator.generateUnique(existing);
    expect(existing).not.toContain(name);
  });

  it('останавливается после 10 попыток даже без уникального результата', () => {
    const spy = vi.spyOn(NameGenerator, 'generate').mockReturnValue('дубликат');
    const name = NameGenerator.generateUnique(['дубликат']);
    expect(name).toBe('дубликат');
    expect(spy).toHaveBeenCalledTimes(10);
    spy.mockRestore();
  });
});
