import { useState, useEffect, Fragment } from 'react';
import { dispatchApi, smtpApi } from '../api';

const STATUS_COLORS = {
  done: 'var(--green)',
  sent: 'var(--green)',
  failed: 'var(--red)',
  sending: 'var(--accent)',
  scheduled: 'var(--amber)',
  cancelled: 'var(--text-muted)',
  pending: 'var(--text-secondary)',
};

function StatusBadge({ status }) {
  const color = STATUS_COLORS[status] || 'var(--text-muted)';
  return (
    <span style={{
      display: 'inline-block', padding: '2px 10px', borderRadius: 12,
      fontSize: 11, fontWeight: 600, textTransform: 'uppercase',
      color, background: `color-mix(in srgb, ${color} 15%, transparent)`,
      border: `1px solid color-mix(in srgb, ${color} 25%, transparent)`,
    }}>
      {status}
    </span>
  );
}

export default function Logs({ showToast }) {
  const [dispatches, setDispatches] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [expandedLogs, setExpandedLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // Filters
  const [filterStatus, setFilterStatus] = useState('');
  const [filterSmtp, setFilterSmtp] = useState('');
  const [filterSearch, setFilterSearch] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo] = useState('');

  useEffect(() => {
    loadDispatches();
    smtpApi.list().then(setAccounts).catch(err => showToast(err.message, 'error'));
  }, []);

  async function loadDispatches(filters) {
    setLoading(true);
    try {
      const data = await dispatchApi.list(filters || {});
      setDispatches(data);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  }

  function handleApplyFilters() {
    const filters = {};
    if (filterStatus) filters.status = filterStatus;
    if (filterSmtp) filters.smtp_account_id = filterSmtp;
    if (filterSearch) filters.search = filterSearch;
    if (filterFrom) filters.from = filterFrom;
    if (filterTo) filters.to = filterTo;
    loadDispatches(filters);
  }

  function handleClearFilters() {
    setFilterStatus('');
    setFilterSmtp('');
    setFilterSearch('');
    setFilterFrom('');
    setFilterTo('');
    loadDispatches();
  }

  async function handleExpand(id) {
    if (expandedId === id) {
      setExpandedId(null);
      setExpandedLogs([]);
      return;
    }
    setExpandedId(id);
    setLoadingLogs(true);
    try {
      const logs = await dispatchApi.logs(id);
      setExpandedLogs(logs);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setLoadingLogs(false);
    }
  }

  async function handleCancel(id) {
    try {
      await dispatchApi.cancelScheduled(id);
      showToast('Scheduled dispatch cancelled');
      loadDispatches();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleRetry(id) {
    try {
      const result = await dispatchApi.retry(id);
      showToast(result.message);
      loadDispatches();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDelete(id) {
    if (!confirm('Delete this dispatch and all its logs?')) return;
    try {
      await dispatchApi.remove(id);
      showToast('Dispatch deleted');
      if (expandedId === id) { setExpandedId(null); setExpandedLogs([]); }
      loadDispatches();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  const scheduled = dispatches.filter(d => d.status === 'scheduled');
  const history = dispatches.filter(d => d.status !== 'scheduled');

  return (
    <>
      <div className="page-header">
        <h2>Logs</h2>
        <p>Dispatch history, scheduled sends, and per-email logs</p>
      </div>

      {/* Filter Bar */}
      <div className="card" style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Status</label>
          <select className="form-input" style={{ width: 140 }} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="done">Done</option>
            <option value="failed">Failed</option>
            <option value="sending">Sending</option>
            <option value="scheduled">Scheduled</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>SMTP Account</label>
          <select className="form-input" style={{ width: 180 }} value={filterSmtp} onChange={e => setFilterSmtp(e.target.value)}>
            <option value="">All</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>From</label>
          <input type="date" className="form-input" style={{ width: 150 }} value={filterFrom} onChange={e => setFilterFrom(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>To</label>
          <input type="date" className="form-input" style={{ width: 150 }} value={filterTo} onChange={e => setFilterTo(e.target.value)} />
        </div>
        <div style={{ flex: 1, minWidth: 160 }}>
          <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Search</label>
          <input className="form-input" placeholder="Dispatch or template name..." value={filterSearch} onChange={e => setFilterSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleApplyFilters()} />
        </div>
        <button className="btn btn-primary btn-sm" onClick={handleApplyFilters}>Apply</button>
        <button className="btn btn-sm" onClick={handleClearFilters}>Clear</button>
      </div>

      {/* Scheduled Panel */}
      {scheduled.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12, color: 'var(--amber)' }}>
            Scheduled ({scheduled.length})
          </h3>
          <div style={{ display: 'grid', gap: 12 }}>
            {scheduled.map(d => (
              <div key={d.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{d.name}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 2 }}>
                    {d.template_name || 'Unknown template'} &middot; {d.smtp_name || 'Unknown SMTP'} &middot; {d.total_recipients} recipients
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--amber)', marginTop: 4 }}>
                    Scheduled for {new Date(d.scheduled_at).toLocaleString()}
                  </div>
                </div>
                <button className="btn btn-danger btn-sm" onClick={() => handleCancel(d.id)}>Cancel</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Dispatch History Table */}
      <div style={{ marginTop: 24 }}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>
          Dispatch History {!loading && `(${history.length})`}
        </h3>

        {loading ? (
          <div className="empty-state"><div className="spinner" /></div>
        ) : history.length === 0 ? (
          <div className="empty-state">
            <h3>No dispatches yet</h3>
            <p>Send your first dispatch from the Compose page</p>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 30 }}></th>
                  <th>Name</th>
                  <th>Template</th>
                  <th>SMTP</th>
                  <th>Status</th>
                  <th>Sent</th>
                  <th>Failed</th>
                  <th>Date</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {history.map(d => (
                  <Fragment key={d.id}>
                    <tr onClick={() => handleExpand(d.id)} style={{ cursor: 'pointer' }}>
                      <td style={{ fontSize: 10, color: 'var(--text-muted)' }}>{expandedId === d.id ? '\u25BC' : '\u25B6'}</td>
                      <td style={{ fontWeight: 500 }}>{d.name}</td>
                      <td>{d.template_name || '-'}</td>
                      <td>{d.smtp_name || '-'}</td>
                      <td><StatusBadge status={d.status} /></td>
                      <td style={{ color: 'var(--green)' }}>{d.sent_count}</td>
                      <td style={{ color: d.failed_count > 0 ? 'var(--red)' : 'var(--text-muted)' }}>{d.failed_count}</td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{new Date(d.created_at).toLocaleString()}</td>
                      <td onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          {d.failed_count > 0 && d.status !== 'sending' && (
                            <button className="btn btn-sm" onClick={() => handleRetry(d.id)}>Retry</button>
                          )}
                          <a className="btn btn-sm" href={dispatchApi.exportLogsUrl(d.id)} download>CSV</a>
                          <button className="btn btn-danger btn-sm" onClick={() => handleDelete(d.id)}>Del</button>
                        </div>
                      </td>
                    </tr>
                    {expandedId === d.id && (
                      <tr key={d.id + '-logs'}>
                        <td colSpan={9} style={{ padding: 0 }}>
                          <div style={{ padding: '12px 20px', background: 'var(--bg-primary)' }}>
                            {loadingLogs ? (
                              <div style={{ padding: 20, textAlign: 'center' }}><div className="spinner" /></div>
                            ) : expandedLogs.length === 0 ? (
                              <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>No logs found</div>
                            ) : (
                              <table className="data-table" style={{ fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    <th>Email</th>
                                    <th>Status</th>
                                    <th>Error</th>
                                    <th>Sent At</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {expandedLogs.map(log => (
                                    <tr key={log.id}>
                                      <td>{log.recipient_email}</td>
                                      <td><StatusBadge status={log.status} /></td>
                                      <td style={{ color: 'var(--red)', maxWidth: 300 }}>{log.error_message || '-'}</td>
                                      <td style={{ color: 'var(--text-muted)' }}>{log.sent_at ? new Date(log.sent_at).toLocaleString() : '-'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
