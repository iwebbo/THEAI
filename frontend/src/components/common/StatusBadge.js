import React from 'react';

const StatusBadge = ({ status }) => {
  // Définition des couleurs en fonction du statut
  const getStatusStyle = () => {
    switch (status) {
      case 'online':
        return {
          backgroundColor: '#d1fae5', // success-100
          color: '#047857',           // success-700
          border: '1px solid #a7f3d0', // success-200
          icon: '●'
        };
      case 'offline':
        return {
          backgroundColor: '#fee2e2', // error-100
          color: '#b91c1c',           // error-700
          border: '1px solid #fecaca', // error-200
          icon: '●'
        };
      case 'unknown':
      default:
        return {
          backgroundColor: '#f3f4f6', // gray-100
          color: '#374151',           // gray-700
          border: '1px solid #d1d5db', // gray-200
          icon: '●'
        };
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'online':
        return 'online';
      case 'offline':
        return 'offline';
      case 'unknown':
      default:
        return 'unknown';
    }
  };

  const statusStyle = getStatusStyle();
  const label = getStatusLabel();

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.375rem',
        padding: '0.25rem 0.75rem',
        borderRadius: '9999px',
        fontSize: '0.75rem',
        fontWeight: '500',
        textTransform: 'uppercase',
        letterSpacing: '0.025em',
        ...statusStyle
      }}
    >
      <span style={{ fontSize: '0.5rem' }}>{statusStyle.icon}</span>
      {label}
    </span>
  );
};

export default StatusBadge;