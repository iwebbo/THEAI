import React from 'react';
import { CheckCircle, XCircle, HelpCircle, Loader } from 'lucide-react';

const StatusBadge = ({ status }) => {
  // Configuration des styles et icônes par statut
  const getStatusConfig = () => {
    switch (status?.toLowerCase()) {
      case 'online':
        return {
          icon: CheckCircle,
          label: 'Online',
          className: 'badge-success',
          dotColor: '#10b981'
        };
      case 'offline':
        return {
          icon: XCircle,
          label: 'Offline',
          className: 'badge-error',
          dotColor: '#ef4444'
        };
      case 'checking':
        return {
          icon: Loader,
          label: 'Checking',
          className: 'badge-primary',
          dotColor: '#3b82f6',
          animate: true
        };
      case 'unknown':
      default:
        return {
          icon: HelpCircle,
          label: 'Unknown',
          className: 'badge-gray',
          dotColor: '#6b7280'
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