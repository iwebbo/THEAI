import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

const Layout = ({ children, user, onLogout }) => {
  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: 'var(--bg-secondary)'
      }}
    >
      <Header user={user} onLogout={onLogout} />
      <Sidebar />
      <main
        style={{
          marginLeft: '250px',
          padding: '2rem',
          paddingTop: 'calc(64px + 2rem)',
          minHeight: 'calc(100vh - 64px)'
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto'
          }}
        >
          {children}
        </div>
      </main>
    </div>
  );
};

export default Layout;