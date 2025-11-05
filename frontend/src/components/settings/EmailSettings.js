import React, { useState, useEffect } from 'react';
import { 
  Mail, Server as ServerIcon, Save, Send, 
  Plus, X, CheckCircle, AlertCircle 
} from 'lucide-react';
import Alert from '../common/Alert';
import Loading from '../common/Loading';
import axios from 'axios';

const EmailSettings = () => {
  const [config, setConfig] = useState({
    smtp_server: 'smtp.gmail.com',
    smtp_port: 587,
    smtp_username: '',
    smtp_password: '',
    smtp_from_email: '',
    smtp_use_tls: true,
    enable_email_alerts: false,
    alert_emails: []
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState(null);
  const [emailInput, setEmailInput] = useState('');

  useEffect(() => {
    fetchEmailConfig();
  }, []);

  const fetchEmailConfig = async () => {
    try {
      setLoading(true);
      const response = await axios.get('/api/v1/settings/email');
      setConfig(response.data);
      setMessage(null);
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Error loading configuration: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig({
      ...config,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) : value
    });
  };

  const handleAddEmail = (e) => {
    e.preventDefault();
    if (emailInput && !config.alert_emails.includes(emailInput)) {
      setConfig({
        ...config,
        alert_emails: [...config.alert_emails, emailInput]
      });
      setEmailInput('');
    }
  };

  const handleRemoveEmail = (email) => {
    setConfig({
      ...config,
      alert_emails: config.alert_emails.filter((e) => e !== email)
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put('/api/v1/settings/email', config);
      setMessage({
        type: 'success',
        text: 'Configuration saved successfully!'
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Error saving configuration: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      await axios.post('/api/v1/settings/email/test');
      setMessage({
        type: 'success',
        text: 'Test email sent successfully! Check your inbox.'
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Error sending test email: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Loading message="Loading email settings..." />;
  }

  return (
    <div className="card animate-fadeIn">
      <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Mail size={20} style={{ color: 'var(--primary-600)' }} />
        Email Alert Configuration
      </h2>

      {message && (
        <Alert type={message.type} message={message.text} duration={5000} />
      )}

      {/* Enable Alerts Toggle */}
      <div style={{ marginBottom: '2rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            padding: '1rem',
            borderRadius: 'var(--radius-lg)',
            border: `2px solid ${config.enable_email_alerts ? 'var(--success-200)' : 'var(--border-light)'}`,
            backgroundColor: config.enable_email_alerts ? 'var(--success-50)' : 'transparent',
            transition: 'all 200ms'
          }}
        >
          <input
            type="checkbox"
            name="enable_email_alerts"
            checked={config.enable_email_alerts}
            onChange={handleInputChange}
            style={{ display: 'none' }}
          />
          <div
            style={{
              width: '48px',
              height: '26px',
              borderRadius: '13px',
              backgroundColor: config.enable_email_alerts ? 'var(--success-500)' : 'var(--gray-300)',
              position: 'relative',
              transition: 'background-color 200ms',
              flexShrink: 0
            }}
          >
            <div
              style={{
                width: '22px',
                height: '22px',
                borderRadius: '50%',
                backgroundColor: 'white',
                position: 'absolute',
                top: '2px',
                left: config.enable_email_alerts ? '24px' : '2px',
                transition: 'left 200ms',
                boxShadow: 'var(--shadow-sm)'
              }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
              Enable Email Alerts
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
              Receive notifications when server status changes
            </div>
          </div>
          {config.enable_email_alerts && (
            <CheckCircle size={20} style={{ color: 'var(--success-600)' }} />
          )}
        </label>
      </div>

      {/* SMTP Configuration */}
      <div className="grid grid-cols-2" style={{ gap: '1.5rem', marginBottom: '1.5rem' }}>
        <div className="form-group">
          <label className="form-label" htmlFor="smtp_server">
            <ServerIcon size={14} style={{ display: 'inline', marginRight: '0.375rem' }} />
            SMTP Server
          </label>
          <input
            type="text"
            id="smtp_server"
            name="smtp_server"
            value={config.smtp_server}
            onChange={handleInputChange}
            className="form-input"
            placeholder="smtp.gmail.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="smtp_port">
            SMTP Port
          </label>
          <input
            type="number"
            id="smtp_port"
            name="smtp_port"
            value={config.smtp_port}
            onChange={handleInputChange}
            className="form-input"
            placeholder="587"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="smtp_username">
            Username
          </label>
          <input
            type="text"
            id="smtp_username"
            name="smtp_username"
            value={config.smtp_username}
            onChange={handleInputChange}
            className="form-input"
            placeholder="your-email@gmail.com"
          />
        </div>

        <div className="form-group">
          <label className="form-label" htmlFor="smtp_password">
            Password / App Password
          </label>
          <input
            type="password"
            id="smtp_password"
            name="smtp_password"
            value={config.smtp_password}
            onChange={handleInputChange}
            className="form-input"
            placeholder="••••••••••••••••"
          />
        </div>
      </div>

      <div className="form-group" style={{ marginBottom: '1.5rem' }}>
        <label className="form-label" htmlFor="smtp_from_email">
          <Mail size={14} style={{ display: 'inline', marginRight: '0.375rem' }} />
          From Email Address
        </label>
        <input
          type="email"
          id="smtp_from_email"
          name="smtp_from_email"
          value={config.smtp_from_email}
          onChange={handleInputChange}
          className="form-input"
          placeholder="monitoring@yourdomain.com"
        />
      </div>

      {/* Use TLS */}
      <div style={{ marginBottom: '2rem' }}>
        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            cursor: 'pointer',
            padding: '0.75rem',
            borderRadius: 'var(--radius-md)',
            backgroundColor: config.smtp_use_tls ? 'var(--gray-50)' : 'transparent'
          }}
        >
          <input
            type="checkbox"
            name="smtp_use_tls"
            checked={config.smtp_use_tls}
            onChange={handleInputChange}
            style={{
              width: '18px',
              height: '18px',
              cursor: 'pointer',
              accentColor: 'var(--primary-600)'
            }}
          />
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Use TLS Encryption</span>
        </label>
      </div>

      {/* Alert Recipients */}
      <div style={{ marginBottom: '2rem' }}>
        <label className="form-label">Alert Recipients</label>
        <form onSubmit={handleAddEmail} style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            className="form-input"
            placeholder="email@example.com"
            style={{ flex: 1 }}
          />
          <button type="submit" className="btn btn-primary" disabled={!emailInput}>
            <Plus size={18} />
            Add
          </button>
        </form>

        {/* Email Tags */}
        {config.alert_emails.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {config.alert_emails.map((email, index) => (
              <div
                key={index}
                className="badge badge-primary"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  fontSize: '0.813rem'
                }}
              >
                <Mail size={14} />
                {email}
                <button
                  onClick={() => handleRemoveEmail(email)}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '0',
                    display: 'flex',
                    alignItems: 'center',
                    color: 'inherit',
                    opacity: 0.7,
                    transition: 'opacity 150ms'
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.7')}
                  aria-label={`Remove ${email}`}
                >
                  <X size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Information Box */}
      <div
        style={{
          padding: '1rem',
          backgroundColor: 'var(--primary-50)',
          border: '1px solid var(--primary-200)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '1.5rem'
        }}
      >
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <AlertCircle size={20} style={{ color: 'var(--primary-600)', flexShrink: 0 }} />
          <div>
            <h4 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--primary-800)', marginBottom: '0.5rem' }}>
              Important Information
            </h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.813rem', color: 'var(--primary-700)', lineHeight: 1.6 }}>
              <li>For Gmail, use an <strong>App Password</strong> instead of your regular password</li>
              <li>Enable 2-factor authentication on your Google account first</li>
              <li>Alerts are sent only when server status changes (online ↔ offline)</li>
              <li>Test the configuration to verify email delivery</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
        <button
          onClick={handleTest}
          disabled={testing || !config.enable_email_alerts || config.alert_emails.length === 0}
          className="btn btn-secondary"
        >
          {testing ? (
            <>
              <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid currentColor', borderTopColor: 'transparent', borderRadius: '50%' }} />
              Sending...
            </>
          ) : (
            <>
              <Send size={18} />
              Test Configuration
            </>
          )}
        </button>

        <button onClick={handleSave} disabled={saving} className="btn btn-primary">
          {saving ? (
            <>
              <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
              Saving...
            </>
          ) : (
            <>
              <Save size={18} />
              Save Configuration
            </>
          )}
        </button>
      </div>
    </div>
  );
};

export default EmailSettings;