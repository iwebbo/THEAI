import React, { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { LogOut, User, ChevronDown } from 'lucide-react';

const getPageLabel = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return 'Dashboard';

  const [root, second, third] = parts;

  if (root === 'servers') {
    if (!second) return 'Servers';
    if (second === 'new') return 'Add server';
    if (second === 'edit') return 'Edit server';
    if (third === 'security') return 'Security';
    return 'Server detail';
  }
  if (root === 'cve') return 'Vulnerabilities';
  if (root === 'dashboards') return 'Grafana';
  if (root === 'settings') return 'Settings';
  return root;
};

const getCrumbs = (pathname) => {
  const parts = pathname.split('/').filter(Boolean);
  const crumbs = ['Workspace'];
  if (parts[0] === 'servers' && parts.length > 1) crumbs.push('Servers');
  crumbs.push(getPageLabel(pathname));
  return crumbs;
};

const Header = ({ user, onLogout }) => {
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Fermeture du menu : clic extérieur ou Échap
  useEffect(() => {
    if (!open) return undefined;

    const onMouseDown = (e) => {
      if (menuRef.current && !menuRef.current.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const crumbs = getCrumbs(pathname);

  return (
    <header className="topbar">
      <div className="crumbs">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <React.Fragment key={`${crumb}-${index}`}>
              {index > 0 && <span style={{ color: 'var(--gray-400)' }}>/</span>}
              <span className={isLast ? 'crumb-current' : undefined}>{crumb}</span>
            </React.Fragment>
          );
        })}
      </div>

      {user && (
        <div className="user-menu-wrap" ref={menuRef}>
          <button
            type="button"
            className={`user-btn${open ? ' open' : ''}`}
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
          >
            <div className="user-avatar">{user.username?.charAt(0).toUpperCase() || 'U'}</div>
            <span>{user.username}</span>
            <ChevronDown
              size={14}
              style={{
                color: 'var(--text-muted)',
                transition: 'transform 150ms',
                transform: open ? 'rotate(180deg)' : 'rotate(0deg)'
              }}
            />
          </button>

          {open && (
            <div className="user-dropdown animate-fadeIn" role="menu">
              <div className="user-dropdown-info">
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--text-primary)' }}>
                  {user.username}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--text-muted)', marginTop: '0.125rem' }}>
                  {user.email || 'No email'}
                </div>
                {user.is_admin && (
                  <span className="badge badge-primary" style={{ marginTop: '0.5rem' }}>
                    <User size={10} />
                    Admin
                  </span>
                )}
              </div>

              <button
                type="button"
                className="dropdown-item danger"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onLogout();
                }}
              >
                <LogOut size={14} />
                Logout
              </button>
            </div>
          )}
        </div>
      )}
    </header>
  );
};

export default Header;
