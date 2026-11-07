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

  runCheck: (payload) => httpsClient.post('/http-synthetic/check', payload),

  createTarget: (payload) => httpsClient.post('/http-synthetic/targets', payload),
  listTargets: (params = {}) => httpsClient.get('/http-synthetic/targets', { params }),
  getTarget: (id) => httpsClient.get(`/http-synthetic/targets/${id}`),
  updateTarget: (id, payload) => httpsClient.put(`/http-synthetic/targets/${id}`, payload),
  removeTarget: (id) => httpsClient.delete(`/http-synthetic/targets/${id}`),
  checkTarget: (id) => httpsClient.post(`/http-synthetic/targets/${id}/check`),
  checkAllTargets: () => httpsClient.post('/http-synthetic/targets/check-all'),
  targetChecks: (id, params = {}) => httpsClient.get(`/http-synthetic/targets/${id}/checks`, { params }),

  list: (params = {}) => httpsClient.get('/http-synthetic/', { params }),

  latest: (params) => httpsClient.get('/http-synthetic/latest', { params }),

  get: (id) => httpsClient.get(`/http-synthetic/${id}`),

  remove: (id) => httpsClient.delete(`/http-synthetic/${id}`)
};

export default httpsMonitorApi;