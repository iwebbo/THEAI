import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';

const Sidebar = () => {
  const location = useLocation();

  const menuItems = [
    {
      path: '/',
      label: 'Dashboard',
      icon: '📊'
    },
    {
      path: '/servers',
      label: 'View all servers',
      icon: '🖥️'
    },
    {
      path: '/servers/new',
      label: 'Add new server',
      icon: '➕'
    },
    {
      path: '/settings',
      label: 'Parameters',
      icon: '⚙️'
    }
  ];

  return (
    <aside style={{
      width: '250px',
      backgroundColor: '#ffffff',
      borderRight: '1px solid #e5e7eb',
      height: '100vh',
      position: 'fixed',
      top: '64px',
      left: 0,
      overflow: 'auto',
      zIndex: 100
    }}>
      <nav style={{ padding: '1.5rem 0' }}>
        <ul style={{ 
          listStyle: 'none', 
          padding: 0, 
          margin: 0 
        }}>
          {menuItems.map((item) => {
            const isActive = item.path === '/' 
              ? location.pathname === '/' 
              : location.pathname.startsWith(item.path);
            
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
                    color: isActive ? '#1d4ed8' : '#6b7280',
                    backgroundColor: isActive ? '#eff6ff' : 'transparent',
                    textDecoration: 'none',
                    borderRadius: '0.5rem',
                    fontWeight: isActive ? '600' : '500',
                    fontSize: '0.875rem',
                    transition: 'all 0.2s ease',
                    border: isActive ? '1px solid #dbeafe' : '1px solid transparent'
                  }}
                  onMouseOver={(e) => {
                    if (!isActive) {
                      e.target.style.backgroundColor = '#f9fafb';
                      e.target.style.color = '#374151';
                    }
                  }}
                  onMouseOut={(e) => {
                    if (!isActive) {
                      e.target.style.backgroundColor = 'transparent';
                      e.target.style.color = '#6b7280';
                    }
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                  <span>{item.label}</span>
                </NavLink>
              </li>
            );
          })}
        </ul>
        
        {/* Section informations */}
        <div style={{
          margin: '2rem 1.5rem 1rem 1.5rem',
          padding: '1rem',
          backgroundColor: '#f9fafb',
          borderRadius: '0.75rem',
          border: '1px solid #e5e7eb'
        }}>
          <h4 style={{
            margin: '0 0 0.5rem 0',
            fontSize: '0.875rem',
            fontWeight: '600',
            color: '#374151'
          }}>
            💡 Info
          </h4>
          <p style={{
            margin: 0,
            fontSize: '0.75rem',
            color: '#6b7280',
            lineHeight: '1.4'
          }}>
            Monitoring in real time of your home server.
          </p>
        </div>
      </nav>
    </aside>
  );
};

export default Sidebar;