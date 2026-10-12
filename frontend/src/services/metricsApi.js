import axios from 'axios';

// Instance dédiée : le token est relu à chaque requête
// (même raison que cveApi.js : l'instance de api.js n'envoie pas le Bearer).
const metricsClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

metricsClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const metricsApi = {
  getOverview: (hours) => metricsClient.get('/metrics/overview', { params: { hours } }),
};

export default metricsApi;
