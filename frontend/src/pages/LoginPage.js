import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { User, Lock, Mail, LogIn, UserPlus, AlertCircle, Sun, Moon } from 'lucide-react';
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

// Normalise les erreurs FastAPI (string ou liste de validations 422)
const extractError = (err, fallback) => {
  const detail = err.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) return detail.map((d) => d.msg).join(', ');
  return fallback;
};

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
  const { theme, toggle } = useTheme();
  const [isRegister, setIsRegister] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
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
    if (error) setError('');
  };

  const toggleMode = () => {
    setIsRegister((prev) => !prev);
    setError('');
  };

  const doLogin = async (username, password) => {
    const response = await axios.post('/api/v1/auth/login', { username, password });
    const { access_token, user } = response.data;

    localStorage.setItem('access_token', access_token);
    localStorage.setItem('user', JSON.stringify(user));
    axios.defaults.headers.common['Authorization'] = `Bearer ${access_token}`;

    if (onLogin) onLogin(user, access_token);
    navigate('/');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      if (isRegister) {
        await axios.post('/api/v1/auth/register', {
          username: formData.username,
          email: formData.email,
          password: formData.password
        });
      }
      await doLogin(formData.username, formData.password);
    } catch (err) {
      setError(
        extractError(
          err,
          isRegister
            ? 'Registration failed. Please check your information.'
            : 'Login failed. Please check your credentials.'
        )
      );
    } finally {
      setLoading(false);
    }
  };

  const ThemeIcon = theme === 'dark' ? Moon : Sun;
  const SubmitIcon = isRegister ? UserPlus : LogIn;

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
        {/* Logo */}
        <div className="auth-logo" style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
          <img src="/logo.png" alt="THEAI" style={{ maxHeight: '48px', maxWidth: '100%' }} />
        </div>

        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>
          {isRegister ? 'Create your account' : 'Sign in'}
        </h1>
        <p style={{ fontSize: '0.8125rem', marginBottom: '1.5rem' }}>
          {isRegister ? 'Start monitoring your servers' : 'Access your monitoring dashboard'}
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

          {isRegister && (
            <div className="form-group">
              <label className="form-label" htmlFor="email">
                Email
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type="email"
                  id="email"
                  name="email"
                  value={formData.email}
                  onChange={handleInputChange}
                  required
                  autoComplete="email"
                  className="form-input"
                  placeholder="Enter your email"
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Mail size={16} style={iconStyle} />
              </div>
            </div>
          )}

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
                autoComplete={isRegister ? 'new-password' : 'current-password'}
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
                {isRegister ? 'Creating account...' : 'Signing in...'}
              </>
            ) : (
              <>
                <SubmitIcon size={16} />
                {isRegister ? 'Create account' : 'Sign In'}
              </>
            )}
          </button>

          <div style={{ textAlign: 'center', marginTop: '0.75rem' }}>
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              style={{ border: 'none' }}
              onClick={toggleMode}
            >
              {isRegister ? 'Already have an account? Sign in' : "Don't have an account? Register"}
            </button>
          </div>
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