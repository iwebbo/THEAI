import React from 'react';
import { useParams } from 'react-router-dom';
import SecurityDashboard from '../components/security/SecurityDashboard';

const SecurityDashboardPage = () => {
  const { id } = useParams();
  return <SecurityDashboard serverId={id} />;
};

export default SecurityDashboardPage;