import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, LogIn, AlertCircle } from 'lucide-react';
import axios from 'axios';
import logoPng from '../assets/logo.png';

const LoginPage = ({ onLogin }) => {
  const navigate = useNavigate();
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

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #0ea5e9 0%, #6366f1 50%, #a855f7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        position: 'relative',
        overflow: 'hidden'
      }}
    >
      {/* Animated Background Elements */}
      <div
        style={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
          animation: 'float 6s ease-in-out infinite'
        }}
      />
      <div
        style={{
          position: 'absolute',
          bottom: '-10%',
          left: '-5%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%)',
          animation: 'float 8s ease-in-out infinite reverse'
        }}
      />

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-20px); }
        }
      `}</style>

      {/* Login Card */}
      <div
        className="animate-fadeIn"
        style={{
          backgroundColor: 'white',
          borderRadius: '1.5rem',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '3rem',
          width: '100%',
          maxWidth: '440px',
          position: 'relative',
          zIndex: 1
        }}
      >
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div
            style={{
              position: 'relative',
              width: '300px',
              height: '300px',
              margin: '0 auto',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
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
          <h1
            style={{
              fontSize: '1.875rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
              marginTop: '1rem',
              marginBottom: '0.5rem'
            }}
          >
            Welcome Back
          </h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Sign in to access your monitoring dashboard
          </p>
        </div>

        {/* Error Alert */}
        {error && (
          <div
            className="animate-fadeIn"
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.75rem',
              padding: '1rem',
              backgroundColor: 'var(--error-50)',
              border: '1px solid var(--error-200)',
              borderRadius: 'var(--radius-lg)',
              marginBottom: '1.5rem'
            }}
          >
            <AlertCircle size={20} style={{ color: 'var(--error-600)', flexShrink: 0 }} />
            <p style={{ fontSize: '0.875rem', color: 'var(--error-700)', margin: 0 }}>
              {error}
            </p>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit}>
          {/* Username Field */}
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
                className="form-input"
                placeholder="Enter your username"
                style={{ paddingLeft: '2.75rem' }}
              />
              <Mail
                size={18}
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none'
                }}
              />
            </div>
          </div>

          {/* Password Field */}
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
                className="form-input"
                placeholder="Enter your password"
                style={{ paddingLeft: '2.75rem' }}
              />
              <Lock
                size={18}
                style={{
                  position: 'absolute',
                  left: '1rem',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  color: 'var(--text-tertiary)',
                  pointerEvents: 'none'
                }}
              />
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{
              width: '100%',
              marginTop: '1rem',
              padding: '0.875rem',
              fontSize: '1rem',
              fontWeight: 600
            }}
          >
            {loading ? (
              <>
                <div
                  className="animate-spin"
                  style={{
                    width: '20px',
                    height: '20px',
                    border: '2px solid white',
                    borderTopColor: 'transparent',
                    borderRadius: '50%'
                  }}
                />
                Signing in...
              </>
            ) : (
              <>
                <LogIn size={20} />
                Sign In
              </>
            )}
          </button>
        </form>

        {/* Footer */}
        <div
          style={{
            marginTop: '2rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid var(--border-light)',
            textAlign: 'center'
          }}
        >
          <p style={{ fontSize: '0.813rem', color: 'var(--text-tertiary)' }}>
            THEAI Monitoring Platform v1.2
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;