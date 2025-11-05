import React from 'react';
import EmailSettings from '../components/settings/EmailSettings';
import { Settings as SettingsIcon } from 'lucide-react';

const SettingsPage = () => {
  return (
    <div className="animate-fadeIn">
      <div style={{ marginBottom: '2rem' }}>
        <h1 style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <SettingsIcon size={32} style={{ color: 'var(--primary-600)' }} />
          System Settings
        </h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginTop: '0.5rem' }}>
          Configure monitoring and notification settings
        </p>
      </div>

      <div style={{ marginBottom: '2rem' }}>
        <EmailSettings />
      </div>

      {/* Placeholder for future settings sections */}
      {/* <div style={{ marginBottom: '2rem' }}>
        <OtherSettings />
      </div> */}
    </div>
  );
};

export default SettingsPage;