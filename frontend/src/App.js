import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import axios from 'axios';

import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';
import Dashboard from './pages/Dashboard';
import ServerListPage from './pages/ServerListPage';
import ServerDetailPage from './pages/ServerDetailPage';
import ServerFormPage from './pages/ServerFormPage';
import SettingsPage from './pages/SettingsPage';
import Loading from './components/common/Loading';
import SecurityDashboardPage from './pages/SecurityDashboardPage';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Vérifier l'authentification au chargement
  useEffect(() => {
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    const token = localStorage.getItem('access_token');
    const userData = localStorage.getItem('user');

    if (token && userData) {
      try {
        // Configurer axios avec le token
        axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
        
        // Vérifier si le token est toujours valide
        const response = await axios.get('/api/v1/auth/me');
        
        setUser(JSON.parse(userData));
        setIsAuthenticated(true);
      } catch (error) {
        // Token invalide, nettoyer le localStorage
        handleLogout();
      }
    }
    
    setLoading(false);
  };

  const handleLogin = (userData, token) => {
    setUser(userData);
    setIsAuthenticated(true);
    
    // Configurer axios pour les futures requêtes
    axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  };

  const handleLogout = () => {
    localStorage.removeItem('access_token');
    localStorage.removeItem('user');
    delete axios.defaults.headers.common['Authorization'];
    setUser(null);
    setIsAuthenticated(false);
  };

  // Composant de protection des routes
  const ProtectedRoute = ({ children }) => {
    if (!isAuthenticated) {
      return <Navigate to="/login" replace />;
    }
    return children;
  };

  if (loading) {
    return <Loading message="Loading THEAI..." />;
  }

  return (
    <Router>
      <Routes>
        {/* Route de login */}
        <Route 
          path="/login" 
          element={
            isAuthenticated ? 
            <Navigate to="/" replace /> : 
            <LoginPage onLogin={handleLogin} />
          } 
        />
        
        {/* Routes protégées */}
        <Route 
          path="/*" 
          element={
            <ProtectedRoute>
              <Layout user={user} onLogout={handleLogout}>
                <Routes>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/servers" element={<ServerListPage />} />
                  <Route path="/servers/:id" element={<ServerDetailPage />} />
                  <Route path="/servers/new" element={<ServerFormPage />} />
                  <Route path="/servers/edit/:id" element={<ServerFormPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/servers/:id/security" element={<SecurityDashboardPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </Layout>
            </ProtectedRoute>
          } 
        />
      </Routes>
    </Router>
  );
}

export default App;