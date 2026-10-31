import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Server,
  PlusCircle,
  Settings,
  ShieldAlert,
  Activity,
  Sun,
  Moon,
  Gauge,
  List,
  Timer,
  Cpu,
  Package,
  HardDrive,
  ChevronDown
} from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const MENU_ITEMS = [
  {
    label: 'Main',
    icon: Gauge,
    children: [
      { path: '/', label: 'Dashboard', icon: LayoutDashboard },
      { path: '/overview', label: 'Overview', icon: List },
      { path: '/sla', label: 'SLA', icon: Timer }
    ]
  },
  {
    label: 'Server',
    icon: Server,
    children: [
      { path: '/servers', label: 'Server Management', icon: HardDrive },
      { path: '/servers/new', label: 'Add Server', icon: PlusCircle }
    ]
  },
  {
    label: 'Agent',
    icon: Cpu,
    children: [
      { path: '/agents', label: 'Agents', icon: Cpu },
      { path: '/agents/inventory', label: 'Inventory', icon: Package }
    ]
  },
  { path: '/cve', label: 'Vulnerabilities', icon: ShieldAlert },
  { path: '/dashboards', label: 'Grafana', icon: Activity },
  { path: '/settings', label: 'Settings', icon: Settings }
];

// Liste à plat de toutes les routes (items simples + enfants des groupes)
const FLAT_ITEMS = MENU_ITEMS.flatMap((item) => (item.children ? item.children : [item]));

const matchesPath = (pathname, itemPath) =>
  itemPath === '/'
    ? pathname === '/'
    : pathname === itemPath || pathname.startsWith(`${itemPath}/`);

const Sidebar = () => {
  const { pathname } = useLocation();
  const { theme, toggle } = useTheme();
  const [openGroups, setOpenGroups] = useState({ Main: true, Server: true, Agent: true });

  // Un seul item actif : le chemin le plus spécifique (ex. /servers/new l'emporte sur /servers, /agents/inventory sur /agents)
  const activePath = FLAT_ITEMS
    .filter((item) => matchesPath(pathname, item.path))
    .sort((a, b) => b.path.length - a.path.length)[0]?.path;

  const toggleGroup = (label) =>
    setOpenGroups((prev) => ({ ...prev, [label]: !prev[label] }));

  const ThemeIcon = theme === 'dark' ? Moon : Sun;

  const renderLink = (item, isSub = false) => {
    const Icon = item.icon;
    const isActive = item.path === activePath;

    return (
      <li key={item.path}>
        <Link
          to={item.path}
          className={`nav-link${isSub ? ' nav-sublink' : ''}${isActive ? ' active' : ''}`}
          aria-current={isActive ? 'page' : undefined}
          title={item.label}
        >
          <Icon size={16} strokeWidth={1.75} />
          <span>{item.label}</span>
        </Link>
      </li>
    );
  };

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
              if (!item.children) return renderLink(item);

              const Icon = item.icon;
              const hasActiveChild = item.children.some((c) => c.path === activePath);
              const isOpen = !!openGroups[item.label];

              return (
                <li key={item.label}>
                  <button
                    type="button"
                    className={`nav-link nav-group-toggle${hasActiveChild ? ' has-active' : ''}`}
                    onClick={() => toggleGroup(item.label)}
                    aria-expanded={isOpen}
                    title={item.label}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    <span>{item.label}</span>
                    <ChevronDown
                      size={14}
                      className="nav-chevron"
                      style={{ transform: isOpen ? 'rotate(0deg)' : 'rotate(-90deg)' }}
                    />
                  </button>

                  {isOpen && (
                    <ul className="nav-sublist">
                      {item.children.map((child) => renderLink(child, true))}
                    </ul>
                  )}
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