import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';

const MissingWork = () => {
  const [items, setItems] = useState(null);

  useEffect(() => {
    api.get('/missing-work').then(setItems);
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>งานที่ค้างส่ง</h1>
          <p style={{ color: 'var(--text-muted)' }}>งานที่เลยกำหนดส่งแล้ว และรายชื่อนักเรียนที่ยังไม่ส่ง</p>
        </div>
      </div>

      {items === null && <p style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</p>}

      {items && items.length === 0 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          ไม่มีงานค้างส่งในตอนนี้ 🎉
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {items?.map((item) => (
          <div key={item.assignmentId} className="glass-panel" style={{ padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <AlertTriangle size={18} color="var(--danger)" />
              <h3 style={{ fontSize: '1.1rem', margin: 0 }}>{item.title}</h3>
              <span className="badge badge-neutral">{item.className}</span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>กำหนดส่ง {item.dueDate}</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
              {item.missingStudents.map((s) => (
                <span key={s.id} className="badge badge-danger">{s.roll} · {s.name}</span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MissingWork;
