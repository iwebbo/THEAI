import React from 'react';
import { Link } from 'react-router-dom';
import { Edit, Trash2, Shield, RefreshCw, Clock } from 'lucide-react';
import StatusBadge from '../common/StatusBadge';
import moment from 'moment';

const ServerItem = ({ server, onCheck, onDelete }) => {
  const [isChecking, setIsChecking] = React.useState(false);

  // Formatage des dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Never';
    return moment(dateString).format('DD/MM/YYYY HH:mm:ss');
  };

  // Formatage des protocoles
  const formatProtocols = (protocols) => {
    if (!protocols) return '';
    return protocols
      .split(',')
      .map((p) => p.toUpperCase())
      .join(', ');
  };

  const handleCheck = async () => {
    setIsChecking(true);
    await onCheck(server.id);
    setIsChecking(false);
  };

  return (
    <div
      className="card"
      style={{
        borderLeft: `4px solid ${
          server.status === 'online'
            ? 'var(--success-500)'
            : server.status === 'offline'
            ? 'var(--error-500)'
            : 'var(--gray-400)'
        }`,
        transition: 'all 200ms'
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '1rem'
        }}
      >
        <div style={{ flex: 1 }}>
          <Link
            to={`/servers/${server.id}`}
            style={{
              fontSize: '1.125rem',
              fontWeight: 600,
              color: 'var(--text-primary)',
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              transition: 'color 200ms'
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--primary-600)')}
            onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
          >
            {server.name}
          </Link>
          <p style={{ fontSize: '0.875rem', color: 'var(--text-tertiary)', marginTop: '0.25rem' }}>
            {server.hostname}
          </p>
        </div>
        <StatusBadge status={server.status} />
      </div>

      {/* Info Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '1rem',
          padding: '1rem',
          backgroundColor: 'var(--gray-50)',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem'
        }}
      >
        <div>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            IP Address
          </p>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {server.ip_address}
          </p>
        </div>

        <div>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            Protocols
          </p>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {formatProtocols(server.protocols)}
          </p>
        </div>

        <div>
          <p
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              color: 'var(--text-tertiary)',
              marginBottom: '0.25rem',
              textTransform: 'uppercase',
              letterSpacing: '0.05em'
            }}
          >
            <Clock size={12} style={{ display: 'inline', marginRight: '0.25rem' }} />
            Last Check
          </p>
          <p style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--text-primary)' }}>
            {formatDate(server.last_check)}
          </p>
        </div>

        {server.response_time && (
          <div>
            <p
              style={{
                fontSize: '0.75rem',
                fontWeight: 500,
                color: 'var(--text-tertiary)',
                marginBottom: '0.25rem',
                textTransform: 'uppercase',
                letterSpacing: '0.05em'
              }}
            >
              Response Time
            </p>
            <span className="badge badge-success" style={{ fontSize: '0.813rem' }}>
              {server.response_time} ms
            </span>
          </div>
        )}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={handleCheck}
          disabled={isChecking}
          className="btn btn-success btn-sm"
        >
          <RefreshCw size={16} className={isChecking ? 'animate-spin' : ''} />
          {isChecking ? 'Checking...' : 'Check Now'}
        </button>

        <Link to={`/servers/edit/${server.id}`} className="btn btn-primary btn-sm">
          <Edit size={16} />
          Edit
        </Link>

        <Link to={`/servers/${server.id}/security`} className="btn btn-warning btn-sm">
          <Shield size={16} />
          Security
        </Link>

        <button onClick={() => onDelete(server.id)} className="btn btn-danger btn-sm">
          <Trash2 size={16} />
          Delete
        </button>
      </div>
    </div>
  );
};

export default ServerItem;