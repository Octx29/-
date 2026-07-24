import { useEffect, useState } from 'react';
import { Users, BookOpen, Calendar, ChevronRight, UserCheck } from 'lucide-react';
import { api } from '../lib/api';
import './Dashboard.css';

const Dashboard = ({ teacher, setActiveTab }) => {
  const [classStats, setClassStats] = useState(null);

  useEffect(() => {
    api.get('/dashboard').then(setClassStats);
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1>ยินดีต้อนรับ, {teacher?.name ?? ''}</h1>
          <p style={{ color: 'var(--text-muted)' }}>ภาพรวมแยกตามห้องเรียนที่คุณดูแล</p>
        </div>
        <div className="date-pill">
          <Calendar size={18} />
          {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      {classStats === null && <p style={{ color: 'var(--text-muted)' }}>กำลังโหลด...</p>}

      {classStats && classStats.length === 0 && (
        <div className="glass-panel" style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', marginBottom: '2.5rem' }}>
          ยังไม่มีห้องเรียนที่คุณดูแล
        </div>
      )}

      {classStats && classStats.length > 0 && (
        <div className="class-dashboard-grid">
          {classStats.map((c) => (
            <div key={c.id} className="glass-panel class-dashboard-card" onClick={() => setActiveTab('attendance')}>
              <div className="class-dashboard-card-header">
                <h3>{c.name}</h3>
                <span className="badge badge-neutral">{c.subject}</span>
              </div>
              <div className="class-dashboard-stats">
                <div className="class-dashboard-stat">
                  <Users size={18} />
                  <span>{c.studentCount} คน</span>
                </div>
                <div className="class-dashboard-stat">
                  <UserCheck size={18} />
                  <span>{c.attendanceRate}% เข้าเรียนวันนี้</span>
                </div>
                <div className="class-dashboard-stat">
                  <BookOpen size={18} />
                  <span>{c.pendingGradingCount} งานรอตรวจ</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div>
        <h2 style={{ marginBottom: '1.25rem', fontSize: '1.25rem' }}>เมนูลัด (Quick Actions)</h2>
        <div className="quick-actions">
          <div className="glass-panel action-card" onClick={() => setActiveTab('attendance')}>
            <div className="action-icon">
              <Users size={20} />
            </div>
            <div>
              <h3>เช็คชื่อเข้าเรียน</h3>
              <p>จัดการการเข้าเรียน ระบุสถานะ มา ขาด หรือสาย ได้อย่างรวดเร็ว</p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', color: 'var(--primary-color)', fontWeight: 500, gap: '0.25rem', fontSize: '0.9rem' }}>
              ไปที่หน้าเช็คชื่อ <ChevronRight size={16} />
            </div>
          </div>

          <div className="glass-panel action-card" onClick={() => setActiveTab('grades')}>
            <div className="action-icon">
              <BookOpen size={20} />
            </div>
            <div>
              <h3>ตรวจงานและประเมินผล</h3>
              <p>ตรวจสอบงานที่ส่งและอัปเดตสถานะการผ่านเกณฑ์ประเมิน</p>
            </div>
            <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'center', color: 'var(--primary-color)', fontWeight: 500, gap: '0.25rem', fontSize: '0.9rem' }}>
              ไปที่หน้าตรวจงาน <ChevronRight size={16} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
