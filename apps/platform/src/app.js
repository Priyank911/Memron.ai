import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
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
import { LoginPage } from './pages/login';
const queryClient = new QueryClient();
export function App() {
    return (_jsx(QueryClientProvider, { client: queryClient, children: _jsx(WalletProvider, { children: _jsx(BrowserRouter, { children: _jsxs(Routes, { children: [_jsx(Route, { path: "/login", element: _jsx(LoginPage, {}) }), _jsxs(Route, { path: "/", element: _jsx(DashboardLayout, {}), children: [_jsx(Route, { index: true, element: _jsx(SyncUpDashboard, {}) }), _jsx(Route, { path: "memory", element: _jsx(MemoryExplorer, {}) }), _jsx(Route, { path: "drops", element: _jsx(DropInbox, {}) }), _jsx(Route, { path: "access", element: _jsx(AccessControl, {}) }), _jsx(Route, { path: "trust", element: _jsx(TrustScores, {}) }), _jsx(Route, { path: "settings", element: _jsx(Settings, {}) })] })] }) }) }) }));
}
//# sourceMappingURL=app.js.map