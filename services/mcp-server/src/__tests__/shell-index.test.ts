import { describe, expect, it } from 'vitest';
import { analyzeShellQuery, extractShellKeys, normalizeKey } from '../retrieval/shell-index.js';
import { classifyRecallQuery } from '../engine/unified-memory-engine.js';

const ARIGRAPH = 'AriGraph is a memory graph architecture with semantic and episodic nodes. Graph as policy treats the knowledge graph as the agent policy.';

describe('shell key extraction', () => {
  it('addresses the body, not just the title', () => {
    const keys = extractShellKeys(ARIGRAPH).map((k) => k.key);
    expect(keys).toContain('arigraph');
    expect(keys).toContain('ari graph');
    expect(keys).toContain('graph policy');
    expect(keys).toContain('episodic');
  });

  it('marks proper nouns and compounds as entities', () => {
    const byKey = new Map(extractShellKeys('Jev AI uses HippoRAG and GPT-4 on Cloudflare Workers').map((k) => [k.key, k]));
    expect(byKey.get('jev ai')?.kind).toBe('entity');
    expect(byKey.get('hipporag')?.kind).toBe('entity');
    expect(byKey.get('cloudflare workers')?.kind).toBe('entity');
    expect(byKey.get('gpt 4')?.kind).toBe('entity');
  });

  it('indexes tags as entities', () => {
    const keys = extractShellKeys('plain lowercase text', ['Roadmap Q4']);
    expect(keys.find((k) => k.key === 'roadmap q4')?.kind).toBe('entity');
  });

  it('is bounded', () => {
    const big = Array.from({ length: 5000 }, (_, i) => `word${i}x`).join(' ');
    expect(extractShellKeys(big).length).toBeLessThanOrEqual(120);
  });
});

describe('shell query analysis', () => {
  it('turns a lowercase entity query into an address that matches storage', () => {
    const stored = new Set(extractShellKeys(ARIGRAPH).map((k) => k.key));
    const q = analyzeShellQuery('arigraph');
    expect(q.terms).toEqual(['arigraph']);
    expect(q.keys.some((k) => stored.has(k))).toBe(true);
  });

  it('resolves "graph as policy" to the stored phrase', () => {
    const stored = new Set(extractShellKeys(ARIGRAPH).map((k) => k.key));
    const q = analyzeShellQuery('graph as policy');
    expect(q.terms).toEqual(['graph', 'policy']);
    expect(q.keys).toContain('graph policy');
    expect(stored.has('graph policy')).toBe(true);
  });

  it('drops question and generic words so they cannot anchor a hit', () => {
    const q = analyzeShellQuery('what is the name of the project');
    expect(q.terms).toEqual([]);
  });

  it('flags named entities, ignoring sentence-initial question words', () => {
    expect(analyzeShellQuery('Tell me about AriGraph').hasNamedEntity).toBe(true);
    expect(analyzeShellQuery('What throughput target did the team commit to').hasNamedEntity).toBe(false);
  });

  it('normalizes keys consistently', () => {
    expect(normalizeKey('  Ari-Graph  ')).toBe('ari graph');
  });
});

describe('recall classifier hardening', () => {
  it('does not treat a leading question word as a second entity', () => {
    expect(classifyRecallQuery('What does Helios use').kind).toBe('fact');
  });

  it('does not go broad on the word "all"', () => {
    expect(classifyRecallQuery('is all of the auth done').kind).toBe('fact');
  });
});
