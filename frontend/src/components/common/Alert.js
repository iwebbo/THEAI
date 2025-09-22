import React, { useState, useEffect } from 'react';

const Alert = ({ type = 'info', message, duration = 0 }) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        setVisible(false);
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  if (!visible) return null;

  // Définir les styles en fonction du type d'alerte
  const getAlertStyle = () => {
    const baseStyle = {
      padding: '12px 16px',
      borderRadius: '4px',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between'
    };

    switch (type) {
      case 'success':
        return {
          ...baseStyle,
          backgroundColor: '#e8f5e9',
          color: '#2e7d32',
          border: '1px solid #c8e6c9'
        };
      case 'error':
        return {
          ...baseStyle,
          backgroundColor: '#ffebee',
          color: '#c62828',
          border: '1px solid #ffcdd2'
        };
      case 'warning':
        return {
          ...baseStyle,
          backgroundColor: '#fff8e1',
          color: '#f57f17',
          border: '1px solid #ffecb3'
        };
      case 'info':
      default:
        return {
          ...baseStyle,
          backgroundColor: '#e3f2fd',
          color: '#0d47a1',
          border: '1px solid #bbdefb'
        };
    }
  };

  return (
    <div style={getAlertStyle()}>
      <div>{message}</div>
      {duration === 0 && (
        <button
          onClick={() => setVisible(false)}
          style={{
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontSize: '16px',
            color: 'inherit'
          }}
        >
          ×
        </button>
      )}
    </div>
  );
};

export default Alert;