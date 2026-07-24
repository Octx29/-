import { useEffect, useState } from 'react';
import { Save, Check, X, Clock, AlertCircle, Users } from 'lucide-react';
import { api } from '../lib/api';
import './Attendance.css';

const todayIso = () => new Date().toISOString().slice(0, 10);

const Attendance = () => {
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [date] = useState(todayIso());
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/classes')
      .then((data) => {
        setClasses(data);
        if (data.length > 0) setSelectedClassId(data[0].id);
      })
      .catch((err) => setError(err.message));
  }, []);

  useEffect(() => {
    if (!selectedClassId) return;
    setLoading(true);
    api
      .get(`/attendance?classId=${selectedClassId}&date=${date}`)
      .then(setStudents)
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [selectedClassId, date]);

  const updateStatus = (id, newStatus) => {
    setStudents(students.map((s) => (s.id === id ? { ...s, status: newStatus } : s)));
  };

  const markAllPresent = () => {
    setStudents(students.map((s) => (!s.status ? { ...s, status: 'present' } : s)));
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await api.post('/attendance', {
        classId: selectedClassId,
        date,
        records: students.map((s) => ({ id: s.id, status: s.status })),
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const selectedClass = classes.find((c) => c.id === selectedClassId);
  const absentCount = students.filter((s) => s.status === 'absent').length;
  const presentCount = students.filter((s) => s.status === 'present').length;
  const lateCount = students.filter((s) => s.status === 'late').length;

  return (
    <div className="animate-fade-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>เช็คชื่อเข้าเรียน</h1>
          <p style={{ color: 'var(--text-muted)' }}>วันที่: {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button className="btn btn-secondary" onClick={markAllPresent} disabled={loading}>
            <Check size={16} />
            เช็ค "มาเรียน" ทั้งหมด (คนที่เหลือ)
          </button>
          <button className="btn btn-primary" onClick={handleSave} disabled={loading || saving}>
            <Save size={16} />
            {saving ? 'กำลังบันทึก...' : 'บันทึก'}
          </button>
        </div>
      </div>

      {error && (
        <div className="attendance-summary-banner" style={{ marginBottom: '1rem' }}>
          <AlertCircle size={20} />
          {error}
        </div>
      )}

      <div className="attendance-controls glass-panel">
        <div className="class-selector">
          <select value={selectedClassId ?? ''} onChange={(e) => setSelectedClassId(Number(e.target.value))}>
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} - {c.subject}
              </option>
            ))}
          </select>
        </div>
        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <span className="badge badge-success">มา: {presentCount}</span>
          <span className="badge badge-danger">ขาด: {absentCount}</span>
          <span className="badge badge-warning">สาย: {lateCount}</span>
        </div>
      </div>

      {absentCount > 0 ? (
        <div className="attendance-summary-banner">
          <AlertCircle size={24} />
          สรุป: วันนี้ห้อง {selectedClass?.name} มีนักเรียนขาดเรียนจำนวน {absentCount} คน
        </div>
      ) : (
        <div className="attendance-summary-banner good">
          <Users size={24} />
          สรุป: วันนี้ห้อง {selectedClass?.name} ไม่มีนักเรียนขาดเรียน (หรือยังไม่ได้เช็คขาด)
        </div>
      )}

      <div className="glass-panel attendance-table-container">
        <table className="attendance-table">
          <thead>
            <tr>
              <th style={{ width: '80px', textAlign: 'center' }}>เลขที่</th>
              <th>ชื่อนักเรียน</th>
              <th>สถานะปัจจุบัน</th>
              <th>ดำเนินการเช็คชื่อ</th>
            </tr>
          </thead>
          <tbody>
            {students.map((student) => (
              <tr key={student.id} className={student.status === 'absent' ? 'absent-row' : ''}>
                <td style={{ textAlign: 'center', fontWeight: '500' }}>{student.roll}</td>
                <td>
                  <div className="student-col">
                    <div style={{ width: '32px', height: '32px', background: 'var(--background)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {student.name.charAt(0)}
                    </div>
                    <span>{student.name}</span>
                  </div>
                </td>
                <td>
                  {student.status === 'present' && <span className="badge badge-success">มาเรียน</span>}
                  {student.status === 'absent' && <span className="badge badge-danger">ขาดเรียน</span>}
                  {student.status === 'late' && <span className="badge badge-warning">มาสาย</span>}
                  {!student.status && <span className="badge badge-neutral">-</span>}
                </td>
                <td>
                  <div className="attendance-actions">
                    <button
                      className={`status-btn ${student.status === 'present' ? 'present' : ''}`}
                      onClick={() => updateStatus(student.id, 'present')}
                    >
                      <Check size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> มา
                    </button>
                    <button
                      className={`status-btn ${student.status === 'absent' ? 'absent' : ''}`}
                      onClick={() => updateStatus(student.id, 'absent')}
                    >
                      <X size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> ขาด
                    </button>
                    <button
                      className={`status-btn ${student.status === 'late' ? 'late' : ''}`}
                      onClick={() => updateStatus(student.id, 'late')}
                    >
                      <Clock size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'text-bottom' }} /> สาย
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!loading && students.length === 0 && (
              <tr>
                <td colSpan={4} style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                  ห้องนี้ยังไม่มีรายชื่อนักเรียน
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default Attendance;
