import { describe, it, expect } from 'vitest';
import { PointerEngine } from '../src/pointer-engine';

describe('PointerEngine', () => {
  it('should create a pointer with valid compression rate', async () => {
    const engine = new PointerEngine();
    const content = 'A'.repeat(4000); // ~1000 tokens
    const pointer = await engine.createPointer(content, 'did:ethr:0x123', 'bafyabc123', 'conversation');

    expect(pointer.id).toMatch(/^ptr_/);
    expect(pointer.compressionRate).toBeGreaterThan(0.89);
    expect(pointer.compressionRate).toBeLessThan(1);
    expect(pointer.originalTokens).toBeGreaterThan(pointer.pointerTokens);
  });

  it('should resolve a created pointer', async () => {
    const engine = new PointerEngine();
    const pointer = await engine.createPointer('test content', 'did:ethr:0x123', 'bafyabc123', 'knowledge');
    const resolved = engine.resolve(pointer.id);

    expect(resolved).toBeDefined();
    expect(resolved?.targetCid).toBe('bafyabc123');
  });

  it('should track compression stats', async () => {
    const engine = new PointerEngine();
    await engine.createPointer('A'.repeat(4000), 'did:ethr:0x1', 'cid1', 'conversation');
    await engine.createPointer('B'.repeat(8000), 'did:ethr:0x2', 'cid2', 'knowledge');

    const stats = engine.getStats();
    expect(stats.pointerCount).toBe(2);
    expect(stats.overallRate).toBeGreaterThan(0.89);
  });
});
