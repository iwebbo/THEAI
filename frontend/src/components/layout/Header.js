import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogOut, User, ChevronDown } from 'lucide-react';
import logoPng from '../../assets/logo.png';

const Header = ({ user, onLogout }) => {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header
      style={{
        backgroundColor: 'var(--bg-primary)',
        borderBottom: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-sm)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 1000,
        width: '100%'
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          height: '64px',
          width: '100%',
          padding: '0 1.5rem'
        }}
      >
        {/* Logo THEAI */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            textDecoration: 'none',
            color: 'var(--text-primary)',
            transition: 'opacity 200ms'
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
        >
          <div
            style={{
              position: 'relative',
              width: '115px',
              height: '115px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden'
            }}
          >
            <img
              src={logoPng}
              alt="THEAI"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain'
              }}
            />
          </div>
        </Link>

        {/* User Menu */}
        {user && (
          <div style={{ position: 'relative' }}>
            <button
              onClick={() => setShowUserMenu(!showUserMenu)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                padding: '0.5rem 1rem',
                backgroundColor: showUserMenu ? 'var(--gray-50)' : 'transparent',
                border: '1px solid var(--border-light)',
                borderRadius: 'var(--radius-lg)',
                cursor: 'pointer',
                transition: 'all 200ms',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: 'var(--text-primary)'
              }}
              onMouseEnter={(e) => {
                if (!showUserMenu) {
                  e.currentTarget.style.backgroundColor = 'var(--gray-50)';
                }
              }}
              onMouseLeave={(e) => {
                if (!showUserMenu) {
                  e.currentTarget.style.backgroundColor = 'transparent';
                }
              }}
            >
              <div
                style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary-100)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: 'var(--primary-700)',
                  fontWeight: 600
                }}
              >
                {user.username?.charAt(0).toUpperCase() || 'U'}
              </div>
              <span>{user.username}</span>
              <ChevronDown
                size={16}
                style={{
                  transition: 'transform 200ms',
                  transform: showUserMenu ? 'rotate(180deg)' : 'rotate(0deg)'
                }}
              />
            </button>

            {/* Dropdown Menu */}
            {showUserMenu && (
              <div
                className="animate-fadeIn"
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 0.5rem)',
                  right: 0,
                  minWidth: '200px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-light)',
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: '0.5rem',
                  zIndex: 50
                }}
                onMouseLeave={() => setShowUserMenu(false)}
              >
                {/* User Info */}
                <div
                  style={{
                    padding: '0.75rem',
                    borderBottom: '1px solid var(--border-light)',
                    marginBottom: '0.5rem'
                  }}
                >
                  <div
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginBottom: '0.25rem'
                    }}
                  >
                    {user.username}
                  </div>
                  <div
                    style={{
                      fontSize: '0.75rem',
                      color: 'var(--text-tertiary)'
                    }}
                  >
                    {user.email || 'No email'}
                  </div>
                  {user.is_admin && (
                    <span
                      className="badge badge-primary"
                      style={{
                        marginTop: '0.5rem',
                        fontSize: '0.625rem'
                      }}
                    >
                      <User size={10} />
                      Admin
                    </span>
                  )}
                </div>

                {/* Logout Button */}
                <button
                  onClick={() => {
                    setShowUserMenu(false);
                    onLogout();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    padding: '0.75rem',
                    backgroundColor: 'transparent',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    fontSize: '0.875rem',
                    color: 'var(--error-600)',
                    fontWeight: 500,
                    transition: 'background-color 200ms',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--error-50)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;