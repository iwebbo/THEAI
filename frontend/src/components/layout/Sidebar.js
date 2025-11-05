import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Server, PlusCircle, Settings } from 'lucide-react';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: LayoutDashboard
    },
    {
      path: '/servers',
      label: 'All Servers',
      icon: Server
    },
    {
      path: '/servers/new',
      label: 'Add Server',
      icon: PlusCircle
    },
    {
      path: '/settings',
      label: 'Settings',
      icon: Settings
    }
  ];

  return (
    <aside
      style={{
        width: '250px',
        backgroundColor: 'var(--bg-primary)',
        borderRight: '1px solid var(--border-light)',
        height: '100vh',
        position: 'fixed',
        top: '64px',
        left: 0,
        overflow: 'auto',
        zIndex: 100,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <nav style={{ padding: '1.5rem 0' }}>
        <ul
          style={{
            listStyle: 'none',
            padding: 0,
            margin: 0
          }}
        >
          {menuItems.map((item) => {
            const isActive = item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

            const Icon = item.icon;

            return (
              <li key={item.path} style={{ marginBottom: '0.25rem' }}>
                <NavLink
                  to={item.path}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1.5rem',
                    margin: '0 0.75rem',
                    color: isActive ? 'var(--primary-700)' : 'var(--text-secondary)',
                    backgroundColor: isActive ? 'var(--primary-50)' : 'transparent',
                    textDecoration: 'none',
                    borderRadius: '0.75rem',
                    fontWeight: isActive ? '600' : '500',
                    fontSize: '0.875rem',
                    transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
                    border: isActive ? '1px solid var(--primary-200)' : '1px solid transparent',
                    position: 'relative'
                  }}
                  onMouseEnter={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'var(--gray-50)';
                      e.currentTarget.style.color = 'var(--text-primary)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isActive) {
                      e.currentTarget.style.backgroundColor = 'transparent';
                      e.currentTarget.style.color = 'var(--text-secondary)';
                    }
                  }}
                >
                  {/* Barre verticale pour item actif */}
                  {isActive && (
                    <div
                      style={{
                        position: 'absolute',
                        left: 0,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: '3px',
                        height: '70%',
                        backgroundColor: 'var(--primary-600)',
                        borderRadius: '0 2px 2px 0'
                      }}
                    />
                  )}

                  <Icon
                    size={20}
                    style={{
                      color: isActive ? 'var(--primary-600)' : 'inherit'
                    }}
                  />

                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer info */}
      <div
        style={{
          position: 'absolute',
          bottom: '1rem',
          left: '1.5rem',
          right: '1.5rem',
          padding: '1rem',
          backgroundColor: 'var(--gray-50)',
          borderRadius: '0.75rem',
          border: '1px solid var(--border-light)'
        }}
      >
        <p
          style={{
            fontSize: '0.75rem',
            color: 'var(--text-tertiary)',
            margin: 0,
            textAlign: 'center'
          }}
        >
          THEAI Monitoring
          <br />
          <strong style={{ color: 'var(--text-secondary)' }}>v1.0.0</strong>
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;