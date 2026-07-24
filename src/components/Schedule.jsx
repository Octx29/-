import { useEffect, useState } from 'react';
import { Clock, Users, BookOpen } from 'lucide-react';
import { api } from '../lib/api';
import './Dashboard.css'; // Reusing some clean card styles

const DAY_LABELS = ['วันอาทิตย์', 'วันจันทร์', 'วันอังคาร', 'วันพุธ', 'วันพฤหัสบดี', 'วันศุกร์', 'วันเสาร์'];

const groupByDay = (slots) => {
  const byDay = new Map();
  for (const slot of slots) {
    if (!byDay.has(slot.dayOfWeek)) byDay.set(slot.dayOfWeek, []);
    byDay.get(slot.dayOfWeek).push(slot);
  }
  return [...byDay.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([dayOfWeek, classes]) => ({ day: DAY_LABELS[dayOfWeek] ?? `วัน (${dayOfWeek})`, classes }));
};

const Schedule = ({ setActiveTab }) => {
  const [slots, setSlots] = useState(null);

  useEffect(() => {
    api.get('/schedule').then(setSlots);
  }, []);

  const scheduleByDay = slots ? groupByDay(slots) : [];

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>ตารางสอนและชั้นเรียน</h1>
          <p style={{ color: 'var(--text-muted)' }}>จัดการห้องเรียนแต่ละห้องตามตารางสอนประจำสัปดาห์ของคุณ</p>
        </div>
      </div>

      {slots === null && <p style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</p>}

      {slots && scheduleByDay.length === 0 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
          ยังไม่มีตารางสอน
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
        {scheduleByDay.map((daySchedule, index) => (
          <div key={index}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', color: 'var(--text-main)', borderBottom: '2px solid var(--border-color)', paddingBottom: '0.5rem' }}>
              {daySchedule.day}
            </h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
              {daySchedule.classes.map(cls => (
                <div key={cls.id} className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem', transition: 'border-color 0.2s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <h3 style={{ fontSize: '1.2rem', margin: 0, color: 'var(--primary-color)' }}>{cls.className}</h3>
                      <p style={{ margin: 0, fontSize: '0.9rem', color: 'var(--text-muted)' }}>{cls.subject}</p>
                    </div>
                    <span className="badge badge-neutral" style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      <Clock size={12} /> {cls.startTime} - {cls.endTime}
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem', marginTop: 'auto' }}>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                      onClick={() => setActiveTab('attendance')}
                    >
                      <Users size={14} /> เช็คชื่อ
                    </button>
                    <button
                      className="btn btn-secondary"
                      style={{ flex: 1, padding: '0.5rem', fontSize: '0.85rem' }}
                      onClick={() => setActiveTab('grades')}
                    >
                      <BookOpen size={14} /> ตรวจงาน
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Schedule;
