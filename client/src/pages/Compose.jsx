import { useState, useEffect, useRef } from 'react';
import { templateApi, recipientApi, smtpApi, dispatchApi } from '../api';

function detectVariables(text) {
  const matches = (text || '').match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

function renderPreview(template, subject, recipientData, variableMap, defaults) {
  function replace(str) {
    let result = str;
    for (const [variable, column] of Object.entries(variableMap)) {
      if (!column) continue;
      const val = recipientData[column] ?? defaults[variable] ?? '';
      result = result.replaceAll(`{{${variable}}}`, String(val));
    }
    result = result.replace(/\{\{(\w+)\}\}/g, (_, v) => defaults[v] ?? '');
    return result;
  }
  return { html: replace(template), subject: replace(subject) };
}

export default function Compose({ showToast }) {
  // Data sources
  const [templates, setTemplates] = useState([]);
  const [lists, setLists] = useState([]);
  const [accounts, setAccounts] = useState([]);

  // Selections
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedList, setSelectedList] = useState(null);
  const [recipients, setRecipients] = useState([]);
  const [columns, setColumns] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);

  // Variable mapping
  const [variables, setVariables] = useState([]);
  const [variableMap, setVariableMap] = useState({});
  const [defaults, setDefaults] = useState({});

  // Dispatch config
  const [dispatchName, setDispatchName] = useState('');
  const [subject, setSubject] = useState('');

  // Scheduling
  const [scheduleMode, setScheduleMode] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  // Preview
  const [previewIdx, setPreviewIdx] = useState(0);

  // Send state
  const [showConfirm, setShowConfirm] = useState(false);
  const [sending, setSending] = useState(false);
  const [progress, setProgress] = useState(null);
  const [dispatchResult, setDispatchResult] = useState(null);
  const eventSourceRef = useRef(null);

  // Load all data sources on mount
  useEffect(() => {
    templateApi.list().then(setTemplates).catch(err => showToast(err.message, 'error'));
    recipientApi.list().then(setLists).catch(err => showToast(err.message, 'error'));
    smtpApi.list().then(setAccounts).catch(err => showToast(err.message, 'error'));
  }, []);

  // Cleanup EventSource on unmount
  useEffect(() => {
    return () => {
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, []);

  // Auto-select default SMTP account
  useEffect(() => {
    if (accounts.length > 0 && !selectedAccount) {
      const def = accounts.find(a => a.is_default) || accounts[0];
      setSelectedAccount(def);
    }
  }, [accounts]);

  // When template is selected, extract variables and set subject
  function handleTemplateSelect(tplId) {
    const tpl = templates.find(t => t.id === tplId);
    if (!tpl) { setSelectedTemplate(null); setVariables([]); return; }
    setSelectedTemplate(tpl);
    setSubject(tpl.subject);
    const vars = [...new Set([
      ...detectVariables(tpl.html_content),
      ...detectVariables(tpl.subject),
    ])];
    setVariables(vars);
    // Auto-map variables to matching column names
    const autoMap = {};
    for (const v of vars) {
      const match = columns.find(c => c.toLowerCase() === v.toLowerCase());
      if (match) autoMap[v] = match;
    }
    setVariableMap(prev => ({ ...autoMap, ...prev }));
  }

  // When list is selected, load its rows
  async function handleListSelect(listId) {
    if (!listId) { setSelectedList(null); setRecipients([]); setColumns([]); return; }
    try {
      const full = await recipientApi.get(listId);
      const cols = JSON.parse(full.columns);
      const rows = full.rows.map(r => JSON.parse(r.data));
      setSelectedList(full);
      setColumns(cols);
      setRecipients(rows);
      // Re-automap variables with new columns
      const autoMap = {};
      for (const v of variables) {
        const match = cols.find(c => c.toLowerCase() === v.toLowerCase());
        if (match) autoMap[v] = match;
      }
      setVariableMap(prev => ({ ...autoMap, ...prev }));
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function updateMap(variable, column) {
    setVariableMap(prev => ({ ...prev, [variable]: column }));
  }

  function updateDefault(variable, value) {
    setDefaults(prev => ({ ...prev, [variable]: value }));
  }

  // Preview data
  const previewRecipient = recipients[previewIdx] || {};
  const preview = selectedTemplate
    ? renderPreview(selectedTemplate.html_content, subject, previewRecipient, variableMap, defaults)
    : null;

  // Find email column
  const emailCol = columns.find(c => c.toLowerCase() === 'email');

  // Validation
  const canSend = selectedTemplate && recipients.length > 0 && selectedAccount && dispatchName.trim() && subject.trim() && (emailCol || !columns.length);

  // Start dispatch
  async function handleSend() {
    if (!canSend) return;
    setSending(true);
    setShowConfirm(false);
    setProgress({ sent: 0, total: recipients.length, status: 'starting' });

    try {
      // Build recipients with email field at top level
      const recipientPayload = recipients.map(r => ({
        ...r,
        email: r[emailCol] || r.email,
      }));

      const payload = {
        name: dispatchName.trim(),
        template_id: selectedTemplate.id,
        smtp_account_id: selectedAccount.id,
        subject,
        variable_map: variableMap,
        defaults,
        recipients: recipientPayload,
      };
      if (scheduleMode && scheduledAt) {
        payload.scheduled_at = new Date(scheduledAt).toISOString();
      }

      const dispatch = await dispatchApi.create(payload);

      // If scheduled, show toast and reset — no SSE needed
      if (dispatch.status === 'scheduled') {
        showToast(`Dispatch scheduled for ${new Date(scheduledAt).toLocaleString()}`);
        handleReset();
        return;
      }

      // Connect to SSE for progress
      const es = new EventSource(`/api/dispatches/${dispatch.id}/progress`);
      eventSourceRef.current = es;

      es.onmessage = (event) => {
        const data = JSON.parse(event.data);
        setProgress(data);

        if (data.status === 'done' || data.status === 'failed') {
          es.close();
          eventSourceRef.current = null;
          setSending(false);
          setDispatchResult(data);
          if (data.status === 'done') {
            showToast(`Dispatch complete: ${data.sent_count} sent, ${data.failed_count} failed`);
          }
        }
      };

      es.onerror = () => {
        es.close();
        eventSourceRef.current = null;
        setSending(false);
      };
    } catch (err) {
      showToast(err.message, 'error');
      setSending(false);
      setProgress(null);
    }
  }

  // Reset to compose another
  function handleReset() {
    setProgress(null);
    setDispatchResult(null);
    setSending(false);
    setDispatchName('');
  }

  // If dispatch is in progress or done, show progress view
  if (progress) {
    const pct = progress.total > 0 ? Math.round((progress.sent || 0) / progress.total * 100) : 0;
    const isDone = progress.status === 'done' || progress.status === 'failed';

    return (
      <>
        <div className="page-header">
          <h2>{isDone ? 'Dispatch Complete' : 'Sending...'}</h2>
          <p>{dispatchName}</p>
        </div>

        <div className="card" style={{ padding: 32 }}>
          {/* Progress bar */}
          <div className="progress-bar-wrapper">
            <div className="progress-bar" style={{ width: `${pct}%` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, fontSize: 14 }}>
            <span>{progress.sent || 0} of {progress.total} emails</span>
            <span style={{ fontWeight: 600 }}>{pct}%</span>
          </div>

          {progress.current_email && !isDone && (
            <div style={{ marginTop: 16, fontSize: 13, color: 'var(--text-muted)' }}>
              Current: <code>{progress.current_email}</code>
            </div>
          )}

          {isDone && (
            <div style={{ marginTop: 24, display: 'flex', gap: 24 }}>
              <div className="stat-box stat-green">
                <div className="stat-value">{progress.sent_count ?? 0}</div>
                <div className="stat-label">Sent</div>
              </div>
              <div className="stat-box stat-red">
                <div className="stat-value">{progress.failed_count ?? 0}</div>
                <div className="stat-label">Failed</div>
              </div>
            </div>
          )}

          {isDone && (
            <div style={{ marginTop: 24 }}>
              <button className="btn btn-primary" onClick={handleReset}>Compose Another</button>
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-header">
        <h2>Compose</h2>
        <p>Assemble your email dispatch step by step</p>
      </div>

      <div className="info-banner">
        Emails are sent at ~1/sec to avoid rate limits. Gmail: 500/day, Outlook: 300/day.
      </div>

      {/* Step 1: Template */}
      <div className="compose-step">
        <div className="step-number">1</div>
        <div className="step-content">
          <label className="step-label">Select Template</label>
          <select
            className="form-input"
            value={selectedTemplate?.id || ''}
            onChange={e => handleTemplateSelect(e.target.value)}
          >
            <option value="">Choose a template...</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
          {templates.length === 0 && (
            <div className="form-hint">No templates saved yet. Create one in the Editor.</div>
          )}
        </div>
      </div>

      {/* Step 2: Recipients */}
      <div className="compose-step">
        <div className="step-number">2</div>
        <div className="step-content">
          <label className="step-label">Select Recipients</label>
          <select
            className="form-input"
            value={selectedList?.id || ''}
            onChange={e => handleListSelect(e.target.value)}
          >
            <option value="">Choose a saved list...</option>
            {lists.map(l => (
              <option key={l.id} value={l.id}>{l.name} ({l.row_count} recipients)</option>
            ))}
          </select>
          {recipients.length > 0 && (
            <div className="form-hint" style={{ color: 'var(--green)' }}>
              {recipients.length} recipients loaded — columns: {columns.join(', ')}
            </div>
          )}
          {columns.length > 0 && !emailCol && (
            <div className="form-hint" style={{ color: 'var(--red)' }}>
              No "email" column found in this list. An "email" column is required.
            </div>
          )}
        </div>
      </div>

      {/* Step 3: Variable Mapping */}
      {variables.length > 0 && (
        <div className="compose-step">
          <div className="step-number">3</div>
          <div className="step-content">
            <label className="step-label">Map Variables to Columns</label>
            {variables.map(v => (
              <div key={v} className="var-map-row">
                <code className="var-name">{`{{${v}}}`}</code>
                <span style={{ color: 'var(--text-muted)' }}>&rarr;</span>
                <select
                  className="form-input"
                  style={{ flex: 1 }}
                  value={variableMap[v] || ''}
                  onChange={e => updateMap(v, e.target.value)}
                >
                  <option value="">Not mapped</option>
                  {columns.map(c => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <input
                  className="form-input"
                  style={{ width: 160 }}
                  placeholder="Default value"
                  value={defaults[v] || ''}
                  onChange={e => updateDefault(v, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 4: SMTP Account */}
      <div className="compose-step">
        <div className="step-number">{variables.length > 0 ? 4 : 3}</div>
        <div className="step-content">
          <label className="step-label">SMTP Account</label>
          <select
            className="form-input"
            value={selectedAccount?.id || ''}
            onChange={e => setSelectedAccount(accounts.find(a => a.id === e.target.value))}
          >
            <option value="">Choose an account...</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.email}){a.is_default ? ' — Default' : ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Step 5: Subject & Name */}
      <div className="compose-step">
        <div className="step-number">{variables.length > 0 ? 5 : 4}</div>
        <div className="step-content">
          <label className="step-label">Subject Line</label>
          <input
            className="form-input"
            placeholder="Email subject..."
            value={subject}
            onChange={e => setSubject(e.target.value)}
          />
          {subject && detectVariables(subject).length > 0 && (
            <div className="form-hint">
              Variables: {detectVariables(subject).map(v => (
                <code key={v} style={{ marginLeft: 4 }}>{`{{${v}}}`}</code>
              ))}
            </div>
          )}
          <label className="step-label" style={{ marginTop: 12 }}>Dispatch Name</label>
          <input
            className="form-input"
            placeholder='e.g., "March 2025 Newsletter"'
            value={dispatchName}
            onChange={e => setDispatchName(e.target.value)}
          />
        </div>
      </div>

      {/* Step 6: Preview */}
      {selectedTemplate && recipients.length > 0 && (
        <div className="compose-step">
          <div className="step-number">{variables.length > 0 ? 6 : 5}</div>
          <div className="step-content">
            <label className="step-label">Preview with Real Data</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 12 }}>
              <select
                className="form-input"
                style={{ width: 300 }}
                value={previewIdx}
                onChange={e => setPreviewIdx(Number(e.target.value))}
              >
                {recipients.slice(0, 20).map((r, i) => (
                  <option key={i} value={i}>
                    {r[emailCol] || r.email || `Recipient ${i + 1}`}
                  </option>
                ))}
              </select>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                (showing first 20)
              </span>
            </div>
            {preview && (
              <>
                <div style={{ fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>
                  Subject: <strong>{preview.subject}</strong>
                </div>
                <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
                  <iframe
                    srcDoc={preview.html}
                    title="Preview"
                    style={{ width: '100%', height: 300, border: 'none', background: 'white' }}
                    sandbox=""
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Schedule Toggle & Send Button */}
      <div style={{ marginTop: 24 }}>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <button
            className={`btn ${!scheduleMode ? 'btn-primary' : ''}`}
            onClick={() => { setScheduleMode(false); setScheduledAt(''); }}
            style={{ padding: '8px 20px' }}
          >
            Send Now
          </button>
          <button
            className={`btn ${scheduleMode ? 'btn-primary' : ''}`}
            onClick={() => setScheduleMode(true)}
            style={{ padding: '8px 20px' }}
          >
            Schedule
          </button>
        </div>

        {scheduleMode && (
          <div style={{ marginBottom: 16 }}>
            <input
              type="datetime-local"
              className="form-input"
              style={{ maxWidth: 300 }}
              value={scheduledAt}
              min={new Date(Date.now() + 60000).toISOString().slice(0, 16)}
              onChange={e => setScheduledAt(e.target.value)}
            />
            {!scheduledAt && (
              <div className="form-hint">Pick a date and time to send</div>
            )}
          </div>
        )}

        <div style={{ display: 'flex', gap: 12 }}>
          <button
            className="btn btn-primary"
            disabled={!canSend || (scheduleMode && !scheduledAt)}
            onClick={() => setShowConfirm(true)}
            style={{ padding: '12px 32px', fontSize: 15 }}
          >
            {scheduleMode ? 'Schedule Dispatch' : 'Send Now'}
          </button>
          {!canSend && (
            <span style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: '44px' }}>
              {!selectedTemplate ? 'Select a template' : !recipients.length ? 'Select recipients' : (columns.length > 0 && !emailCol) ? 'List needs an "email" column' : !selectedAccount ? 'Select SMTP account' : !dispatchName.trim() ? 'Enter dispatch name' : 'Enter subject line'}
            </span>
          )}
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowConfirm(false)}>
          <div className="modal">
            <h3>Confirm Dispatch</h3>
            <div className="confirm-grid">
              <div className="confirm-row">
                <span className="confirm-label">Dispatch</span>
                <span>{dispatchName}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Template</span>
                <span>{selectedTemplate.name}</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Recipients</span>
                <span>{recipients.length} emails</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">From</span>
                <span>{selectedAccount.name} ({selectedAccount.email})</span>
              </div>
              <div className="confirm-row">
                <span className="confirm-label">Subject</span>
                <span>{subject}</span>
              </div>
              {variables.length > 0 && (
                <div className="confirm-row">
                  <span className="confirm-label">Variables</span>
                  <span>
                    {variables.map(v => (
                      <span key={v} style={{ marginRight: 8, fontSize: 12 }}>
                        <code>{`{{${v}}}`}</code> &rarr; {variableMap[v] || <em>default</em>}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {scheduleMode && scheduledAt && (
                <div className="confirm-row">
                  <span className="confirm-label">Scheduled</span>
                  <span>{new Date(scheduledAt).toLocaleString()}</span>
                </div>
              )}
              {!scheduleMode && (
                <div className="confirm-row">
                  <span className="confirm-label">Est. Time</span>
                  <span>~{Math.ceil(recipients.length / 60)} min ({recipients.length}s at 1/sec)</span>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowConfirm(false)}>Cancel</button>
              <button className="btn btn-primary" onClick={handleSend} disabled={sending}>
                {sending ? 'Starting...' : scheduleMode ? `Schedule ${recipients.length} Emails` : `Send ${recipients.length} Emails`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
