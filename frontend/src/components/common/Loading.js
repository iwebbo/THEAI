import React from 'react';
import { Loader2 } from 'lucide-react';

const Loading = ({ message = 'Loading...', size = 'md' }) => {
  const sizeMap = {
    sm: 24,
    md: 40,
    lg: 56
  };

  const iconSize = sizeMap[size] || sizeMap.md;

  return (
    <div
      className="animate-fadeIn"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '3rem 1rem',
        textAlign: 'center',
        minHeight: '200px'
      }}
    >
      {/* Spinner avec gradient THEAI */}
      <div
        style={{
          position: 'relative',
          marginBottom: '1.5rem'
        }}
      >
        <Loader2 
          size={iconSize}
          className="animate-spin"
          style={{
            color: '#3b82f6'
          }}
        />
      </div>

      {/* Message */}
      <p
        style={{
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          fontWeight: 500
        }}
      >
        {message}
      </p>
    </div>
  );
};

export default Loading;