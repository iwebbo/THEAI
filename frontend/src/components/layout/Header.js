import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Header = ({ user, onLogout }) => {
  const location = useLocation();

  // Fonction pour déterminer si un lien est actif
  const isActive = (path) => location.pathname === path;

  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid #e5e7eb',
      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 1000,
      width: '100%' // Force la largeur complète
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        height: '64px',
        width: '100%', // Largeur complète au lieu de maxWidth
        padding: '0 1.5rem'
        // Suppression de margin: '0 auto' et maxWidth: '1200px'
      }}>
        {/* Logo THEAI */}
        <Link to="/" style={{ 
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          textDecoration: 'none',
          color: '#1f2937'
        }}>
          {/* Icône hexagonale THEAI */}
          <div style={{
            position: 'relative',
            width: '40px',
            height: '40px'
          }}>
            {/* Hexagone bleu */}
            <svg width="40" height="40" viewBox="0 0 100 100" style={{ display: 'block' }}>
              <polygon 
                points="50,10 80,30 80,70 50,90 20,70 20,30" 
                fill="#3b82f6"
                stroke="none"
              />
              {/* Motif intérieur inspiré du logo */}
              <g fill="white" stroke="white" strokeWidth="3">
                <line x1="35" y1="35" x2="65" y2="65" />
                <line x1="65" y1="35" x2="35" y2="65" />
                <line x1="50" y1="25" x2="50" y2="75" />
                <line x1="30" y1="50" x2="70" y2="50" />
              </g>
            </svg>
          </div>
          
          {/* Nom de l'application */}
          <div>
            <h1 style={{ 
              margin: 0, 
              fontSize: '1.5rem',
              fontWeight: '700',
              color: '#1f2937',
              letterSpacing: '0.05em'
            }}>
              THEAI
            </h1>
            <div style={{
              fontSize: '0.75rem',
              color: '#6b7280',
              fontWeight: '500',
              marginTop: '-2px',
              letterSpacing: '0.025em'
            }}>
              Monitoring & Vulnerability
            </div>
          </div>
        </Link>
        
        {/* User info and actions */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          {/* GitHub Link */}
          <a 
            href="https://github.com/iwebbo/THEAI" 
            target="_blank" 
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              padding: '0.5rem 1rem',
              backgroundColor: '#1f2937',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '0.5rem',
              fontSize: '0.875rem',
              fontWeight: '500',
              transition: 'all 0.2s ease',
              border: '1px solid #374151'
            }}
            onMouseOver={(e) => {
              e.target.style.backgroundColor = '#374151';
              e.target.style.transform = 'translateY(-1px)';
            }}
            onMouseOut={(e) => {
              e.target.style.backgroundColor = '#1f2937';
              e.target.style.transform = 'translateY(0)';
            }}
          >
            {/* GitHub Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.374 0 0 5.373 0 12 0 17.302 3.438 21.8 8.207 23.387c.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0112 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.627-5.373-12-12-12z"/>
            </svg>
            
            <span>Star on GitHub</span>
          </a>

          {/* User menu */}
          {user && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem'
            }}>
              {/* Username */}
              <span style={{
                fontSize: '0.875rem',
                color: '#6b7280',
                fontWeight: '500'
              }}>
                {user.username}
              </span>

              {/* Logout button */}
              <button
                onClick={onLogout}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#f3f4f6',
                  color: '#374151',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.5rem',
                  fontSize: '0.875rem',
                  fontWeight: '500',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
                onMouseOver={(e) => {
                  e.target.style.backgroundColor = '#e5e7eb';
                  e.target.style.borderColor = '#9ca3af';
                }}
                onMouseOut={(e) => {
                  e.target.style.backgroundColor = '#f3f4f6';
                  e.target.style.borderColor = '#d1d5db';
                }}
              >
                Logout
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Header;