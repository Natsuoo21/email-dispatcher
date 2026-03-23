import { useState, useRef, useCallback } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { recipientApi } from '../api';

export default function Recipients({ showToast }) {
  const [rows, setRows] = useState([]);
  const [columns, setColumns] = useState([]);
  const [emailColumn, setEmailColumn] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [search, setSearch] = useState('');
  const [fileName, setFileName] = useState('');
  const [dragging, setDragging] = useState(false);
  const [showSave, setShowSave] = useState(false);
  const [showLoad, setShowLoad] = useState(false);
  const [lists, setLists] = useState([]);
  const [listName, setListName] = useState('');
  const [currentListId, setCurrentListId] = useState(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = useRef(null);

  function findEmailColumn(cols) {
    return cols.find(c => c.toLowerCase() === 'email') || null;
  }

  function processData(data, sourceName) {
    if (!data || data.length === 0) {
      showToast('File is empty or could not be parsed', 'error');
      return;
    }

    const cols = Object.keys(data[0]).filter(c => c.trim() !== '');
    if (cols.length === 0) {
      showToast('No columns found in file', 'error');
      return;
    }

    const emailCol = findEmailColumn(cols);
    if (!emailCol) {
      showToast('CSV/XLSX must have an "email" column', 'error');
      return;
    }

    // Filter out rows with empty email
    const validRows = data.filter(r => r[emailCol] && String(r[emailCol]).trim() !== '');

    setColumns(cols);
    setEmailColumn(emailCol);
    setRows(validRows);
    setSelected(new Set(validRows.map((_, i) => i)));
    setSearch('');
    setFileName(sourceName);
    setCurrentListId(null);
    setListName('');
    showToast(`Loaded ${validRows.length} recipients from ${sourceName}`);
  }

  function parseFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv' || ext === 'tsv' || ext === 'txt') {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => processData(results.data, file.name),
        error: () => showToast('Failed to parse CSV file', 'error'),
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const wb = XLSX.read(e.target.result, { type: 'array' });
          const sheet = wb.Sheets[wb.SheetNames[0]];
          const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          processData(data, file.name);
        } catch {
          showToast('Failed to parse XLSX file', 'error');
        }
      };
      reader.readAsArrayBuffer(file);
    } else {
      showToast('Unsupported file type. Use CSV, TSV, XLSX, or XLS.', 'error');
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (file) parseFile(file);
    e.target.value = '';
  }

  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) parseFile(file);
  }, []);

  function toggleRow(idx) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  }

  function selectAll() { setSelected(new Set(filteredRows.map(r => r._idx))); }
  function deselectAll() { setSelected(new Set()); }

  const filteredRows = rows
    .map((r, i) => ({ ...r, _idx: i }))
    .filter(r => {
      if (!search) return true;
      const q = search.toLowerCase();
      return columns.some(c => String(r[c] ?? '').toLowerCase().includes(q));
    });

  // Save list
  async function handleSave(e) {
    e.preventDefault();
    if (!listName.trim()) return;
    setSaving(true);
    try {
      const selectedRows = rows.filter((_, i) => selected.has(i));
      if (selectedRows.length === 0) {
        showToast('Select at least one recipient to save', 'error');
        setSaving(false);
        return;
      }
      const payload = {
        name: listName.trim(),
        columns: JSON.stringify(columns),
        rows: selectedRows,
      };
      const created = await recipientApi.create(payload);
      setCurrentListId(created.id);
      showToast(`List saved: ${selectedRows.length} recipients`);
      setShowSave(false);
      // List changed
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  // Load lists
  async function openLoadModal() {
    try {
      const data = await recipientApi.list();
      setLists(data);
      setShowLoad(true);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function loadList(list) {
    try {
      const full = await recipientApi.get(list.id);
      const cols = JSON.parse(full.columns);
      const loadedRows = full.rows.map(r => JSON.parse(r.data));

      setColumns(cols);
      setEmailColumn(findEmailColumn(cols));
      setRows(loadedRows);
      setSelected(new Set(loadedRows.map((_, i) => i)));
      setSearch('');
      setFileName('');
      setCurrentListId(full.id);
      setListName(full.name);
      setShowLoad(false);
      showToast(`Loaded list: ${full.name} (${loadedRows.length} recipients)`);
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  async function handleDeleteList(id, name) {
    if (!confirm(`Delete list "${name}"?`)) return;
    try {
      await recipientApi.remove(id);
      setLists(l => l.filter(x => x.id !== id));
      if (currentListId === id) {
        setCurrentListId(null);
        setListName('');
      }
      showToast('List deleted');
      // List changed
    } catch (err) {
      showToast(err.message, 'error');
    }
  }

  return (
    <>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h2>Recipients</h2>
          <p>
            {rows.length > 0
              ? `${selected.size} of ${rows.length} recipients selected${currentListId ? ` — "${listName}"` : fileName ? ` — ${fileName}` : ''}`
              : 'Upload a CSV or XLSX file to manage your recipients'}
          </p>
        </div>
        {rows.length > 0 && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-sm" onClick={openLoadModal}>Load List</button>
            <button className="btn btn-sm btn-primary" onClick={() => {
              if (selected.size === 0) {
                showToast('Select at least one recipient', 'error');
                return;
              }
              setShowSave(true);
            }}>Save List</button>
          </div>
        )}
      </div>

      {/* Upload zone — show when no data or always allow re-upload */}
      {rows.length === 0 ? (
        <div
          className={`dropzone${dragging ? ' dropzone-active' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <div className="dropzone-icon">+</div>
          <h3>Drop your file here</h3>
          <p>CSV, TSV, or XLSX — must contain an "email" column</p>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
            Additional columns (name, company, etc.) can be used as <code style={{ fontSize: 11 }}>{'{{variables}}'}</code> in your template.
          </p>
          <button className="btn btn-primary" style={{ marginTop: 12 }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
            Browse Files
          </button>
          <div style={{ marginTop: 20 }}>
            <button className="btn btn-sm" onClick={(e) => { e.stopPropagation(); openLoadModal(); }}>
              Or Load a Saved List
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Column chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: '26px' }}>Columns:</span>
            {columns.map(c => (
              <span key={c} className={`badge ${c === emailColumn ? 'badge-default' : 'badge-info'}`}>
                {c === emailColumn ? `${c} (email)` : c}
              </span>
            ))}
          </div>

          {/* Toolbar */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn btn-sm" onClick={selectAll}>Select All</button>
            <button className="btn btn-sm" onClick={deselectAll}>Deselect All</button>
            <div style={{ flex: 1 }} />
            <input
              className="form-input"
              placeholder="Search recipients..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ width: 250, padding: '6px 12px', fontSize: 13 }}
            />
            <button className="btn btn-sm" onClick={() => fileInputRef.current?.click()}>
              Upload New File
            </button>
          </div>

          {/* Table */}
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input
                      type="checkbox"
                      checked={filteredRows.length > 0 && filteredRows.every(r => selected.has(r._idx))}
                      onChange={(e) => {
                        if (e.target.checked) selectAll();
                        else deselectAll();
                      }}
                    />
                  </th>
                  <th style={{ width: 50 }}>#</th>
                  {columns.map(c => (
                    <th key={c} style={c === emailColumn ? { color: 'var(--green)' } : {}}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map(r => (
                  <tr key={r._idx} className={selected.has(r._idx) ? 'row-selected' : 'row-dimmed'}>
                    <td>
                      <input
                        type="checkbox"
                        checked={selected.has(r._idx)}
                        onChange={() => toggleRow(r._idx)}
                      />
                    </td>
                    <td style={{ color: 'var(--text-muted)', fontSize: 12 }}>{r._idx + 1}</td>
                    {columns.map(c => (
                      <td key={c}>{String(r[c] ?? '')}</td>
                    ))}
                  </tr>
                ))}
                {filteredRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2} style={{ textAlign: 'center', padding: 20, color: 'var(--text-muted)' }}>
                      {search ? 'No recipients match your search' : 'No recipients'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,.tsv,.txt,.xlsx,.xls"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {/* Save Modal */}
      {showSave && (
        <div className="modal-overlay" onClick={e => e.target === e.currentTarget && setShowSave(false)}>
          <div className="modal">
            <h3>Save Recipient List</h3>
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>List Name</label>
                <input className="form-input" placeholder='e.g., "March Newsletter List"'
                  value={listName} onChange={e => setListName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label>Summary</label>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  {selected.size} of {rows.length} recipients selected — {columns.length} columns
                </div>
              </div>
              <div className="form-group">
                <label>Columns</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {columns.map(c => (
                    <span key={c} className={`badge ${c === emailColumn ? 'badge-default' : 'badge-info'}`}>
                      {c === emailColumn ? `${c} (email)` : c}
                    </span>
                  ))}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn" onClick={() => setShowSave(false)}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saving...' : 'Save List'}
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
            <h3>Load Recipient List</h3>
            {lists.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)' }}>
                No saved lists yet
              </div>
            ) : (
              lists.map(l => (
                <div key={l.id} className="card" style={{ cursor: 'pointer' }} onClick={() => loadList(l)}>
                  <div className="card-header">
                    <div>
                      <div className="card-title">{l.name}</div>
                      <div className="card-subtitle">{l.row_count} recipients — {(() => { try { return JSON.parse(l.columns || '[]').length; } catch { return 0; } })()} columns</div>
                    </div>
                    <button className="btn btn-sm btn-danger" onClick={e => { e.stopPropagation(); handleDeleteList(l.id, l.name); }}>
                      Delete
                    </button>
                  </div>
                  <div className="card-details">
                    {((() => { try { return JSON.parse(l.columns || '[]'); } catch { return []; } })()).map(c => (
                      <code key={c}>{c}</code>
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
