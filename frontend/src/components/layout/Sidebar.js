import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  PlusCircle,
  Settings,
  ShieldAlert,
  Activity,
  Sun,
  Moon
} from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const MENU_ITEMS = [
  { path: '/', label: 'Dashboard', icon: LayoutDashboard },
  { path: '/servers', label: 'All Servers', icon: Server },
  { path: '/servers/new', label: 'Add Server', icon: PlusCircle },
  { path: '/cve', label: 'Vulnerabilities', icon: ShieldAlert },
  { path: '/dashboards', label: 'Grafana', icon: Activity },
  { path: '/settings', label: 'Settings', icon: Settings }
];

const matchesPath = (pathname, itemPath) =>
  itemPath === '/'
    ? pathname === '/'
    : pathname === itemPath || pathname.startsWith(`${itemPath}/`);

const Sidebar = () => {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();

  // Un seul item actif : le chemin le plus spécifique (ex. /servers/new l'emporte sur /servers)
  const activePath = MENU_ITEMS
    .filter((item) => matchesPath(pathname, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  const ThemeIcon = theme === 'dark' ? Moon : Sun;

  return (
    <aside className="sidebar">
      <div>
        <Link to="/" className="sidebar-brand">
          <div className="brand-mark">AI</div>
          <div className="brand-text">
            <span className="brand-title">THEAI.io</span>
            <span className="brand-sub">v1.0.0</span>
          </div>
        </Link>

        <nav>
          <ul className="nav-list">
            {MENU_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = item.path === activePath;

              return (
                <li key={item.path}>
                  <Link
                    to={item.path}
                    className={`nav-link${isActive ? ' active' : ''}`}
                    aria-current={isActive ? 'page' : undefined}
                    title={item.label}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>

      <div className="sidebar-footer">
        <button type="button" className="theme-toggle" onClick={toggle} title="Toggle theme">
          <div className="theme-toggle-label">
            <ThemeIcon size={16} strokeWidth={1.75} />
            <span>Theme</span>
          </div>
          <span className="theme-toggle-value">{theme}</span>
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
