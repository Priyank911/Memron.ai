import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { NavLink } from 'react-router-dom';
const navItems = [
    { to: '/', label: 'Sync-Up', icon: 'RefreshCw' },
    { to: '/memory', label: 'Memory Explorer', icon: 'Brain' },
    { to: '/drops', label: 'Drop Inbox', icon: 'Inbox' },
    { to: '/access', label: 'Access Control', icon: 'Shield' },
    { to: '/trust', label: 'Trust Registry', icon: 'Award' },
    { to: '/settings', label: 'Settings', icon: 'Settings' },
];
export function Sidebar() {
    return (_jsxs("aside", { className: "flex w-64 flex-col border-r border-zinc-800 bg-zinc-950 p-4", children: [_jsxs("div", { className: "mb-8 flex items-center gap-2 px-2", children: [_jsx("div", { className: "h-8 w-8 rounded-lg bg-indigo-600" }), _jsx("span", { className: "text-lg font-bold", children: "Memron" })] }), _jsx("nav", { className: "flex flex-1 flex-col gap-1", children: navItems.map((item) => (_jsx(NavLink, { to: item.to, end: item.to === '/', className: ({ isActive }) => `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-indigo-600/20 text-indigo-400' : 'text-zinc-400 hover:text-white'}`, children: item.label }, item.to))) })] }));
}
//# sourceMappingURL=sidebar.js.map