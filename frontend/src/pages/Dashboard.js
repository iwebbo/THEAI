import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
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
      const online = serverData.filter(s => s.status === 'online').length;
      const offline = serverData.filter(s => s.status === 'offline').length;
      const unknown = serverData.filter(s => s.status === 'unknown').length;
      
      setStats({
        total: serverData.length,
        online,
        offline,
        unknown
      });
      
    } catch (err) {
      setError('Error loading servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleCheckAllServers = async () => {
    try {
      setLoading(true);
      await serverApi.checkAllServers();
      await fetchServers();
    } catch (err) {
      setError('Error during checking servers: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <Loading message="Loading Dashboard..." />;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
      {/* En-tête */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        marginBottom: '2rem'
      }}>
        <div>
          <h1 style={{ marginBottom: '0.5rem', color: '#1f2937' }}>Dashboard</h1>
        </div>
        
        <button
          onClick={handleCheckAllServers}
          className="btn btn-success"
        >
          Check all servers
        </button>
      </div>

      {error && <Alert type="error" message={error} />}

      {/* Statistiques */}
      <div className="grid grid-cols-4 mb-8">
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-body">
            <h3 style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              TOTAL
            </h3>
            <p style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#3b82f6', margin: 0 }}>
              {stats.total}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>servers</p>
          </div>
        </div>
        
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-body">
            <h3 style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              ONLINE
            </h3>
            <p style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#10b981', margin: 0 }}>
              {stats.online}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              {stats.total > 0 ? Math.round((stats.online / stats.total) * 100) : 0}% uptime
            </p>
          </div>
        </div>
        
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-body">
            <h3 style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              OFFLINE
            </h3>
            <p style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#ef4444', margin: 0 }}>
              {stats.offline}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
              {stats.offline > 0 ? 'Attention' : 'Everything is good'}
            </p>
          </div>
        </div>
        
        <div className="card" style={{ textAlign: 'center' }}>
          <div className="card-body">
            <h3 style={{ color: '#6b7280', fontSize: '0.875rem', fontWeight: '500', marginBottom: '0.5rem' }}>
              UNKNOW
            </h3>
            <p style={{ fontSize: '2.25rem', fontWeight: 'bold', color: '#6b7280', margin: 0 }}>
              {stats.unknown}
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>unchecked</p>
          </div>
        </div>
      </div>

      {/* Serveurs avec problèmes */}
      {stats.offline > 0 && (
        <div className="card mb-6" style={{ borderLeft: '4px solid #ef4444' }}>
          <div className="card-body">
            <div style={{ display: 'flex', alignItems: 'center', marginBottom: '1rem' }}>
              <span style={{ fontSize: '1.25rem', marginRight: '0.5rem' }}>⚠️</span>
              <h3 style={{ color: '#dc2626', fontSize: '1.125rem' }}>
                Problems ({stats.offline})
              </h3>
            </div>
            
            <div style={{ display: 'grid', gap: '0.75rem' }}>
              {servers
                .filter(s => s.status === 'offline')
                .map(server => (
                  <div key={server.id} style={{ 
                    padding: '1rem', 
                    backgroundColor: '#fef2f2',
                    borderRadius: '0.5rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between'
                  }}>
                    <div>
                      <div style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                        {server.name}
                      </div>
                      <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>
                        {server.hostname} • {server.ip_address}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                      <StatusBadge status={server.status} />
                      <Link 
                        to={`/servers/${server.id}`}
                        className="btn btn-primary"
                        style={{ fontSize: '0.75rem', padding: '0.375rem 0.75rem' }}
                      >
                        Détails
                      </Link>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Liste des serveurs */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h3 style={{ fontSize: '1.125rem' }}>Monitoring view</h3>
            <Link to="/servers" className="btn btn-secondary" style={{ fontSize: '0.875rem' }}>
              Show all →
            </Link>
          </div>
        </div>
        
        <div className="card-body">
          {servers.length === 0 ? (
            <div style={{ 
              textAlign: 'center', 
              padding: '3rem',
              color: '#6b7280'
            }}>
              <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📊</div>
              <p style={{ fontSize: '1.125rem', marginBottom: '1rem' }}>No server has been added</p>
              <Link 
                to="/servers/new"
                className="btn btn-primary"
              >
                Add your first server
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-3">
              {servers.slice(0, 6).map(server => (
                <Link
                  key={server.id}
                  to={`/servers/${server.id}`}
                  style={{ textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ 
                    border: '1px solid #e5e7eb',
                    borderRadius: '0.75rem',
                    padding: '1.25rem',
                    transition: 'all 0.2s ease',
                    cursor: 'pointer',
                    backgroundColor: '#ffffff'
                  }}
                  onMouseOver={(e) => {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 10px 15px -3px rgba(0, 0, 0, 0.1)';
                  }}
                  onMouseOut={(e) => {
                    e.currentTarget.style.transform = 'translateY(0)';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                  >
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'flex-start',
                      marginBottom: '0.75rem'
                    }}>
                      <div>
                        <div style={{ 
                          fontWeight: '600', 
                          color: '#1f2937',
                          marginBottom: '0.25rem'
                        }}>
                          {server.name}
                        </div>
                        <div style={{ 
                          fontSize: '0.875rem', 
                          color: '#6b7280'
                        }}>
                          {server.hostname}
                        </div>
                      </div>
                      <StatusBadge status={server.status} />
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between',
                      fontSize: '0.75rem',
                      color: '#9ca3af'
                    }}>
                      <span>IP: {server.ip_address}</span>
                      {server.response_time && (
                        <span>{server.response_time}ms</span>
                      )}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;