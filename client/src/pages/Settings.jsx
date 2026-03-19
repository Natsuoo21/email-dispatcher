import { useState, useEffect } from 'react';
import { smtpApi } from '../api';

const PRESETS = {
  gmail: { host: 'smtp.gmail.com', port: 587 },
  outlook: { host: 'smtp.office365.com', port: 587 },
};

export default function Settings({ showToast }) {
  const [accounts, setAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [testing, setTesting] = useState(null);
  const [form, setForm] = useState({ name: '', email: '', host: '', port: 587, env_key: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadAccounts(); }, []);

  async function loadAccounts() {
    try {
      const data = await smtpApi.list();
      setAccounts(data);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function applyPreset(type) {
    const preset = PRESETS[type];
    setForm(f => ({ ...f, host: preset.host, port: preset.port }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await smtpApi.create(form);
      showToast('Account registered successfully');
      setForm({ name: '', email: '', host: '', port: 587, env_key: '' });
      setShowForm(false);
      loadAccounts();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleTest(id) {
    setTesting(id);
    try {
      const result = await smtpApi.test(id);
      showToast(result.message);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setTesting(null);
    }
  }

  async function handleSetDefault(id) {
    try {
      await smtpApi.setDefault(id);
      showToast('Default account updated');
      loadAccounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(id, name) {
    if (!confirm(`Delete account "${name}"?`)) return;
    try {
      await smtpApi.remove(id);
      showToast('Account deleted');
      loadAccounts();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header">
        <h2>SMTP Settings</h2>
        <p>Register and manage your email sender accounts</p>
      </div>

      {accounts.length === 0 && !showForm ? (
        <div className="empty-state">
          <h3>No SMTP accounts registered</h3>
          <p>Add your Gmail or Outlook account to start sending emails</p>
          <button className="btn btn-primary" onClick={() => setShowForm(true)}>
            + Add Account
          </button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 20 }}>
            <button className="btn btn-primary" onClick={() => setShowForm(true)}>
              + Add Account
            </button>
          </div>

          {accounts.map(acc => (
            <div key={acc.id} className="card">
              <div className="card-header">
                <div>
                  <div className="card-title">
                    {acc.name}
                    {acc.is_default ? <span className="badge badge-default" style={{ marginLeft: 8 }}>Default</span> : null}
                  </div>
                  <div className="card-subtitle">{acc.email}</div>
                </div>
                <div className="card-actions">
                  <button
                    className="btn btn-sm"
                    onClick={() => handleTest(acc.id)}
                    disabled={testing === acc.id}
                  >
                    {testing === acc.id ? <><span className="spinner"></span> Testing...</> : 'Test Connection'}
                  </button>
                  {!acc.is_default && (
                    <button className="btn btn-sm" onClick={() => handleSetDefault(acc.id)}>
                      Set Default
                    </button>
                  )}
                  <button className="btn btn-sm btn-danger" onClick={() => handleDelete(acc.id, acc.name)}>
                    Delete
                  </button>
                </div>
              </div>
              <div className="card-details">
                <span>Host: <code>{acc.host}:{acc.port}</code></span>
                <span>Env Key: <code>{acc.env_key}</code></span>
              </div>
            </div>
          ))}
        </>
      )}

      {showForm && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowForm(false)}>
          <div className="modal">
            <h3>Add SMTP Account</h3>

            <div className="presets">
              <button className="btn btn-sm" onClick={() => applyPreset('gmail')}>Gmail Preset</button>
              <button className="btn btn-sm" onClick={() => applyPreset('outlook')}>Outlook Preset</button>
            </div>

            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Friendly Name</label>
                <input className="form-input" placeholder='e.g., "Personal Gmail"'
                  value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
              </div>

              <div className="form-group">
                <label>Email Address</label>
                <input className="form-input" type="email" placeholder="you@gmail.com"
                  value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>SMTP Host</label>
                  <input className="form-input" placeholder="smtp.gmail.com"
                    value={form.host} onChange={e => setForm(f => ({ ...f, host: e.target.value }))} required />
                </div>
                <div className="form-group">
                  <label>Port</label>
                  <input className="form-input" type="number" placeholder="587"
                    value={form.port} onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 587 }))} required />
                </div>
              </div>

              <div className="form-group">
                <label>Environment Variable Key</label>
                <input className="form-input" placeholder="SMTP_GMAIL_PASS" style={{ fontFamily: 'var(--font-mono)' }}
                  value={form.env_key} onChange={e => setForm(f => ({ ...f, env_key: e.target.value }))} required />
                <div className="form-hint">
                  This key must exist in your <code>.env</code> file with the password as its value.
                </div>
              </div>

              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowForm(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Add Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
