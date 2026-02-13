// Wallet provider wrapping RainbowKit + wagmi for DID-based identity
import type { ReactNode } from 'react';

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps) {
  // TODO: Configure wagmi chains, RainbowKit, WalletConnect
  return <>{children}</>;
}
