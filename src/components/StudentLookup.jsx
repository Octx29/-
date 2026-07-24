import { useState } from 'react';
import { Search, BookOpen, AlertCircle, CheckCircle2, Calendar } from 'lucide-react';

const TERM_LABELS = { pre_midterm: 'ก่อนกลางภาค', midterm: 'กลางภาค', final: 'ปลายภาค' };
const STATUS_LABELS = { present: 'มา', absent: 'ขาด', late: 'สาย' };

const StudentLookup = () => {
  const [studentId, setStudentId] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setData(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/lookup/${encodeURIComponent(studentId.trim())}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || 'ไม่พบข้อมูล');
      }
      setData(await res.json());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-container" style={{ background: 'var(--background)', minHeight: '100vh' }}>
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '2rem', width: '100%' }}>
        <header style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 style={{ fontSize: '1.6rem', marginBottom: '0.25rem' }}>ตรวจสอบข้อมูลนักเรียน</h1>
          <p style={{ color: 'var(--text-muted)' }}>สำหรับนักเรียนและผู้ปกครอง — กรอกรหัสนักเรียน 5 หลัก</p>
        </header>

        <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]{5}"
            maxLength={5}
            placeholder="เช่น 10101"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            required
            style={{ flex: 1, padding: '0.75rem 1rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', fontSize: '1rem' }}
          />
          <button type="submit" className="btn btn-primary" disabled={loading}>
            <Search size={18} /> {loading ? 'กำลังค้นหา...' : 'ค้นหา'}
          </button>
        </form>

        {error && (
          <div className="glass-panel" style={{ padding: '1.25rem', color: 'var(--danger)', textAlign: 'center', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        {data && (
          <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h2 style={{ fontSize: '1.3rem', marginBottom: '0.25rem' }}>{data.student.name}</h2>
              <p style={{ color: 'var(--text-muted)', margin: 0 }}>
                รหัส {data.student.roll} · {data.student.className} · {data.student.subject}
              </p>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <Calendar size={20} color="var(--primary-color)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>การเข้าเรียน</h3>
              </div>
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: data.attendance.recent.length ? '1rem' : 0 }}>
                <span className="badge badge-success">มา {data.attendance.counts.present ?? 0}</span>
                <span className="badge badge-danger">ขาด {data.attendance.counts.absent ?? 0}</span>
                <span className="badge badge-warning">สาย {data.attendance.counts.late ?? 0}</span>
              </div>
              {data.attendance.recent.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                  {data.attendance.recent.slice(0, 10).map((r) => (
                    <span key={r.date} className="badge badge-neutral">{r.date} · {STATUS_LABELS[r.status] ?? r.status}</span>
                  ))}
                </div>
              )}
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                <BookOpen size={20} color="var(--primary-color)" />
                <h3 style={{ margin: 0, fontSize: '1.1rem' }}>งานและการบ้าน</h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {data.assignments.map((a) => (
                  <div key={a.title} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: 600 }}>{a.title}</p>
                      {a.dueDate && <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>กำหนดส่ง {a.dueDate}</p>}
                    </div>
                    {a.submitted ? (
                      <span className="badge badge-success">
                        <CheckCircle2 size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                        ส่งแล้ว{a.score != null ? ` · ${a.score}/${a.maxScore}` : ''}
                      </span>
                    ) : (
                      <span className="badge badge-danger">
                        <AlertCircle size={14} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                        ยังไม่ส่ง
                      </span>
                    )}
                  </div>
                ))}
                {data.assignments.length === 0 && <p style={{ color: 'var(--text-muted)', margin: 0 }}>ยังไม่มีงานที่มอบหมาย</p>}
              </div>
            </div>

            <div className="glass-panel" style={{ padding: '1.5rem' }}>
              <h3 style={{ margin: '0 0 1rem 0', fontSize: '1.1rem' }}>คะแนนสอบ</h3>
              <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                {Object.entries(TERM_LABELS).map(([term, label]) => (
                  <div key={term}>
                    <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>{label}</p>
                    <p style={{ margin: 0, fontSize: '1.2rem', fontWeight: 600 }}>
                      {data.termScores[term] ? `${data.termScores[term].score}/${data.termScores[term].maxScore}` : '—'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default StudentLookup;
