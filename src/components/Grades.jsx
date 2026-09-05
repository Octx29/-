import { useEffect, useState } from 'react';
import { Download, Plus, Save } from 'lucide-react';
import { api } from '../lib/api';
import './Grades.css';

const TERM_LABELS = { pre_midterm: 'ก่อนกลางภาค', midterm: 'กลางภาค', final: 'ปลายภาค' };
const TYPE_LABELS = { homework: 'การบ้าน', quiz: 'ควิซ', in_class: 'งานในชั้นเรียน' };

const NewAssignmentForm = ({ classId, onCreated, onCancel }) => {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('homework');
  const [dueDate, setDueDate] = useState('');
  const [maxScore, setMaxScore] = useState(100);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await api.post('/assignments', { classId, title, type, dueDate: dueDate || null, maxScore });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="glass-panel"
      style={{ padding: '1.25rem', marginBottom: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}
    >
      <div className="form-group" style={{ minWidth: '220px' }}>
        <label>ชื่องาน</label>
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} required
          style={{ padding: '0.6rem 0.75rem', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', width: '100%' }} />
      </div>
      <div className="form-group">
        <label>ประเภท</label>
        <select value={type} onChange={(e) => setType(e.target.value)} style={{ padding: '0.6rem 0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}>
          {Object.entries(TYPE_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>
      </div>
      <div className="form-group">
        <label>กำหนดส่ง</label>
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)}
          style={{ padding: '0.55rem 0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }} />
      </div>
      <div className="form-group">
        <label>คะแนนเต็ม</label>
        <input type="number" value={maxScore} onChange={(e) => setMaxScore(e.target.value)} style={{ width: '80px', padding: '0.55rem 0.75rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }} />
      </div>
      <button type="submit" className="btn btn-primary" disabled={submitting}>{submitting ? 'กำลังสร้าง...' : 'สร้างงาน'}</button>
      <button type="button" className="btn btn-secondary" onClick={onCancel}>ยกเลิก</button>
    </form>
  );
};

const AssignmentGrading = ({ classId }) => {
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState(null);
  const [loadedRoster, setLoadedRoster] = useState({ assignmentId: null, rows: [] });
  const [assignmentRefresh, setAssignmentRefresh] = useState(0);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState('');
  const [rosterError, setRosterError] = useState(null);
  const [saveError, setSaveError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadAssignments = () => setAssignmentRefresh((current) => current + 1);

  useEffect(() => {
    let active = true;
    setListLoading(true);
    setListError('');
    api.get(`/assignments?classId=${classId}`)
      .then((data) => {
        if (!active) return;
        setAssignments(data);
        setAssignmentId((current) => (data.some((a) => a.id === current) ? current : data[0]?.id ?? null));
      })
      .catch((err) => { if (active) setListError(err.message); })
      .finally(() => { if (active) setListLoading(false); });
    return () => { active = false; };
  }, [classId, assignmentRefresh]);

  useEffect(() => {
    let active = true;
    setLoadedRoster({ assignmentId: null, rows: [] });
    setRosterError(null);
    if (!assignmentId) return;
    api.get(`/assignments/${assignmentId}/submissions`)
      .then((data) => {
        if (active) setLoadedRoster({ assignmentId, rows: data.roster });
      })
      .catch((err) => {
        if (active) setRosterError({ assignmentId, message: err.message });
      });
    return () => { active = false; };
  }, [assignmentId]);

  const currentAssignment = assignments.find((a) => a.id === assignmentId);
  // Selection changes render before the new request completes. Never combine
  // the new assignment ID with rows loaded for a different assignment.
  const rosterReady = Boolean(currentAssignment && loadedRoster.assignmentId === assignmentId);
  const roster = rosterReady ? loadedRoster.rows : [];
  const error = listError
    || (rosterError?.assignmentId === assignmentId ? rosterError.message : '')
    || (saveError?.assignmentId === assignmentId ? saveError.message : '');

  const toggleSubmitted = (studentId) => {
    if (!rosterReady) return;
    setLoadedRoster((current) => ({
      ...current,
      rows: current.rows.map((s) => (s.studentId === studentId ? { ...s, submitted: !s.submitted } : s)),
    }));
  };

  const updateScore = (studentId, score) => {
    if (!rosterReady) return;
    setLoadedRoster((current) => ({
      ...current,
      rows: current.rows.map((s) => (s.studentId === studentId ? { ...s, score } : s)),
    }));
  };

  const handleSave = async () => {
    if (!rosterReady || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.post(`/assignments/${assignmentId}/submissions`, {
        records: roster.map((s) => ({ studentId: s.studentId, submitted: s.submitted, score: s.score })),
      });
      loadAssignments();
    } catch (err) {
      setSaveError({ assignmentId, message: err.message });
    } finally {
      setSaving(false);
    }
  };

  const filteredRoster = roster.filter((s) => s.name.includes(searchQuery) || s.roll.includes(searchQuery));

  return (
    <>
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="ค้นหาชื่อ หรือ เลขที่..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          style={{ padding: '0.6rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', outline: 'none', width: '200px' }}
        />
        <button className="btn btn-primary" onClick={() => setShowNewForm((v) => !v)}>
          <Plus size={16} /> สร้างงานใหม่
        </button>
      </div>

      {showNewForm && (
        <NewAssignmentForm
          classId={classId}
          onCreated={() => { setShowNewForm(false); loadAssignments(); }}
          onCancel={() => setShowNewForm(false)}
        />
      )}

      <div className="attendance-controls glass-panel" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem' }}>
        <div className="class-selector">
          <select value={assignmentId ?? ''} onChange={(e) => setAssignmentId(Number(e.target.value))}>
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>
                {a.title} {a.dueDate ? `(กำหนดส่ง ${a.dueDate})` : '(ไม่มีกำหนดส่ง)'} — ส่งแล้ว {a.submittedCount}/{a.totalStudents}
              </option>
            ))}
          </select>
        </div>
        <button className="btn btn-primary" onClick={handleSave} disabled={saving || !rosterReady}>
          <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึกคะแนน'}
        </button>
      </div>

      <div className="glass-panel grades-table-container">
        <table className="grades-table">
          <thead>
            <tr>
              <th>ชื่อนักเรียน</th>
              <th>เลขที่</th>
              <th>สถานะการส่งงาน</th>
              <th>คะแนน {currentAssignment ? `(เต็ม ${currentAssignment.maxScore})` : ''}</th>
            </tr>
          </thead>
          <tbody>
            {filteredRoster.map((student) => {
              const passed = student.submitted && student.score != null && currentAssignment
                ? student.score >= currentAssignment.maxScore / 2
                : null;
              return (
                <tr key={student.studentId}>
                  <td>
                    <div className="student-col">
                      <div style={{ width: '32px', height: '32px', background: 'var(--background)', borderRadius: 'var(--border-radius)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {student.name.charAt(0)}
                      </div>
                      <strong>{student.name}</strong>
                    </div>
                  </td>
                  <td>{student.roll}</td>
                  <td>
                    <span
                      className={`badge ${student.submitted ? 'badge-success' : 'badge-danger'}`}
                      style={{ cursor: 'pointer' }}
                      onClick={() => toggleSubmitted(student.studentId)}
                      title="คลิกเพื่อสลับสถานะ"
                    >
                      {student.submitted ? 'ส่งแล้ว' : 'ยังไม่ส่ง'}
                    </span>
                  </td>
                  <td style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <input
                      type="number"
                      min="0"
                      max={currentAssignment?.maxScore ?? 100}
                      value={student.score ?? ''}
                      disabled={!student.submitted}
                      onChange={(e) => updateScore(student.studentId, e.target.value === '' ? null : Number(e.target.value))}
                      style={{ width: '70px', padding: '0.4rem 0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
                    />
                    {passed !== null && (
                      <span className={`badge ${passed ? 'badge-success' : 'badge-danger'}`}>{passed ? 'ผ่าน' : 'ไม่ผ่าน'}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {roster.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  {listLoading || (assignmentId && !rosterReady && !error)
                    ? 'กำลังโหลด...'
                    : error ? 'ไม่สามารถโหลดข้อมูลได้ กรุณาเลือกงานอีกครั้ง'
                    : assignmentId ? 'ห้องนี้ยังไม่มีรายชื่อนักเรียน'
                    : 'ยังไม่มีงานในห้องนี้ — กด "สร้างงานใหม่" เพื่อเริ่ม'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
};

const TermScores = ({ classId }) => {
  // Exam rows are bound to the classroom they were loaded for. Without this, a
  // classroom switch keeps the previous classroom's rows on screen and Save posts
  // them under the newly selected classId - creating exam scores for the wrong room.
  const [loaded, setLoaded] = useState({ classId: null, rows: [] });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let active = true;
    setLoaded({ classId: null, rows: [] });
    setError('');
    if (!classId) return undefined;
    api.get(`/term-scores?classId=${classId}`)
      .then((data) => { if (active) setLoaded({ classId, rows: data }); })
      .catch((err) => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [classId, reloadToken]);

  const ready = loaded.classId === classId;
  const rows = ready ? loaded.rows : [];

  const updateScore = (studentId, term, score) => {
    if (!ready) return;
    setLoaded((current) => ({
      ...current,
      rows: current.rows.map((r) => (r.studentId === studentId ? { ...r, [term]: { ...(r[term] ?? { maxScore: 100 }), score } } : r)),
    }));
  };

  const handleSave = async () => {
    // Post the identity the rows were loaded under, and refuse entirely while a
    // pending load means the rows on screen belong to another classroom.
    if (!ready) return;
    setSaving(true);
    setError('');
    try {
      const records = [];
      for (const r of loaded.rows) {
        for (const term of Object.keys(TERM_LABELS)) {
          if (r[term]?.score !== undefined && r[term]?.score !== null && r[term]?.score !== '') {
            records.push({ studentId: r.studentId, term, score: r[term].score, maxScore: r[term].maxScore ?? 100 });
          }
        }
      }
      await api.post('/term-scores', { classId: loaded.classId, records });
      setReloadToken((token) => token + 1);
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: '1rem', marginBottom: '1.5rem' }}>
        {error && <span style={{ color: 'var(--danger)' }}>{error}</span>}
        <button className="btn btn-primary" onClick={handleSave} disabled={!ready || saving}>
          <Save size={16} /> {saving ? 'กำลังบันทึก...' : 'บันทึกคะแนนสอบ'}
        </button>
      </div>
      <div className="glass-panel grades-table-container">
        <table className="grades-table">
          <thead>
            <tr>
              <th>ชื่อนักเรียน</th>
              <th>เลขที่</th>
              {Object.entries(TERM_LABELS).map(([term, label]) => (
                <th key={term} style={{ textAlign: 'center' }}>{label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={2 + Object.keys(TERM_LABELS).length} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  {error ? 'ไม่สามารถโหลดคะแนนสอบได้' : ready ? 'ห้องนี้ยังไม่มีรายชื่อนักเรียน' : 'กำลังโหลด...'}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.studentId}>
                <td><strong>{r.name}</strong></td>
                <td>{r.roll}</td>
                {Object.keys(TERM_LABELS).map((term) => (
                  <td key={term} style={{ textAlign: 'center' }}>
                    <input
                      type="number"
                      min="0"
                      max={r[term]?.maxScore ?? 100}
                      value={r[term]?.score ?? ''}
                      onChange={(e) => updateScore(r.studentId, term, e.target.value === '' ? '' : Number(e.target.value))}
                      style={{ width: '70px', padding: '0.4rem 0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', textAlign: 'center' }}
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
};

const Grades = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(null);
  const [view, setView] = useState('assignments'); // assignments | terms

  useEffect(() => {
    api.get('/classes').then((data) => {
      setClasses(data);
      if (data.length > 0) setClassId(data[0].id);
    });
  }, []);

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>ตรวจงานและประเมินผล</h1>
          <p style={{ color: 'var(--text-muted)' }}>ตรวจงานที่ส่ง ให้คะแนน และบันทึกคะแนนสอบประจำภาค</p>
        </div>
        <select value={classId ?? ''} onChange={(e) => setClassId(Number(e.target.value))}
          style={{ padding: '0.6rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', borderBottom: '1px solid var(--border-color)' }}>
        <button
          className="btn"
          style={{ borderRadius: 0, borderBottom: view === 'assignments' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'assignments' ? 'var(--primary-color)' : 'var(--text-muted)' }}
          onClick={() => setView('assignments')}
        >
          งานที่มอบหมาย
        </button>
        <button
          className="btn"
          style={{ borderRadius: 0, borderBottom: view === 'terms' ? '2px solid var(--primary-color)' : '2px solid transparent', color: view === 'terms' ? 'var(--primary-color)' : 'var(--text-muted)' }}
          onClick={() => setView('terms')}
        >
          คะแนนสอบ (ก่อนกลางภาค / กลางภาค / ปลายภาค)
        </button>
      </div>

      {classId && view === 'assignments' && <AssignmentGrading key={classId} classId={classId} />}
      {classId && view === 'terms' && <TermScores classId={classId} />}
    </div>
  );
};

export default Grades;
