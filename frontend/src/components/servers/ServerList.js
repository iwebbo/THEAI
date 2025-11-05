import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Plus, RefreshCw, Server as ServerIcon } from 'lucide-react';
import ServerItem from './ServerItem';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import serverApi from '../../services/api';

const ServerList = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);

  useEffect(() => {
    fetchServers();
  }, []);

  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServers();
      setServers(response.data);
      setError(null);
    } catch (err) {
      setError('Error loading servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckServer = async (serverId) => {
    try {
      const response = await serverApi.checkServer(serverId);
      setServers(
        servers.map((server) =>
          server.id === serverId
            ? {
                ...server,
                status: response.data.status,
                last_check: response.data.last_check,
                response_time: response.data.response_time
              }
            : server
        )
      );
    } catch (err) {
      setError('Error checking server: ' + (err.response?.data?.detail || err.message));
    }
  };

  const handleCheckAllServers = async () => {
    try {
      setCheckingAll(true);
      const response = await serverApi.checkAllServers();

      const updatedServersMap = new Map(
        response.data.map((checkResult) => [
          checkResult.id,
          {
            status: checkResult.status,
            last_check: checkResult.last_check,
            response_time: checkResult.response_time
          }
        ])
      );

      setServers(
        servers.map((server) => {
          const checkResult = updatedServersMap.get(server.id);
          if (checkResult) {
            return { ...server, ...checkResult };
          }
          return server;
        })
      );
    } catch (err) {
      setError('Error checking servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCheckingAll(false);
    }
  };

  const handleDeleteServer = async (serverId) => {
    if (window.confirm('Are you sure you want to delete this server?')) {
      try {
        await serverApi.deleteServer(serverId);
        setServers(servers.filter((server) => server.id !== serverId));
      } catch (err) {
        setError('Error deleting server: ' + (err.response?.data?.detail || err.message));
      }
    }
  };

  if (loading) {
    return <Loading message="Loading servers..." />;
  }

  return (
    <div className="animate-fadeIn">
      {/* Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '2rem'
        }}
      >
        <div>
          <h1 style={{ marginBottom: '0.5rem' }}>Servers List</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
            Manage and monitor all your servers
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleCheckAllServers}
            disabled={checkingAll}
            className="btn btn-success"
          >
            <RefreshCw size={18} className={checkingAll ? 'animate-spin' : ''} />
            {checkingAll ? 'Checking...' : 'Check All Servers'}
          </button>

          <Link to="/servers/new" className="btn btn-primary">
            <Plus size={18} />
            Add Server
          </Link>
        </div>
      </div>

      {/* Error Alert */}
      {error && <Alert type="error" message={error} />}

      {/* Servers List */}
      {servers.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '4rem 2rem' }}>
          <ServerIcon
            size={64}
            style={{ color: 'var(--text-tertiary)', margin: '0 auto 1.5rem' }}
          />
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.5rem' }}>
            No servers added yet
          </h3>
          <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem', fontSize: '0.875rem' }}>
            Start monitoring your infrastructure by adding your first server
          </p>
          <Link to="/servers/new" className="btn btn-primary btn-lg">
            <Plus size={20} />
            Add Your First Server
          </Link>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {servers.map((server) => (
            <ServerItem
              key={server.id}
              server={server}
              onCheck={handleCheckServer}
              onDelete={handleDeleteServer}
            />
          ))}
        </div>
      )}

      {/* Stats Footer */}
      {servers.length > 0 && (
        <div
          className="card"
          style={{
            marginTop: '2rem',
            padding: '1rem',
            backgroundColor: 'var(--gray-50)'
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-around',
              textAlign: 'center'
            }}
          >
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Total
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                {servers.length}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Online
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--success-600)' }}>
                {servers.filter((s) => s.status === 'online').length}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Offline
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--error-600)' }}>
                {servers.filter((s) => s.status === 'offline').length}
              </p>
            </div>
            <div>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginBottom: '0.25rem' }}>
                Unknown
              </p>
              <p style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--gray-600)' }}>
                {servers.filter((s) => s.status === 'unknown').length}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServerList;