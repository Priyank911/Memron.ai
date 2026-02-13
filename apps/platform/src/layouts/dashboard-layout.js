import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Outlet } from 'react-router-dom';
import { Sidebar } from '@/components/sidebar';
import { TopBar } from '@/components/top-bar';
export function DashboardLayout() {
    return (_jsxs("div", { className: "flex h-screen bg-black", children: [_jsx(Sidebar, {}), _jsxs("div", { className: "flex flex-1 flex-col overflow-hidden", children: [_jsx(TopBar, {}), _jsx("main", { className: "flex-1 overflow-y-auto p-6", children: _jsx(Outlet, {}) })] })] }));
}
//# sourceMappingURL=dashboard-layout.js.map