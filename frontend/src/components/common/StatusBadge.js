import React from 'react';
import { CheckCircle, XCircle, HelpCircle, Loader } from 'lucide-react';

const StatusBadge = ({ status }) => {
  // Configuration des styles et icÃ´nes par statut
  const getStatusConfig = () => {
    switch (status?.toLowerCase()) {
      case 'online':
        return {
          icon: CheckCircle,
          label: 'Online',
          className: 'badge-success',
          dotColor: 'var(--success-500)'
        };
      case 'offline':
        return {
          icon: XCircle,
          label: 'Offline',
          className: 'badge-error',
          dotColor: 'var(--error-500)'
        };
      case 'checking':
        return {
          icon: Loader,
          label: 'Checking',
          className: 'badge-primary',
          dotColor: 'var(--primary-500)',
          animate: true
        };
      case 'unknown':
      default:
        return {
          icon: HelpCircle,
          label: 'Unknown',
          className: 'badge-gray',
          dotColor: 'var(--text-tertiary)'
        };
    }
  };

  const config = getStatusConfig();
  const Icon = config.icon;

  return (
    <span className={`badge ${config.className}`}>
      <Icon 
        size={12} 
        className={config.animate ? 'animate-spin' : ''} 
      />
      {config.label}
    </span>
  );
};

export default StatusBadge;