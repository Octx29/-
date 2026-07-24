import { Users, BookOpen, Calendar, ChevronRight, UserCheck } from 'lucide-react';
import './Dashboard.css';

const Dashboard = ({ teacher, setActiveTab }) => {
  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1>ยินดีต้อนรับ, {teacher?.name ?? ''}</h1>
          <p style={{ color: 'var(--text-muted)' }}>นี่คือภาพรวมของห้องเรียนที่คุณดูแลในวันนี้</p>
        </div>
        <div className="date-pill">
          <Calendar size={18} />
          {new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' })}
        </div>
      </div>

      <div className="stats-grid">
        <div className="glass-panel stat-card">
          <div className="stat-icon blue">
            <Users size={24} />
          </div>
          <div className="stat-info">
            <h3>142</h3>
            <p>จำนวนนักเรียนทั้งหมด</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon green">
            <UserCheck size={24} />
          </div>
          <div className="stat-info">
            <h3>95%</h3>
            <p>สถิติการเข้าเรียนวันนี้</p>
          </div>
        </div>
        <div className="glass-panel stat-card">
          <div className="stat-icon purple">
            <BookOpen size={24} />
          </div>
          <div className="stat-info">
            <h3>12</h3>
            <p>งานที่รอตรวจ</p>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        <div>
          <h2 style={{ marginBottom: '1.25rem', fontSize: '1.25rem' }}>เมนูลัด (Quick Actions)</h2>
          <div className="quick-actions" style={{ gridTemplateColumns: '1fr', gap: '1rem' }}>
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

        <div>
          <h2 style={{ marginBottom: '1.25rem', fontSize: '1.25rem' }}>แจ้งเตือน (To-Do List)</h2>
          <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            
            <div style={{ paddingBottom: '1rem', borderBottom: '1px solid var(--border-color)' }}>
              <div style={{ display: 'flex', gap: '0.5rem', color: '#b91c1c', fontWeight: 500, marginBottom: '0.5rem' }}>
                <Users size={18} /> ลืมเช็คชื่อ!
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                คุณยังไม่ได้เช็คชื่อห้อง <strong>ม. 3/2</strong> (คาบเรียน 10:20 น.)
              </p>
              <button className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.4rem' }} onClick={() => setActiveTab('attendance')}>
                เช็คชื่อตอนนี้
              </button>
            </div>

            <div>
              <div style={{ display: 'flex', gap: '0.5rem', color: '#d97706', fontWeight: 500, marginBottom: '0.5rem' }}>
                <BookOpen size={18} /> งานรอตรวจ
              </div>
              <p style={{ fontSize: '0.9rem', color: 'var(--text-main)', marginBottom: '0.75rem' }}>
                มีงาน "แบบฝึกหัดพีชคณิต" ของ <strong>ม. 1/2</strong> รอตรวจอยู่ 12 ชิ้น
              </p>
              <button className="btn btn-secondary" style={{ width: '100%', fontSize: '0.85rem', padding: '0.4rem' }} onClick={() => setActiveTab('grades')}>
                ไปตรวจงาน
              </button>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
