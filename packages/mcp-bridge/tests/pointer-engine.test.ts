import { describe, it, expect } from 'vitest';
import { PointerEngine } from '../src/pointer-engine';

describe('PointerEngine', () => {
  it('should create a pointer with valid compression rate', async () => {
    const engine = new PointerEngine();
    const content = 'A'.repeat(4000); // ~1000 tokens
    const pointer = await engine.createPointer(content, 'did:memron:agent123', 'store_abc123', 'conversation');

    expect(pointer.id).toMatch(/^ptr_/);
    expect(pointer.compressionRate).toBeGreaterThan(0.89);
    expect(pointer.compressionRate).toBeLessThan(1);
    expect(pointer.originalTokens).toBeGreaterThan(pointer.pointerTokens);
  });

  it('should resolve a created pointer', async () => {
    const engine = new PointerEngine();
    const pointer = await engine.createPointer('test content', 'did:memron:agent123', 'store_abc123', 'knowledge');
    const resolved = engine.resolve(pointer.id);

    expect(resolved).toBeDefined();
    expect(resolved?.targetStorageId).toBe('store_abc123');
  });

  it('should track compression stats', async () => {
    const engine = new PointerEngine();
    await engine.createPointer('A'.repeat(4000), 'did:memron:agent1', 'store_1', 'conversation');
    await engine.createPointer('B'.repeat(8000), 'did:memron:agent2', 'store_2', 'knowledge');

    const stats = engine.getStats();
    expect(stats.pointerCount).toBe(2);
    expect(stats.overallRate).toBeGreaterThan(0.89);
  });
});
