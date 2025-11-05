import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Save, X, Server, Globe, Activity, Lock, Network, 
  Eye, EyeOff, ArrowLeft, CheckCircle
} from 'lucide-react';
import serverApi from '../../services/api';
import Alert from '../common/Alert';
import Loading from '../common/Loading';

const ServerForm = ({ serverId }) => {
  const navigate = useNavigate();
  const isEditMode = !!serverId;

  const [formData, setFormData] = useState({
    name: '',
    hostname: '',
    ip_address: '',
    description: '',
    enabled: true,
    protocols: 'icmp',

    // HTTP settings
    http_port: 80,
    http_path: '/',
    use_https: false,

    // SSH settings
    ssh_port: 22,
    ssh_username: '',
    ssh_password: '',
    ssh_key_path: '',

    // TCP settings
    tcp_port: 3306,
    tcp_timeout: 5
  });

  const [protocolOptions, setProtocolOptions] = useState({
    icmp: true,
    http: false,
    ssh: false,
    tcp: false
  });

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (isEditMode) {
      fetchServerData();
    }
  }, [serverId]);

  const fetchServerData = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServer(serverId);
      const serverData = response.data;

      setFormData({
        name: serverData.name || '',
        hostname: serverData.hostname || '',
        ip_address: serverData.ip_address || '',
        description: serverData.description || '',
        enabled: serverData.enabled ?? true,
        protocols: serverData.protocols || 'icmp',

        http_port: serverData.http_port || 80,
        http_path: serverData.http_path || '/',
        use_https: serverData.use_https || false,

        ssh_port: serverData.ssh_port || 22,
        ssh_username: serverData.ssh_username || '',
        ssh_password: serverData.ssh_password || '',
        ssh_key_path: serverData.ssh_key_path || '',

        tcp_port: serverData.tcp_port || 3306,
        tcp_timeout: serverData.tcp_timeout || 5
      });

      const protocols = serverData.protocols.split(',');
      setProtocolOptions({
        icmp: protocols.includes('icmp'),
        http: protocols.includes('http'),
        ssh: protocols.includes('ssh'),
        tcp: protocols.includes('tcp')
      });
    } catch (err) {
      setError('Error loading server data: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData({
      ...formData,
      [name]: type === 'checkbox' ? checked : type === 'number' ? parseInt(value) || 0 : value
    });
  };

  const handleProtocolChange = (e) => {
    const { name, checked } = e.target;
    const newProtocolOptions = {
      ...protocolOptions,
      [name]: checked
    };
    setProtocolOptions(newProtocolOptions);

    const selectedProtocols = Object.keys(newProtocolOptions)
      .filter((key) => newProtocolOptions[key])
      .join(',');

    setFormData({
      ...formData,
      protocols: selectedProtocols || 'icmp'
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      if (isEditMode) {
        await serverApi.updateServer(serverId, formData);
      } else {
        await serverApi.createServer(formData);
      }
      navigate('/servers');
    } catch (err) {
      setError('Error saving server: ' + (err.response?.data?.detail || err.message));
      setSaving(false);
    }
  };

  if (loading) {
    return <Loading message="Loading server data..." />;
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/servers')}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} />
          Back to Servers
        </button>

        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Server size={32} style={{ color: 'var(--primary-600)' }} />
          {isEditMode ? 'Edit Server' : 'Add New Server'}
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          {isEditMode ? 'Update server configuration' : 'Configure a new server for monitoring'}
        </p>
      </div>

      {error && <Alert type="error" message={error} />}

      <form onSubmit={handleSubmit}>
        {/* Basic Information */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Server size={20} style={{ color: 'var(--primary-600)' }} />
            Basic Information
          </h2>

          <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
            <FormGroup label="Server Name" icon={Server} required>
              <input
                type="text"
                name="name"
                value={formData.name}
                onChange={handleInputChange}
                required
                className="form-input"
                placeholder="My Production Server"
              />
            </FormGroup>

            <FormGroup label="Hostname" icon={Globe} required>
              <input
                type="text"
                name="hostname"
                value={formData.hostname}
                onChange={handleInputChange}
                required
                className="form-input"
                placeholder="server.example.com"
              />
            </FormGroup>
          </div>

          <FormGroup label="IP Address" icon={Activity} required>
            <input
              type="text"
              name="ip_address"
              value={formData.ip_address}
              onChange={handleInputChange}
              required
              className="form-input"
              placeholder="192.168.1.100"
            />
          </FormGroup>

          <FormGroup label="Description">
            <textarea
              name="description"
              value={formData.description}
              onChange={handleInputChange}
              className="form-textarea"
              placeholder="Add a description for this server..."
              rows="3"
            />
          </FormGroup>

          <ToggleSwitch
            label="Enable Monitoring"
            name="enabled"
            checked={formData.enabled}
            onChange={handleInputChange}
          />
        </div>

        {/* Monitoring Protocols */}
        <div className="card" style={{ marginBottom: '1.5rem' }}>
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Network size={20} style={{ color: 'var(--primary-600)' }} />
            Monitoring Protocols
          </h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '1rem' }}>
            <ProtocolCheckbox
              label="ICMP (Ping)"
              name="icmp"
              checked={protocolOptions.icmp}
              onChange={handleProtocolChange}
              description="Basic network connectivity check"
            />

            <ProtocolCheckbox
              label="HTTP/HTTPS"
              name="http"
              checked={protocolOptions.http}
              onChange={handleProtocolChange}
              description="Web service availability"
            />

            <ProtocolCheckbox
              label="SSH"
              name="ssh"
              checked={protocolOptions.ssh}
              onChange={handleProtocolChange}
              description="Secure shell connection"
            />

            <ProtocolCheckbox
              label="TCP"
              name="tcp"
              checked={protocolOptions.tcp}
              onChange={handleProtocolChange}
              description="TCP port connectivity"
            />
          </div>
        </div>

        {/* HTTP Configuration */}
        {protocolOptions.http && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="card-header">HTTP Configuration</h2>

            <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
              <FormGroup label="HTTP Port">
                <input
                  type="number"
                  name="http_port"
                  value={formData.http_port}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="80"
                />
              </FormGroup>

              <FormGroup label="HTTP Path">
                <input
                  type="text"
                  name="http_path"
                  value={formData.http_path}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="/"
                />
              </FormGroup>
            </div>

            <ToggleSwitch
              label="Use HTTPS"
              name="use_https"
              checked={formData.use_https}
              onChange={handleInputChange}
            />
          </div>
        )}

        {/* SSH Configuration */}
        {protocolOptions.ssh && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Lock size={20} style={{ color: 'var(--primary-600)' }} />
              SSH Configuration
            </h2>

            <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
              <FormGroup label="SSH Port">
                <input
                  type="number"
                  name="ssh_port"
                  value={formData.ssh_port}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="22"
                />
              </FormGroup>

              <FormGroup label="Username">
                <input
                  type="text"
                  name="ssh_username"
                  value={formData.ssh_username}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="root"
                />
              </FormGroup>
            </div>

            <FormGroup label="Password">
              <div style={{ position: 'relative' }}>
                <input
                  type={showPassword ? 'text' : 'password'}
                  name="ssh_password"
                  value={formData.ssh_password}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="••••••••"
                  style={{ paddingRight: '3rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'var(--text-tertiary)',
                    padding: '0.25rem'
                  }}
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormGroup>

            <FormGroup label="SSH Key Path (optional)">
              <input
                type="text"
                name="ssh_key_path"
                value={formData.ssh_key_path}
                onChange={handleInputChange}
                className="form-input"
                placeholder="/path/to/private/key"
              />
            </FormGroup>
          </div>
        )}

        {/* TCP Configuration */}
        {protocolOptions.tcp && (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <h2 className="card-header">TCP Configuration</h2>

            <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
              <FormGroup label="TCP Port">
                <input
                  type="number"
                  name="tcp_port"
                  value={formData.tcp_port}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="3306"
                />
              </FormGroup>

              <FormGroup label="Timeout (seconds)">
                <input
                  type="number"
                  name="tcp_timeout"
                  value={formData.tcp_timeout}
                  onChange={handleInputChange}
                  className="form-input"
                  placeholder="5"
                />
              </FormGroup>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '2rem' }}>
          <button
            type="button"
            onClick={() => navigate('/servers')}
            className="btn btn-secondary"
          >
            <X size={18} />
            Cancel
          </button>

          <button
            type="submit"
            disabled={saving}
            className="btn btn-primary"
          >
            {saving ? (
              <>
                <div className="animate-spin" style={{ width: '18px', height: '18px', border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%' }} />
                Saving...
              </>
            ) : (
              <>
                <Save size={18} />
                {isEditMode ? 'Update Server' : 'Create Server'}
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
};

// Helper Components
const FormGroup = ({ label, icon: Icon, required, children }) => (
  <div className="form-group">
    <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
      {Icon && <Icon size={14} style={{ color: 'var(--text-tertiary)' }} />}
      {label}
      {required && <span style={{ color: 'var(--error-500)' }}>*</span>}
    </label>
    {children}
  </div>
);

const ToggleSwitch = ({ label, name, checked, onChange }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      cursor: 'pointer',
      padding: '0.75rem',
      borderRadius: 'var(--radius-md)',
      transition: 'background-color 200ms',
      backgroundColor: checked ? 'var(--primary-50)' : 'transparent'
    }}
  >
    <input
      type="checkbox"
      name={name}
      checked={checked}
      onChange={onChange}
      style={{ display: 'none' }}
    />
    <div
      style={{
        width: '44px',
        height: '24px',
        borderRadius: '12px',
        backgroundColor: checked ? 'var(--primary-600)' : 'var(--gray-300)',
        position: 'relative',
        transition: 'background-color 200ms',
        flexShrink: 0
      }}
    >
      <div
        style={{
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          backgroundColor: 'white',
          position: 'absolute',
          top: '2px',
          left: checked ? '22px' : '2px',
          transition: 'left 200ms',
          boxShadow: 'var(--shadow-sm)'
        }}
      />
    </div>
    <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{label}</span>
    {checked && <CheckCircle size={16} style={{ color: 'var(--primary-600)', marginLeft: 'auto' }} />}
  </label>
);

const ProtocolCheckbox = ({ label, name, checked, onChange, description }) => (
  <label
    style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: '0.75rem',
      padding: '1rem',
      border: `2px solid ${checked ? 'var(--primary-500)' : 'var(--border-light)'}`,
      borderRadius: 'var(--radius-lg)',
      cursor: 'pointer',
      transition: 'all 200ms',
      backgroundColor: checked ? 'var(--primary-50)' : 'transparent'
    }}
  >
    <input
      type="checkbox"
      name={name}
      checked={checked}
      onChange={onChange}
      style={{
        width: '20px',
        height: '20px',
        borderRadius: 'var(--radius-sm)',
        border: `2px solid ${checked ? 'var(--primary-600)' : 'var(--border-medium)'}`,
        backgroundColor: checked ? 'var(--primary-600)' : 'transparent',
        cursor: 'pointer',
        flexShrink: 0,
        marginTop: '0.125rem',
        accentColor: 'var(--primary-600)'
      }}
    />
    <div style={{ flex: 1 }}>
      <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem' }}>
        {label}
      </div>
      <div style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)' }}>
        {description}
      </div>
    </div>
  </label>
);

export default ServerForm;