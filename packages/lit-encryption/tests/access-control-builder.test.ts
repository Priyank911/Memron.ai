import { describe, it, expect } from 'vitest';
import { AccessControlBuilder } from '../src/access-control-builder';

describe('AccessControlBuilder', () => {
  it('should build ACC for a single DID', () => {
    const acc = new AccessControlBuilder()
      .allowDid('did:ethr:0xabc123')
      .build();

    expect(acc).toHaveLength(1);
    expect(acc[0].returnValueTest.value).toBe('0xabc123');
  });

  it('should build ACC with OR between two DIDs', () => {
    const acc = new AccessControlBuilder()
      .allowDid('did:ethr:0xabc123')
      .or()
      .allowDid('did:ethr:0xdef456')
      .build();

    expect(acc).toHaveLength(3);
    expect(acc[1]).toEqual({ operator: 'or' });
  });
});
