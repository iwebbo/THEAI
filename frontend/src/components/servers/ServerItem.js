import React from 'react';
import { Link } from 'react-router-dom';
import StatusBadge from '../common/StatusBadge';
import moment from 'moment';

const ServerItem = ({ server, onCheck, onDelete }) => {
  // Formatage des dates
  const formatDate = (dateString) => {
    if (!dateString) return 'Jamais';
    return moment(dateString).format('DD/MM/YYYY HH:mm:ss');
  };

  // Formatage des protocoles (conversion de "icmp,http" en "ICMP, HTTP")
  const formatProtocols = (protocols) => {
    if (!protocols) return '';
    return protocols
      .split(',')
      .map(p => p.toUpperCase())
      .join(', ');
  };

  return (
    <div
      style={{
        border: '1px solid #e0e0e0',
        borderRadius: '4px',
        padding: '16px',
        margin: '8px 0',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: 'white',
        boxShadow: '0 2px 4px rgba(0,0,0,0.05)'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <h3 style={{ margin: 0, fontSize: '18px' }}>
          <Link to={`/servers/${server.id}`} style={{ textDecoration: 'none', color: '#2196f3' }}>
            {server.name}
          </Link>
        </h3>
        <StatusBadge status={server.status} />
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '12px' }}>
        <div>
          <span style={{ color: '#757575', fontSize: '14px' }}>Hostname:</span>
          <div>{server.hostname}</div>
        </div>
        <div>
          <span style={{ color: '#757575', fontSize: '14px' }}>IP:</span>
          <div>{server.ip_address}</div>
        </div>
        <div>
          <span style={{ color: '#757575', fontSize: '14px' }}>Protocols:</span>
          <div>{formatProtocols(server.protocols)}</div>
        </div>
        <div>
          <span style={{ color: '#757575', fontSize: '14px' }}>Last check:</span>
          <div>{formatDate(server.last_check)}</div>
        </div>
        {server.response_time && (
          <div>
            <span style={{ color: '#757575', fontSize: '14px' }}>Time in ms:</span>
            <div>{server.response_time} ms</div>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '8px', marginTop: 'auto' }}>
        <button
          onClick={() => onCheck(server.id)}
          style={{
            backgroundColor: '#4caf50',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Check now
        </button>
        <Link
          to={`/servers/edit/${server.id}`}
          style={{
            backgroundColor: '#2196f3',
            color: 'white',
            textDecoration: 'none',
            padding: '8px 12px',
            borderRadius: '4px'
          }}
        >
          Modify
        </Link>
        <Link
          to={`/servers/${server.id}/security`}
          style={{
            backgroundColor: '#ff9800',
            color: 'white',
            textDecoration: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          Security
        </Link>
        <button
          onClick={() => onDelete(server.id)}
          style={{
            backgroundColor: '#f44336',
            color: 'white',
            border: 'none',
            padding: '8px 12px',
            borderRadius: '4px',
            cursor: 'pointer'
          }}
        >
          Delete
        </button>
      </div>
    </div>
  );
};

export default ServerItem;