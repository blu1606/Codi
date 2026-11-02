import { StrictMode, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import './styles/app.css';
import './styles/charts.css';
import './styles/commerce.css';
import './styles/learning.css';
import './styles/ai.css';
import './styles/lecturer.css';
import './styles/admin.css';
import { loadStore } from './lib/codi';
import App from './App';

/** Loads the snapshot from the API before rendering; shows a recoverable error when the API/DB is down. */
function Boot() {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const load = () => {
    setStatus('loading');
    loadStore().then(() => setStatus('ready')).catch((e) => { setError(e.message); setStatus('error'); });
  };
  useEffect(load, []);

  if (status === 'ready') return <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><App /></BrowserRouter>;
  return (
    <main className="app-main">
      <div className="page page-narrow">
        {status === 'loading' ? (
          <div className="card"><div className="card-body stack-3" aria-busy="true">
            <p className="muted">Đang tải dữ liệu Codi…</p>
            <div className="skeleton skeleton-line" style={{ width: '70%' }} />
            <div className="skeleton skeleton-line" style={{ width: '90%' }} />
          </div></div>
        ) : (
          <div className="alert alert-danger" role="alert">
            <div className="alert-body">
              <span className="alert-title">Không kết nối được máy chủ dữ liệu</span>
              <span>{error}. Hãy chạy <code>npm run db:up</code> rồi <code>npm start</code>.</span>
              <div className="alert-actions"><button type="button" className="btn btn-primary btn-sm" onClick={load}>Thử lại</button></div>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<StrictMode><Boot /></StrictMode>);
