import React from 'react';
import { useParams } from 'react-router-dom';
import ServerDetail from '../components/servers/ServerDetail';

const ServerDetailPage = () => {
  const { id } = useParams();
  return <ServerDetail serverId={id} />;
};

export default ServerDetailPage;