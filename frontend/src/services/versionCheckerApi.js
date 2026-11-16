import axios from 'axios';

// Instance dédiée : le token JWT est relu à chaque requête (comme cveApi.js / agentApi.js).
const versionCheckerClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

versionCheckerClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

const BASE = '/version-checker';

const versionCheckerApi = {
  // Catalogue des applications supportées (formulaire d'ajout)
  getApps: () => versionCheckerClient.get(`${BASE}/apps`),
  getSummary: () => versionCheckerClient.get(`${BASE}/summary`),

  // Cibles (instances à surveiller)
  getTargets: () => versionCheckerClient.get(`${BASE}/targets`),
  getTarget: (id) => versionCheckerClient.get(`${BASE}/targets/${id}`),
  createTarget: (data) => versionCheckerClient.post(`${BASE}/targets`, data),
  updateTarget: (id, data) => versionCheckerClient.patch(`${BASE}/targets/${id}`, data),
  deleteTarget: (id) => versionCheckerClient.delete(`${BASE}/targets/${id}`),

  // Contrôles (admin) : local + version officielle, enregistrés en historique
  checkTarget: (id) => versionCheckerClient.post(`${BASE}/targets/${id}/check`, null, { timeout: 60000 }),
  checkAll: () => versionCheckerClient.post(`${BASE}/check`, null, { timeout: 120000 }),
  getHistory: (id, limit = 50) =>
    versionCheckerClient.get(`${BASE}/targets/${id}/history`, { params: { limit } }),
};

// --- helpers partagés par les pages -------------------------------------------------------

// Le backend renvoie des dates UTC naïves (sans fuseau) : sans « Z », le navigateur les lirait en heure locale.
export const parseUtc = (value) => {
  if (!value) return null;
  const hasZone = /[zZ]$|[+-]\d{2}:?\d{2}$/.test(value);
  return new Date(hasZone ? value : `${value}Z`);
};

export const formatDateTime = (value) => {
  const d = parseUtc(value);
  return d ? d.toLocaleString() : '-';
};

// detail FastAPI : chaîne (HTTPException) ou liste d'erreurs de validation (422)
export const apiErrorMessage = (error, fallback = 'Request failed') => {
  const detail = error?.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail.length) {
    return detail.map((d) => `${(d.loc || []).slice(1).join('.') || 'field'}: ${d.msg}`).join(' ; ');
  }
  if (error?.code === 'ECONNABORTED') return 'Request timed out';
  return fallback;
};

// Droits admin lus dans l'utilisateur stocké au login (le backend reste l'autorité : 403 sinon)
export const isAdminUser = () => {
  try {
    return Boolean(JSON.parse(localStorage.getItem('user'))?.is_admin);
  } catch (e) {
    return false;
  }
};

export default versionCheckerApi;