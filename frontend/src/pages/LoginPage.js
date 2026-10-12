import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, LogIn, AlertCircle, Sun, Moon } from 'lucide-react';
import axios from 'axios';
import useTheme from '../hooks/useTheme';

const iconStyle = {
  position: 'absolute',
  left: '0.75rem',
  top: '50%',
  transform: 'translateY(-50%)',
  color: 'var(--text-muted)',
  pointerEvents: 'none'
};

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const response = await axios.post('/api/v1/auth/login', formData);
      const { access_token, user } = response.data;

      // Stocker le token
      localStorage.setItem('access_token', access_token);
      localStorage.setItem('user', JSON.stringify(user));

      // Configurer axios pour les futures requêtes
      axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

      // Callback pour informer l'app du login
      if (onLogin) {
        onLogin(user, access_token);
      }

      // Rediriger vers le dashboard
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.detail || 'Login failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  const ThemeIcon = theme === 'dark' ? Moon : Sun;

  return (
    <div className="auth-page">
      <button
        type="button"
        className="btn btn-ghost btn-sm auth-theme"
        onClick={toggle}
        aria-label="Toggle theme"
        title="Toggle theme"
      >
        <ThemeIcon size={16} />
      </button>

      <div className="auth-card animate-fadeIn">
        {/* Brand */}
        <div className="sidebar-brand" style={{ padding: 0, marginBottom: '1.75rem' }}>
          <div className="brand-mark">AI</div>
          <div>
            <span className="brand-title">THEAI</span>
            <span className="brand-sub">Monitoring Platform</span>
          </div>
        </div>

        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Sign in</h1>
        <p style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          Access your monitoring dashboard
        </p>

        {/* Error */}
        {error && (
          <div
            className="animate-fadeIn"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.625rem',
              padding: '0.75rem',
              backgroundColor: 'var(--error-100)',
              border: '1px solid var(--error-200)',
              borderRadius: 'var(--radius-btn)',
              marginBottom: '1.25rem'
            }}
          >
            <AlertCircle size={16} style={{ color: 'var(--error-600)', flexShrink: 0, marginTop: '0.125rem' }} />
            <p style={{ fontSize: '0.8125rem', color: 'var(--error-600)', margin: 0 }}>{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="username">
              Username
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                id="username"
                name="username"
                value={formData.username}
                onChange={handleInputChange}
                required
                autoComplete="username"
                className="form-input"
                placeholder="Enter your username"
                style={{ paddingLeft: '2.5rem' }}
              />
              <User size={16} style={iconStyle} />
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">
              Password
            </label>
            <div style={{ position: 'relative' }}>
              <input
                type="password"
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                required
                autoComplete="current-password"
                className="form-input"
                placeholder="Enter your password"
                style={{ paddingLeft: '2.5rem' }}
              />
              <Lock size={16} style={iconStyle} />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.5rem', padding: '0.625rem' }}
          >
            {loading ? (
              <>
                <div
                  className="animate-spin"
                  style={{
                    width: '16px',
                    height: '16px',
                    border: '2px solid currentColor',
                    borderTopColor: 'transparent',
                    borderRadius: '50%'
                  }}
                />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={16} />
                Sign In
              </>
            )}
          </button>
        </form>

        <div
          style={{
            marginTop: '1.5rem',
            paddingTop: '1rem',
            borderTop: '1px solid var(--border-color)',
            textAlign: 'center'
          }}
        >
          <p className="font-mono" style={{ fontSize: '0.6875rem', color: 'var(--text-muted)' }}>
            THEAI Monitoring Platform v1.2
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;
