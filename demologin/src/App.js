import React from 'react';
import './components/Auth.css';
import Login from './components/Login';

function App() {
  return (
    <div className="auth-wrapper">
      <div className="auth-container">
        <Login />
      </div>
    </div>
  );
}

export default App;
