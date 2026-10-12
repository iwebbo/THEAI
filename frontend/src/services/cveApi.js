import axios from 'axios';

// Instance dédiée : le token est relu à chaque requête.
// (l'instance de api.js est créée avant le login et n'envoie donc pas le Bearer)
const cveClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

cveClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const cveApi = {
  getStats: () => cveClient.get('/cve/stats'),
  search: (params) => cveClient.get('/cve/search', { params }),
};

export default cveApi;
