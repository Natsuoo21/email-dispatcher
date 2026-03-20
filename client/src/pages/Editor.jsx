import { useState, useRef, useCallback } from 'react';
import MonacoEditor from '@monaco-editor/react';
import { templateApi } from '../api';

const DEFAULT_HTML = `<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; color: #333; }
    h1 { color: #3b82f6; }
    .footer { margin-top: 30px; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <h1>Hello, {{name}}!</h1>
  <p>We're excited to share some news with you from <strong>{{company}}</strong>.</p>
  <p>Click the link below to learn more:</p>
  <a href="{{link}}" style="display:inline-block;padding:12px 24px;background:#3b82f6;color:white;text-decoration:none;border-radius:6px;">Learn More</a>
  <div class="footer">
    <p>You're receiving this because you're a valued member of our community.</p>
  </div>
</body>
</html>`;

function detectVariables(html) {
  const matches = html.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.slice(2, -2)))];
}

export default function Editor({ showToast, onTemplateChange }) {
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [subject, setSubject] = useState('');
  const [variables, setVariables] = useState(() => detectVariables(DEFAULT_HTML));
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [templateName, setTemplateName] = useState('');
  const [currentTemplateId, setCurrentTemplateId] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  const handleEditorChange = useCallback((value) => {
    setHtml(value || '');
    setVariables(detectVariables(value || ''));
  }, []);

  function handleImport() {
    fileInputRef.current?.click();
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const content = ev.target.result;
      setHtml(content);
      setVariables(detectVariables(content));
      showToast(`Imported: ${file.name}`);
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  async function handleSave(e) {
    e.preventDefault();
    if (!templateName.trim()) return;
    setSaving(true);
    try {
      if (currentTemplateId) {
        await templateApi.update(currentTemplateId, {
          name: templateName,
          subject,
          html_content: html,
        });
        showToast('Template updated');
      } else {
        const created = await templateApi.create({
          name: templateName,
          subject,
          html_content: html,
        });
        setCurrentTemplateId(created.id);
        showToast('Template saved');
      }
      setShowSave(false);
      if (onTemplateChange) onTemplateChange();
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  async function openLoadModal() {
    try {
      const data = await templateApi.list();
      setTemplates(data);
      setShowLoad(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  function loadTemplate(tpl) {
    setHtml(tpl.html_content);
    setSubject(tpl.subject);
    setTemplateName(tpl.name);
    setCurrentTemplateId(tpl.id);
    setVariables(detectVariables(tpl.html_content));
    setShowLoad(false);
    showToast(`Loaded: ${tpl.name}`);
  }

  async function handleDeleteTemplate(id, name) {
    if (!confirm(`Delete template "${name}"?`)) return;
    try {
      await templateApi.remove(id);
      setTemplates(t => t.filter(x => x.id !== id));
      if (currentTemplateId === id) {
        setCurrentTemplateId(null);
        setTemplateName('');
      }
      showToast('Template deleted');
      if (onTemplateChange) onTemplateChange();
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>HTML Editor</h2>
          <p>Create and preview your email template{currentTemplateId ? ` — editing "${templateName}"` : ''}</p>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-sm" onClick={handleImport}>Import HTML</button>
          <button className="btn btn-sm" onClick={openLoadModal}>Load Template</button>
          <button className="btn btn-sm btn-primary" onClick={() => {
            if (!subject) {
              showToast('Please set a subject line before saving', 'error');
              return;
            }
            setShowSave(true);
          }}>Save Template</button>
        </div>
      </div>

      {/* Subject line */}
      <div className="form-group" style={{ marginBottom: 16 }}>
        <label>Subject Line</label>
        <input
          className="form-input"
          placeholder='e.g., "News from {{company}} in March"'
          title="Use {{variableName}} to insert personalized data per recipient"
          value={subject}
          onChange={e => setSubject(e.target.value)}
        />
        <div className="form-hint">
          Use <code>{'{{variableName}}'}</code> to insert personalized data. Variables must match your CSV/XLSX column names.
        </div>
        {subject && detectVariables(subject).length > 0 && (
          <div className="form-hint">
            Variables in subject: {detectVariables(subject).map(v => (
              <code key={v} style={{ marginLeft: 4 }}>{`{{${v}}}`}</code>
            ))}
          </div>
        )}
      </div>

      {/* Variable chips */}
      {variables.length > 0 && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: '26px' }}>Detected variables:</span>
          {variables.map(v => (
            <span key={v} className="badge badge-info">{`{{${v}}}`}</span>
          ))}
        </div>
      )}

      {/* Split pane: Editor + Preview */}
      <div className="editor-split" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, height: 'calc(100vh - 300px)', minHeight: 400 }}>
        {/* Monaco Editor */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)' }}>
            HTML Editor
          </div>
          <MonacoEditor
            height="100%"
            language="html"
            theme="vs-dark"
            value={html}
            onChange={handleEditorChange}
            options={{
              minimap: { enabled: false },
              fontSize: 13,
              wordWrap: 'on',
              lineNumbers: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
            }}
          />
        </div>

        {/* Live Preview */}
        <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '8px 12px', background: 'var(--bg-secondary)', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
            <span>Live Preview</span>
            <span>600px viewport</span>
          </div>
          <div style={{ flex: 1, display: 'flex', justifyContent: 'center', background: '#f8fafc', padding: 16, overflow: 'auto' }}>
            <iframe
              srcDoc={html}
              title="Email Preview"
              style={{ width: 600, maxWidth: '100%', height: '100%', border: 'none', background: 'white', borderRadius: 4, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}
              sandbox=""
            />
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".html,.htm"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Save Modal */}
      {showSave && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSave(false)}>
          <div className="modal">
            <h3>{currentTemplateId ? 'Update Template' : 'Save Template'}</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Template Name</label>
                <input className="form-input" placeholder='e.g., "March Newsletter"'
                  value={templateName} onChange={e => setTemplateName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Subject Line</label>
                <input className="form-input" value={subject} readOnly style={{ opacity: 0.7 }} />
                <div className="form-hint">Set the subject above the editor</div>
              </div>
              <div className="form-group">
                <label>Variables Detected</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {variables.length > 0
                    ? variables.map(v => <span key={v} className="badge badge-info">{`{{${v}}}`}</span>)
                    : <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>No variables found</span>
                  }
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowSave(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : currentTemplateId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Load Modal */}
      {showLoad && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowLoad(false)}>
          <div className="modal">
            <h3>Load Template</h3>
            {templates.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                No saved templates yet
              </div>
            ) : (
              templates.map(tpl => (
                <div key={tpl.id} className="card" style={{ cursor: 'pointer' }} onClick={() => loadTemplate(tpl)}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{tpl.name}</div>
                      <div className="card-subtitle">{tpl.subject}</div>
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); handleDeleteTemplate(tpl.id, tpl.name); }}>
                      Delete
                    </button>
                  </div>
                  <div className="card-details">
                    {JSON.parse(tpl.variables).map(v => (
                      <code key={v}>{`{{${v}}}`}</code>
                    ))}
                  </div>
                </div>
              ))
            )}
            <div className="modal-actions">
              <button className="btn" onClick={() => setShowLoad(false)}>Close</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
