import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import ServerItem from './ServerItem';
import Loading from '../common/Loading';
import Alert from '../common/Alert';
import serverApi from '../../services/api';

const ServerList = () => {
  const [servers, setServers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [checkingAll, setCheckingAll] = useState(false);

  // Charger les serveurs au chargement du composant
  useEffect(() => {
    fetchServers();
  }, []);

  // Récupérer tous les serveurs depuis l'API
  const fetchServers = async () => {
    try {
      setLoading(true);
      const response = await serverApi.getServers();
      setServers(response.data);
      setError(null);
    } catch (err) {
      setError('Erreur lors du chargement des serveurs: ' + (err.response?.data?.detail || err.message));
    } finally {
      setLoading(false);
    }
  };

  // Vérifier l'état d'un serveur spécifique
  const handleCheckServer = async (serverId) => {
    try {
      const response = await serverApi.checkServer(serverId);
      // Mettre à jour le serveur vérifié dans la liste
      setServers(servers.map(server => 
        server.id === serverId 
          ? { ...server, status: response.data.status, last_check: response.data.last_check, response_time: response.data.response_time }
          : server
      ));
    } catch (err) {
      setError('Erreur lors de la vérification du serveur: ' + (err.response?.data?.detail || err.message));
    }
  };

  // Vérifier l'état de tous les serveurs
  const handleCheckAllServers = async () => {
    try {
      setCheckingAll(true);
      const response = await serverApi.checkAllServers();
      
      // Créer un objet Map pour faciliter la mise à jour
      const updatedServersMap = new Map(
        response.data.map(checkResult => [
          checkResult.id, 
          { status: checkResult.status, last_check: checkResult.last_check, response_time: checkResult.response_time }
        ])
      );
      
      // Mettre à jour tous les serveurs avec leurs nouveaux statuts
      setServers(servers.map(server => {
        const checkResult = updatedServersMap.get(server.id);
        if (checkResult) {
          return { ...server, ...checkResult };
        }
        return server;
      }));
      
    } catch (err) {
      setError('Erreur lors de la vérification des serveurs: ' + (err.response?.data?.detail || err.message));
    } finally {
      setCheckingAll(false);
    }
  };

  // Supprimer un serveur
  const handleDeleteServer = async (serverId) => {
    if (window.confirm('Êtes-vous sûr de vouloir supprimer ce serveur ?')) {
      try {
        await serverApi.deleteServer(serverId);
        // Retirer le serveur supprimé de la liste
        setServers(servers.filter(server => server.id !== serverId));
      } catch (err) {
        setError('Erreur lors de la suppression du serveur: ' + (err.response?.data?.detail || err.message));
      }
    }
  };

  if (loading) {
    return <Loading message="Chargement des serveurs..." />;
  }

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{ margin: 0 }}>Servers List</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={handleCheckAllServers}
            disabled={checkingAll}
            style={{
              backgroundColor: '#4caf50',
              color: 'white',
              border: 'none',
              padding: '10px 16px',
              borderRadius: '4px',
              cursor: checkingAll ? 'not-allowed' : 'pointer',
              opacity: checkingAll ? 0.7 : 1
            }}
          >
            {checkingAll ? 'Vérification...' : 'Check all servers'}
          </button>
          <Link
            to="/servers/new"
            style={{
              backgroundColor: '#2196f3',
              color: 'white',
              textDecoration: 'none',
              padding: '10px 16px',
              borderRadius: '4px',
              display: 'inline-block'
            }}
          >
            Add a server
          </Link>
        </div>
      </div>

      {error && <Alert type="error" message={error} />}

      {servers.length === 0 ? (
        <div style={{ 
          padding: '40px', 
          textAlign: 'center',
          backgroundColor: '#f5f5f5',
          borderRadius: '8px'
        }}>
          <p>Nothing server has been added.</p>
          <Link 
            to="/servers/new"
            style={{
              color: '#2196f3',
              textDecoration: 'none',
              fontWeight: 'bold'
            }}
          >
            Add your first server
          </Link>
        </div>
      ) : (
        <div>
          {servers.map(server => (
            <ServerItem
              key={server.id}
              server={server}
              onCheck={handleCheckServer}
              onDelete={handleDeleteServer}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default ServerList;