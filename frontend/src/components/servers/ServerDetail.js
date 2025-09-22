import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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

  // Charger les détails du serveur
  useEffect(() => {
    fetchServerDetails();
  }, [serverId]);

  // Récupérer les détails du serveur
  const fetchServerDetails = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServer(serverId);
      setServer(response.data);
      setError(null);
    } catch (err) {
      setError('Erreur lors du chargement des détails du serveur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Vérifier l'état du serveur
  const handleCheckServer = async () => {
    try {
      setChecking(true);
      const response = await serverApi.checkServer(serverId);
      
      // Mettre à jour les informations du serveur avec les résultats de la vérification
      setServer(prevServer => ({
        ...prevServer,
        status: response.data.status,
        last_check: response.data.last_check,
        response_time: response.data.response_time
      }));
      
    } catch (err) {
      setError('Erreur lors de la vérification du serveur: ' + (err.response?.data?.detail || err.message));
    } finally {
      setChecking(false);
    }
  };

  // Supprimer le serveur
  const handleDeleteServer = async () => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce serveur ?')) {
      try {
        await serverApi.deleteServer(serverId);
        navigate('/servers');
      } catch (err) {
        setError('Erreur lors de la suppression du serveur: ' + (err.response?.data?.detail || err.message));
      }
    }
  };

  // Formater les dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Jamais';
    return moment(dateString).format('DD/MM/YYYY HH:mm:ss');
  };

  // Formatter les protocoles
  const formatProtocols = (protocols) => {
    if (!protocols) return '';
    return protocols
      .split(',')
      .map(p => p.toUpperCase())
      .join(', ');
  };

  if (loading) {
    return <Loading message="Chargement des détails du serveur..." />;
  }

  if (!server) {
    return <Alert type="error" message="Serveur non trouvé" />;
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>{server.name}</h1>
        <StatusBadge status={server.status} />
      </div>

      {error && <Alert type="error" message={error} />}

      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '24px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginTop: 0 }}>Informations</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Hostname</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{server.hostname}</p>
          </div>
          
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>IP</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{server.ip_address}</p>
          </div>
          
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Protocols</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{formatProtocols(server.protocols)}</p>
          </div>
          
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Status</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{server.enabled ? 'Yes' : 'No'}</p>
          </div>
        </div>

        {server.description && (
          <div style={{ marginTop: '16px' }}>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Description</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{server.description}</p>
          </div>
        )}
      </div>

      <div style={{ 
        backgroundColor: 'white', 
        borderRadius: '8px', 
        padding: '24px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        marginBottom: '20px'
      }}>
        <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginTop: 0 }}>Monitoring Status</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Last check</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{formatDate(server.last_check)}</p>
          </div>
          
          <div>
            <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Last status changed</h3>
            <p style={{ margin: 0, fontSize: '16px' }}>{formatDate(server.last_status_change)}</p>
          </div>
          
          {server.response_time && (
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Time in ms</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.response_time} ms</p>
            </div>
          )}
        </div>
      </div>

      {/* Configurations spécifiques aux protocoles */}
      {server.protocols.includes('http') && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          padding: '24px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginTop: 0 }}>Configuration HTTP</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Port</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.http_port || '80'}</p>
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>HTTPS</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.use_https ? 'Oui' : 'Non'}</p>
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Path</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.http_path || '/'}</p>
            </div>
          </div>
        </div>
      )}

      {server.protocols.includes('ssh') && (
        <div style={{ 
          backgroundColor: 'white', 
          borderRadius: '8px', 
          padding: '24px',
          boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
          marginBottom: '20px'
        }}>
          <h2 style={{ borderBottom: '1px solid #eee', paddingBottom: '10px', marginTop: 0 }}>Configuration SSH</h2>
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Port</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.ssh_port || '22'}</p>
            </div>
            
            <div>
              <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Username</h3>
              <p style={{ margin: 0, fontSize: '16px' }}>{server.ssh_username || 'Non configuré'}</p>
            </div>
            
            {server.ssh_key_path && (
              <div>
                <h3 style={{ margin: '0 0 8px 0', color: '#555', fontSize: '14px' }}>Path of key</h3>
                <p style={{ margin: 0, fontSize: '16px' }}>{server.ssh_key_path}</p>
              </div>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '10px', marginTop: '30px' }}>
        <button
          onClick={handleCheckServer}
          disabled={checking}
          style={{
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: checking ? 'not-allowed' : 'pointer',
            opacity: checking ? 0.7 : 1
          }}
        >
          {checking ? 'Vérification...' : 'Check now'}
        </button>
        
        <button
          onClick={() => navigate(`/servers/edit/${serverId}`)}
          style={{
            backgroundColor: '#2196f3',
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Modify
        </button>
        
        <button
          onClick={handleDeleteServer}
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
        <button
          onClick={() => navigate(`/servers/${serverId}/security`)}
          style={{
            backgroundColor: '#ff9800',
            color: 'white',
            border: 'none',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}
        >
          Security scan
        </button>
        <button
          onClick={() => navigate('/servers')}
          style={{
            backgroundColor: '#f5f5f5',
            color: '#333',
            border: '1px solid #ddd',
            padding: '10px 16px',
            borderRadius: '4px',
            cursor: 'pointer',
            marginLeft: 'auto'
          }}
        >
          Back
        </button>
      </div>
    </div>
  );
};

export default ServerDetail;