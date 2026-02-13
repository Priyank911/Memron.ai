import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WalletProvider } from './providers/wallet-provider';
import { DashboardLayout } from './layouts/dashboard-layout';
import { SyncUpDashboard } from './pages/sync-up-dashboard';
import { MemoryExplorer } from './pages/memory-explorer';
import { DropInbox } from './pages/drop-inbox';
import { AccessControl } from './pages/access-control';
import { TrustScores } from './pages/trust-scores';
import { Settings } from './pages/settings';
import { ConnectWallet } from './pages/connect-wallet';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/connect" element={<ConnectWallet />} />
            <Route path="/" element={<DashboardLayout />}>
              <Route index element={<SyncUpDashboard />} />
              <Route path="memory" element={<MemoryExplorer />} />
              <Route path="drops" element={<DropInbox />} />
              <Route path="access" element={<AccessControl />} />
              <Route path="trust" element={<TrustScores />} />
              <Route path="settings" element={<Settings />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </WalletProvider>
    </QueryClientProvider>
  );
}
