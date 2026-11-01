import axios from 'axios';

// Instance dédiée : le token JWT est relu à chaque requête (comme agentApi.js / cveApi.js).
const httpsClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' }
});

httpsClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const httpsMonitorApi = {
  // Check complet. payload : { url | server_id, save, verify_tls, follow_redirects, probe_protocols, method, timeout }
  runCheck: (payload) => httpsClient.post('/http-synthetic/check', payload),

  // Historique : params { server_id, hostname, status, skip, limit (max 500) }, tri du plus récent au plus ancien
  list: (params = {}) => httpsClient.get('/http-synthetic/', { params }),

  // Dernier résultat : params { server_id } ou { url }
  latest: (params) => httpsClient.get('/http-synthetic/latest', { params }),

  get: (id) => httpsClient.get(`/http-synthetic/${id}`),

  remove: (id) => httpsClient.delete(`/http-synthetic/${id}`)
};

export default httpsMonitorApi;