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

  // Configuration par type
  const getAlertConfig = () => {
    switch (type) {
      case 'success':
        return {
          icon: CheckCircle,
          className: 'alert-success',
          bgColor: '#ecfdf5',
          borderColor: '#a7f3d0',
          textColor: '#047857',
          iconColor: '#10b981'
        };
      case 'error':
        return {
          icon: XCircle,
          className: 'alert-error',
          bgColor: '#fef2f2',
          borderColor: '#fecaca',
          textColor: '#b91c1c',
          iconColor: '#ef4444'
        };
      case 'warning':
        return {
          icon: AlertTriangle,
          className: 'alert-warning',
          bgColor: '#fffbeb',
          borderColor: '#fde68a',
          textColor: '#b45309',
          iconColor: '#f59e0b'
        };
      case 'info':
      default:
        return {
          icon: Info,
          className: 'alert-info',
          bgColor: '#eff6ff',
          borderColor: '#bfdbfe',
          textColor: '#1e40af',
          iconColor: '#3b82f6'
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
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)'
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