import axios from 'axios';

// Instance dédiée : le token JWT est relu à chaque requête (comme cveApi.js).
const agentClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

agentClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const agentApi = {
  getStatus: (serverId) => agentClient.get(`/agents/servers/${serverId}`),
  createEnrollment: (serverId) => agentClient.post(`/agents/servers/${serverId}/enrollment`),
  revoke: (serverId) => agentClient.delete(`/agents/servers/${serverId}`),
  getMetrics: (serverId, hours = 6) =>
    agentClient.get(`/agents/servers/${serverId}/metrics`, { params: { hours } }),
  getVulns: (serverId, limit = 50, offset = 0) =>
    agentClient.get(`/agents/servers/${serverId}/vulns`, { params: { limit, offset } }),
  refreshVulns: (serverId) => agentClient.post(`/agents/servers/${serverId}/vulns/refresh`),
  getAllVulns: (limit = 100, offset = 0) =>
    agentClient.get('/agents/vulns', { params: { limit, offset } }),
};

export default agentApi;
