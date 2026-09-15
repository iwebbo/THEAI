import React, { useEffect } from 'react';
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react';

const Alert = ({ type = 'info', message, duration = 0, onClose }) => {
  const [visible, setVisible] = React.useState(true);

  useEffect(() => {
    if (duration > 0) {
      const timer = setTimeout(() => {
        handleClose();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [duration]);

  const handleClose = () => {
    setVisible(false);
    if (onClose) onClose();
  };

  if (!visible) return null;

  // Configuration par type - tokens CSS uniquement (dark-mode ready)
  const getAlertConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          className: 'alert-success',
          bgColor: 'var(--success-100)',
          borderColor: 'var(--success-200)',
          textColor: 'var(--success-700)',
          iconColor: 'var(--success-500)'
        };
      case 'error':
        return {
          icon: XCircle,
          className: 'alert-error',
          bgColor: 'var(--error-100)',
          borderColor: 'var(--error-200)',
          textColor: 'var(--error-700)',
          iconColor: 'var(--error-500)'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          className: 'alert-warning',
          bgColor: 'var(--warning-100)',
          borderColor: 'var(--warning-200)',
          textColor: 'var(--warning-700)',
          iconColor: 'var(--warning-500)'
        };
      case 'info':
      default:
        return {
          icon: Info,
          className: 'alert-info',
          bgColor: 'var(--primary-100)',
          borderColor: 'var(--primary-200)',
          textColor: 'var(--primary-700)',
          iconColor: 'var(--primary-500)'
        };
    }
  };

  const config = getAlertConfig();
  const Icon = config.icon;

  return (
    <div
      className="animate-fadeIn"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.75rem',
        padding: '1rem',
        borderRadius: '0.75rem',
        marginBottom: '1rem',
        backgroundColor: config.bgColor,
        border: `1px solid ${config.borderColor}`,
        color: config.textColor,
        boxShadow: 'var(--shadow-sm)'
      }}
    >
      <Icon size={20} style={{ color: config.iconColor, flexShrink: 0, marginTop: '0.125rem' }} />
      
      <div style={{ flex: 1, fontSize: '0.875rem', lineHeight: '1.5' }}>
        {message}
      </div>

      <button
        onClick={handleClose}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: '0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: config.textColor,
          opacity: 0.7,
          transition: 'opacity 150ms',
          flexShrink: 0
        }}
        onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
        onMouseLeave={(e) => e.currentTarget.style.opacity = '0.7'}
        aria-label="Close alert"
      >
        <X size={18} />
      </button>
    </div>
  );
};

export default Alert;