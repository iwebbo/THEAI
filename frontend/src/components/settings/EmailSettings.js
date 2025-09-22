import React, { useState, useEffect } from 'react';
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

  // Charger la configuration au démarrage
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
        text: 'Error during loading configuration: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setConfig({
      ...config,
      [name]: type === 'checkbox' ? checked : (type === 'number' ? parseInt(value) : value)
    });
  };

  const handleAddEmail = () => {
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
      alert_emails: config.alert_emails.filter(e => e !== email)
    });
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await axios.put('/api/v1/settings/email', config);
      setMessage({
        type: 'success',
        text: 'Configuration updated with success !'
      });
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Error with loading save: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setTesting(true);
      const response = await axios.post('/api/v1/settings/email/test');
      
      if (response.data.success) {
        setMessage({
          type: 'success',
          text: `Email sent successfully: ${response.data.recipients.join(', ')}`
        });
      } else {
        setMessage({
          type: 'error',
          text: `Issue with the test: ${response.data.message}`
        });
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: 'Error with the test email: ' + (err.response?.data?.detail || err.message)
      });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <Loading message="Loading email configuration..." />;
  }

  const styles = {
    section: {
      backgroundColor: 'white',
      borderRadius: '8px',
      padding: '24px',
      boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
      marginBottom: '20px'
    },
    formGroup: {
      marginBottom: '20px'
    },
    label: {
      display: 'block',
      marginBottom: '8px',
      fontWeight: 'bold'
    },
    input: {
      width: '100%',
      padding: '10px',
      borderRadius: '4px',
      border: '1px solid #ddd',
      fontSize: '16px'
    },
    checkbox: {
      marginRight: '8px'
    },
    checkboxLabel: {
      display: 'flex',
      alignItems: 'center'
    },
    buttonGroup: {
      display: 'flex',
      gap: '10px',
      marginTop: '20px'
    },
    button: {
      padding: '10px 16px',
      borderRadius: '4px',
      border: 'none',
      cursor: 'pointer',
      fontSize: '16px'
    },
    saveButton: {
      backgroundColor: '#2196f3',
      color: 'white'
    },
    testButton: {
      backgroundColor: '#4caf50',
      color: 'white'
    },
    emailList: {
      display: 'flex',
      flexWrap: 'wrap',
      gap: '8px',
      marginTop: '10px'
    },
    emailTag: {
      backgroundColor: '#e3f2fd',
      padding: '4px 8px',
      borderRadius: '16px',
      display: 'flex',
      alignItems: 'center',
      gap: '8px'
    },
    removeButton: {
      backgroundColor: '#f44336',
      color: 'white',
      border: 'none',
      borderRadius: '50%',
      width: '20px',
      height: '20px',
      cursor: 'pointer',
      fontSize: '12px'
    },
    grid: {
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gap: '20px'
    }
  };

  return (
    <div style={styles.section}>
      <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginTop: 0 }}>
        Configuration email alerting
      </h2>

      {message && (
        <Alert 
          type={message.type} 
          message={message.text} 
          duration={5000} 
        />
      )}

      <div style={styles.formGroup}>
        <label style={styles.checkboxLabel}>
          <input
            type="checkbox"
            name="enable_email_alerts"
            checked={config.enable_email_alerts}
            onChange={handleInputChange}
            style={styles.checkbox}
          />
          Enable alerting email
        </label>
      </div>

      <div style={styles.grid}>
        <div>
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="smtp_server">Server SMTP</label>
            <input
              type="text"
              id="smtp_server"
              name="smtp_server"
              value={config.smtp_server}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="smtp.gmail.com"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="smtp_port">Port SMTP</label>
            <input
              type="number"
              id="smtp_port"
              name="smtp_port"
              value={config.smtp_port}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="587"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.checkboxLabel}>
              <input
                type="checkbox"
                name="smtp_use_tls"
                checked={config.smtp_use_tls}
                onChange={handleInputChange}
                style={styles.checkbox}
              />
              Utiliser TLS/SSL
            </label>
          </div>
        </div>

        <div>
          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="smtp_username">Username</label>
            <input
              type="email"
              id="smtp_username"
              name="smtp_username"
              value={config.smtp_username}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="votre-email@gmail.com"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="smtp_password">Password</label>
            <input
              type="password"
              id="smtp_password"
              name="smtp_password"
              value={config.smtp_password}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="Mot de passe d'application"
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label} htmlFor="smtp_from_email">Email sender</label>
            <input
              type="email"
              id="smtp_from_email"
              name="smtp_from_email"
              value={config.smtp_from_email}
              onChange={handleInputChange}
              style={styles.input}
              placeholder="monitoring@votre-domaine.com"
            />
          </div>
        </div>
      </div>

      <div style={styles.formGroup}>
        <label style={styles.label}>Email Destination</label>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input
            type="email"
            value={emailInput}
            onChange={(e) => setEmailInput(e.target.value)}
            style={{ ...styles.input, flex: 1 }}
            placeholder="Ajouter une adresse email"
            onKeyPress={(e) => e.key === 'Enter' && handleAddEmail()}
          />
          <button
            type="button"
            onClick={handleAddEmail}
            style={{
              ...styles.button,
              backgroundColor: '#2196f3',
              color: 'white'
            }}
          >
            Add
          </button>
        </div>
        
        {config.alert_emails.length > 0 && (
          <div style={styles.emailList}>
            {config.alert_emails.map((email, index) => (
              <div key={index} style={styles.emailTag}>
                <span>{email}</span>
                <button
                  style={styles.removeButton}
                  onClick={() => handleRemoveEmail(email)}
                  title="Supprimer"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={styles.buttonGroup}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            ...styles.button,
            ...styles.saveButton,
            opacity: saving ? 0.7 : 1,
            cursor: saving ? 'not-allowed' : 'pointer'
          }}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>

        <button
          onClick={handleTest}
          disabled={testing || !config.enable_email_alerts || config.alert_emails.length === 0}
          style={{
            ...styles.button,
            ...styles.testButton,
            opacity: (testing || !config.enable_email_alerts || config.alert_emails.length === 0) ? 0.7 : 1,
            cursor: (testing || !config.enable_email_alerts || config.alert_emails.length === 0) ? 'not-allowed' : 'pointer'
          }}
        >
          {testing ? 'Test in progress...' : 'Test configuration'}
        </button>
      </div>

      <div style={{ marginTop: '20px', padding: '15px', backgroundColor: '#f8f9fa', borderRadius: '4px' }}>
        <h4 style={{ margin: '0 0 10px 0', color: '#495057' }}>Informations</h4>
        <ul style={{ margin: 0, paddingLeft: '20px', color: '#6c757d' }}>
          <li>For Gmail, use an application <strong>password </strong> instead of your regular passwordw</li>
          <li>Make sure 2-factor authentication is enabled on your Google account</li>
          <li>Alerts are only sent when server status changes occur</li>
          <li>A test email can be sent to verify the configuration</li>
        </ul>
      </div>
    </div>
  );
};

export default EmailSettings;