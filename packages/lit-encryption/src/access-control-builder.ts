/**
 * AccessControlBuilder — Fluent API for building Lit Protocol
 * Access Control Conditions (ACCs) based on DIDs and wallet addresses.
 */
export class AccessControlBuilder {
  private conditions: any[] = [];

  /** Allow a specific wallet address */
  allowAddress(address: string): this {
    this.conditions.push({
      contractAddress: '',
      standardContractType: '',
      chain: 'ethereum',
      method: '',
      parameters: [':userAddress'],
      returnValueTest: {
        comparator: '=',
        value: address.toLowerCase(),
      },
    });
    return this;
  }

  /** Allow a specific DID (derived from wallet) */
  allowDid(did: string): this {
    const address = did.split(':').pop() || '';
    return this.allowAddress(address);
  }

  /** Allow holders of a specific NFT */
  allowNftHolder(contractAddress: string, chain = 'ethereum'): this {
    this.conditions.push({
      contractAddress,
      standardContractType: 'ERC721',
      chain,
      method: 'balanceOf',
      parameters: [':userAddress'],
      returnValueTest: {
        comparator: '>',
        value: '0',
      },
    });
    return this;
  }

  /** Add OR operator between conditions */
  or(): this {
    this.conditions.push({ operator: 'or' });
    return this;
  }

  /** Add AND operator between conditions */
  and(): this {
    this.conditions.push({ operator: 'and' });
    return this;
  }

  /** Build the final ACC array */
  build(): any[] {
    return [...this.conditions];
  }
}
