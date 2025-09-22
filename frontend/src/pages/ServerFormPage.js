import React from 'react';
import { useParams } from 'react-router-dom';
import ServerForm from '../components/servers/ServerForm';

const ServerFormPage = () => {
  const { id } = useParams();
  return <ServerForm serverId={id} />;
};

export default ServerFormPage;