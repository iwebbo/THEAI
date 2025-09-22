import React from 'react';
import EmailSettings from '../components/settings/EmailSettings';

const SettingsPage = () => {
  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '20px' }}>
      <h1 style={{ margin: '0 0 30px 0' }}>Paramètres du système</h1>
      
      <div style={{ marginBottom: '30px' }}>
        <EmailSettings />
      </div>
      
      {/* Vous pouvez ajouter d'autres sections de paramètres ici */}
    </div>
  );
};

export default SettingsPage;