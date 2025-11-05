import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Server, CheckCircle, XCircle, HelpCircle, RefreshCw, Plus } from 'lucide-react';
import serverApi from '../services/api';
import StatusBadge from '../components/common/StatusBadge';
import Loading from '../components/common/Loading';
import Alert from '../components/common/Alert';

const Dashboard = () => {
  const [servers, setServers] = useState([]);
  const [stats, setStats] = useState({
    total: 0,
    online: 0,
    offline: 0,
    unknown: 0
  });
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServers();
      const serverData = response.data;

      setServers(serverData);

      // Calculer les statistiques
      const online = serverData.filter((s) => s.status === 'online').length;
      const offline = serverData.filter((s) => s.status === 'offline').length;
      const unknown = serverData.filter((s) => s.status === 'unknown').length;

      setStats({
        total: serverData.length,
        online,
        offline,
        unknown
      });
      setError(null);
    } catch (err) {
      setError('Error loading servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckAllServers = async () => {
    try {
      setChecking(true);
      await serverApi.checkAllServers();
      await fetchServers();
    } catch (err) {
      setError('Error during checking servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setChecking(false);
    }
  };

  if (loading) {
    return <Loading message="Loading Dashboard..." />;
  }

  // Stats Cards Data
  const statsCards = [
    {
      title: 'Total Servers',
      value: stats.total,
      icon: Server,
      color: '#3b82f6',
      bgColor: '#eff6ff',
      borderColor: '#bfdbfe'
    },
    {
      title: 'Online',
      value: stats.online,
      icon: CheckCircle,
      color: '#10b981',
      bgColor: '#ecfdf5',
      borderColor: '#a7f3d0'
    },
    {
      title: 'Offline',
      value: stats.offline,
      icon: XCircle,
      color: '#ef4444',
      bgColor: '#fef2f2',
      borderColor: '#fecaca'
    },
    {
      title: 'Unknown',
      value: stats.unknown,
      icon: HelpCircle,
      color: '#6b7280',
      bgColor: '#f9fafb',
      borderColor: '#e5e7eb'
    }
  ];

  return (
    <div className="animate-fadeIn">
      {/* Header Section */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}
      >
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Monitor and manage your server infrastructure
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <Link to="/servers/new" className="btn btn-primary">
            <Plus size={18} />
            Add Server
          </Link>
          <button
            onClick={handleCheckAllServers}
            disabled={checking}
            className="btn btn-success"
          >
            <RefreshCw size={18} className={checking ? 'animate-spin' : ''} />
            {checking ? 'Checking...' : 'Check All'}
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && <Alert type="error" message={error} />}

      {/* Stats Cards Grid */}
      <div className="grid grid-cols-4" style={{ marginBottom: '2rem' }}>
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <div
              key={index}
              className="card card-interactive"
              style={{
                borderLeft: `4px solid ${stat.color}`,
                backgroundColor: stat.bgColor,
                borderColor: stat.borderColor
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <p
                    style={{
                      fontSize: '0.875rem',
                      fontWeight: 500,
                      color: 'var(--text-secondary)',
                      marginBottom: '0.5rem'
                    }}
                  >
                    {stat.title}
                  </p>
                  <h2
                    style={{
                      fontSize: '2.25rem',
                      fontWeight: 700,
                      color: stat.color,
                      lineHeight: 1
                    }}
                  >
                    {stat.value}
                  </h2>
                </div>
                <div
                  style={{
                    width: '48px',
                    height: '48px',
                    borderRadius: 'var(--radius-lg)',
                    backgroundColor: 'white',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}
                >
                  <Icon size={24} style={{ color: stat.color }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Servers Section */}
      <div className="card">
        <div className="card-header">
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Recent Servers</h2>
        </div>

        {servers.length === 0 ? (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem 1rem',
              color: 'var(--text-secondary)'
            }}
          >
            <Server size={48} style={{ color: 'var(--text-tertiary)', marginBottom: '1rem' }} />
            <p style={{ fontSize: '1rem', fontWeight: 500, marginBottom: '0.5rem' }}>
              No servers yet
            </p>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem' }}>
              Get started by adding your first server to monitor
            </p>
            <Link to="/servers/new" className="btn btn-primary">
              <Plus size={18} />
              Add Your First Server
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-3" style={{ gap: '1rem' }}>
            {servers.slice(0, 6).map((server) => (
              <Link
                key={server.id}
                to={`/servers/${server.id}`}
                className="card card-interactive"
                style={{
                  textDecoration: 'none',
                  padding: '1.25rem',
                  borderLeft: `4px solid ${
                    server.status === 'online'
                      ? '#10b981'
                      : server.status === 'offline'
                      ? '#ef4444'
                      : '#6b7280'
                  }`
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.75rem' }}>
                  <div style={{ flex: 1 }}>
                    <h3
                      style={{
                        fontSize: '1rem',
                        fontWeight: 600,
                        color: 'var(--text-primary)',
                        marginBottom: '0.25rem'
                      }}
                    >
                      {server.name}
                    </h3>
                    <p style={{ fontSize: '0.813rem', color: 'var(--text-tertiary)' }}>
                      {server.hostname}
                    </p>
                  </div>
                  <StatusBadge status={server.status} />
                </div>

                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    fontSize: '0.75rem',
                    color: 'var(--text-tertiary)',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border-light)'
                  }}
                >
                  <span>{server.ip_address}</span>
                  {server.response_time && (
                    <span
                      className="badge badge-gray"
                      style={{ fontSize: '0.688rem' }}
                    >
                      {server.response_time}ms
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        {servers.length > 6 && (
          <div
            style={{
              marginTop: '1.5rem',
              paddingTop: '1.5rem',
              borderTop: '1px solid var(--border-light)',
              textAlign: 'center'
            }}
          >
            <Link
              to="/servers"
              className="btn btn-secondary"
            >
              <Server size={18} />
              View All Servers ({servers.length})
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;