export interface LitConfig {
  network: 'datil-dev' | 'datil-test' | 'datil';
  relayApiKey?: string;
  debug?: boolean;
}

export interface EncryptionResult {
  ciphertext: string;
  dataToEncryptHash: string;
  encryptedSymmetricKey: string;
  accessControlConditionHash: string;
}

export interface DecryptionResult {
  decryptedContent: string;
  success: boolean;
  error?: string;
}
