import React from 'react';
import Header from './Header';
import Sidebar from './Sidebar';

const Layout = ({ children, user, onLogout }) => {
  return (
    <div className="app-shell">
      <Sidebar />
      <div className="main-column">
        <Header user={user} onLogout={onLogout} />
        <main className="content-area">
          <div className="content-inner">{children}</div>
        </main>
      </div>
    </div>
  );
};

export default Layout;
