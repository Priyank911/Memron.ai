import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DashboardLayout } from './layouts/dashboard-layout';
import { SyncUpDashboard } from './pages/sync-up-dashboard';
import { MemoryExplorer } from './pages/memory-explorer';
import { DropInbox } from './pages/drop-inbox';
import { AccessControl } from './pages/access-control';
import { TrustScores } from './pages/trust-scores';
import { Settings } from './pages/settings';
import { LoginPage } from './pages/login';

const queryClient = new QueryClient();

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
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
    </QueryClientProvider>
  );
}
