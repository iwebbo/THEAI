import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, RefreshCw, Edit, Trash2, Server as ServerIcon,
  Globe, Cpu, Clock, Shield, CheckCircle, XCircle, Activity
} from 'lucide-react';
import serverApi from '../../services/api';
import StatusBadge from '../common/StatusBadge';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import moment from 'moment';

const ServerDetail = ({ serverId }) => {
  const navigate = useNavigate();
  const [server, setServer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchServerDetails();
  }, [serverId]);

  const fetchServerDetails = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServer(serverId);
      setServer(response.data);
      setError(null);
    } catch (err) {
      setError('Error loading server details: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckServer = async () => {
    try {
      setChecking(true);
      const response = await serverApi.checkServer(serverId);

      setServer((prevServer) => ({
        ...prevServer,
        status: response.data.status,
        last_check: response.data.last_check,
        response_time: response.data.response_time
      }));
    } catch (err) {
      setError('Error checking server: ' + (err.response?.data?.detail || err.message));
    } finally {
      setChecking(false);
    }
  };

  const handleDeleteServer = async () => {
    if (window.confirm('Are you sure you want to delete this server?')) {
      try {
        await serverApi.deleteServer(serverId);
        navigate('/servers');
      } catch (err) {
        setError('Error deleting server: ' + (err.response?.data?.detail || err.message));
      }
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return moment(dateString).fromNow();
  };

  if (loading) {
    return <Loading message="Loading server details..." />;
  }

  if (!server) {
    return (
      <Alert type="error" message="Server not found" />
    );
  }

  return (
    <div className="animate-fadeIn">
      {/* Header avec bouton retour */}
      <div style={{ marginBottom: '2rem' }}>
        <button
          onClick={() => navigate('/servers')}
          className="btn btn-ghost btn-sm"
          style={{ marginBottom: '1rem' }}
        >
          <ArrowLeft size={16} />
          Back to Servers
        </button>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <ServerIcon size={32} style={{ color: 'var(--primary-600)' }} />
              {server.name}
            </h1>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
              {server.hostname}
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={handleCheckServer}
              disabled={checking}
              className="btn btn-success"
            >
              <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
              {checking ? 'Checking...' : 'Check Now'}
            </button>

            <button
              onClick={() => navigate(`/servers/edit/${serverId}`)}
              className="btn btn-primary"
            >
              <Edit size={18} />
              Edit
            </button>

            <button onClick={handleDeleteServer} className="btn btn-danger">
              <Trash2 size={18} />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Error Alert */}
      {error && <Alert type="error" message={error} />}

      {/* Status Card */}
      <div
        className="card"
        style={{
          marginBottom: '1.5rem',
          borderLeft: `4px solid ${
            server.status === 'online'
              ? 'var(--success-500)'
              : server.status === 'offline'
              ? 'var(--error-500)'
              : 'var(--gray-400)'
          }`
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Current Status
            </h3>
            <StatusBadge status={server.status} />
          </div>

          {server.response_time && (
            <div style={{ textAlign: 'right' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Response Time
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-600)' }}>
                {server.response_time} <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>ms</span>
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Grid avec 2 colonnes */}
      <div className="grid grid-cols-2" style={{ gap: '1.5rem' }}>
        {/* Server Information */}
        <div className="card">
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Globe size={20} style={{ color: 'var(--primary-600)' }} />
            Server Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <InfoItem label="Name" value={server.name} icon={ServerIcon} />
            <InfoItem label="Hostname" value={server.hostname} icon={Globe} />
            <InfoItem label="IP Address" value={server.ip_address} icon={Activity} />
            <InfoItem
              label="Protocols"
              value={server.protocols?.split(',').map(p => p.toUpperCase()).join(', ')}
              icon={Cpu}
            />
            <InfoItem
              label="Monitoring"
              value={server.enabled ? 'Enabled' : 'Disabled'}
              icon={server.enabled ? CheckCircle : XCircle}
              valueColor={server.enabled ? 'var(--success-600)' : 'var(--error-600)'}
            />
          </div>

          {server.description && (
            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-light)' }}>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Description
              </p>
              <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                {server.description}
              </p>
            </div>
          )}
        </div>

        {/* Monitoring Status */}
        <div className="card">
          <h2 className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Clock size={20} style={{ color: 'var(--primary-600)' }} />
            Monitoring Status
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <InfoItem
              label="Last Check"
              value={formatDate(server.last_check)}
              icon={Clock}
            />
            <InfoItem
              label="Last Status Change"
              value={formatDate(server.last_status_change)}
              icon={Activity}
            />
            {server.response_time && (
              <InfoItem
                label="Response Time"
                value={`${server.response_time} ms`}
                icon={Activity}
              />
            )}
          </div>
        </div>

        {/* HTTP Configuration */}
        {server.protocols?.includes('http') && (
          <div className="card">
            <h2 className="card-header">HTTP Configuration</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <InfoItem label="Port" value={server.http_port || 80} />
              <InfoItem label="Path" value={server.http_path || '/'} />
              <InfoItem
                label="HTTPS"
                value={server.use_https ? 'Yes' : 'No'}
                valueColor={server.use_https ? 'var(--success-600)' : 'var(--text-secondary)'}
              />
            </div>
          </div>
        )}

        {/* SSH Configuration */}
        {server.protocols?.includes('ssh') && (
          <div className="card">
            <h2 className="card-header">SSH Configuration</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <InfoItem label="Port" value={server.ssh_port || 22} />
              <InfoItem label="Username" value={server.ssh_username || 'Not configured'} />
              <InfoItem
                label="Authentication"
                value={server.ssh_key_path ? 'SSH Key' : 'Password'}
              />
            </div>
          </div>
        )}

        {/* TCP Configuration */}
        {server.protocols?.includes('tcp') && (
          <div className="card">
            <h2 className="card-header">TCP Configuration</h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <InfoItem label="Port" value={server.tcp_port || 3306} />
              <InfoItem label="Timeout" value={`${server.tcp_timeout || 5} seconds`} />
            </div>
          </div>
        )}
      </div>

      {/* Security Quick Access */}
      <div className="card" style={{ marginTop: '1.5rem', backgroundColor: 'var(--warning-50)', borderColor: 'var(--warning-200)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={20} style={{ color: 'var(--warning-600)' }} />
              Security Scanning
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-secondary)' }}>
              Run security scans to detect vulnerabilities
            </p>
          </div>
          <button
            onClick={() => navigate(`/servers/${serverId}/security`)}
            className="btn btn-warning"
          >
            <Shield size={18} />
            View Security Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};

// Composant helper pour afficher les informations
const InfoItem = ({ label, value, icon: Icon, valueColor }) => (
  <div>
    <p style={{ 
      fontSize: '0.75rem', 
      color: 'var(--text-tertiary)', 
      marginBottom: '0.25rem',
      textTransform: 'uppercase',
      letterSpacing: '0.05em',
      display: 'flex',
      alignItems: 'center',
      gap: '0.375rem'
    }}>
      {Icon && <Icon size={12} />}
      {label}
    </p>
    <p style={{ 
      fontSize: '0.875rem', 
      fontWeight: 500, 
      color: valueColor || 'var(--text-primary)' 
    }}>
      {value}
    </p>
  </div>
);

export default ServerDetail;