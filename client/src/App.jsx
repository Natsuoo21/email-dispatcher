import { useState, useEffect } from 'react';
import Settings from './pages/Settings';
import Editor from './pages/Editor';
import Recipients from './pages/Recipients';
import Compose from './pages/Compose';
import './App.css';

const PAGES = {
  editor: { label: 'Editor', icon: '{}' },
  recipients: { label: 'Recipients', icon: '[]' },
  compose: { label: 'Compose', icon: '>>' },
  logs: { label: 'Logs', icon: '##' },
  settings: { label: 'Settings', icon: '@@' },
};

function App() {
  const [page, setPage] = useState('editor');
  const [templateRefresh, setTemplateRefresh] = useState(0);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  function showToast(message, type = 'success') {
    setToast({ message, type });
  }

  function renderPage() {
    switch (page) {
      case 'editor':
        return <Editor showToast={showToast} onTemplateChange={() => setTemplateRefresh(r => r + 1)} />;
      case 'settings':
        return <Settings showToast={showToast} />;
      case 'recipients':
        return <Recipients showToast={showToast} />;
      case 'compose':
        return <Compose showToast={showToast} />;
      case 'logs':
        return (
          <div className="empty-state">
            <h3>{PAGES[page].label}</h3>
            <p>Coming in Phase 6</p>
          </div>
        );
      default:
        return null;
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-logo">
          <h1>DISPATCHER</h1>
          <p>HTML Email Sender</p>
        </div>
        <nav>
          {Object.entries(PAGES).map(([key, { label }]) => (
            <a
              key={key}
              href="#"
              className={page === key ? 'active' : ''}
              onClick={(e) => { e.preventDefault(); setPage(key); }}
            >
              {label}
            </a>
          ))}
        </nav>
      </aside>

      <main className="main-content">
        {renderPage()}
      </main>

      {toast && (
        <div className={`toast toast-${toast.type}`}>
          {toast.message}
        </div>
      )}
    </div>
  );
}

export default App;
