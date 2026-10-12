import React from 'react';
import ReactDOM from 'react-dom/client';
import './styles/main.css';
import App from './App';
import { initTheme } from './hooks/useTheme';

// Applique data-theme (localStorage 'app-theme', dark par défaut) avant le premier rendu
initTheme();

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
