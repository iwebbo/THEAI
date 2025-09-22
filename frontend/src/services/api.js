import axios from 'axios';

// Création d'une instance axios avec la configuration de base
const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: {
    'Content-Type': 'application/json',
  },
});

// API des serveurs
const serverApi = {
  // Récupère la liste de tous les serveurs
  getServers: () => {
    return api.get('/servers');
  },

  // Récupère un serveur spécifique par son ID
  getServer: (id) => {
    return api.get(`/servers/${id}`);
  },

  // Crée un nouveau serveur
  createServer: (serverData) => {
    return api.post('/servers', serverData);
  },

  // Met à jour un serveur existant
  updateServer: (id, serverData) => {
    return api.put(`/servers/${id}`, serverData);
  },

  // Supprime un serveur
  deleteServer: (id) => {
    return api.delete(`/servers/${id}`);
  },

  // Vérifie l'état d'un serveur spécifique
  checkServer: (id) => {
    return api.get(`/servers/${id}/check`);
  },

  // Vérifie l'état de tous les serveurs
  checkAllServers: () => {
    return api.get('/servers/check/all');
  }
};

export default serverApi;