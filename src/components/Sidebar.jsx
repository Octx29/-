import { LayoutDashboard, Users, CheckSquare, GraduationCap, AlertTriangle, FileSpreadsheet, QrCode } from 'lucide-react';
import './Sidebar.css';

const Sidebar = ({ activeTab, setActiveTab, teacher, onLogout }) => {
  const navItems = [
    { id: 'dashboard', label: 'หน้าหลัก', icon: LayoutDashboard },
    { id: 'schedule', label: 'ตารางสอนและชั้นเรียน', icon: GraduationCap },
    { id: 'attendance', label: 'เช็คชื่อเข้าเรียน', icon: Users },
    { id: 'scanner', label: 'QR & สแกน', icon: QrCode },
    { id: 'grades', label: 'ตรวจงานและประเมินผล', icon: CheckSquare },
    { id: 'missing-work', label: 'งานที่ค้างส่ง', icon: AlertTriangle },
    { id: 'reports', label: 'รายงาน', icon: FileSpreadsheet },
  ];

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-icon">
          <GraduationCap size={24} />
        </div>
        <span>ระบบจัดการสำหรับครู</span>
      </div>

      <nav className="nav-links">
        {navItems.map((item) => (
          <div
            key={item.id}
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => setActiveTab(item.id)}
          >
            <item.icon size={18} />
            <span>{item.label}</span>
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="teacher-profile" style={{ marginBottom: '1rem' }}>
          <div className="avatar">{teacher?.name?.charAt(0) ?? '?'}</div>
          <div className="teacher-info">
            <h4>{teacher?.name ?? 'ไม่ทราบชื่อ'}</h4>
            <p>ครูประจำวิชา{teacher?.subject ?? ''}</p>
          </div>
        </div>
        <div
          className="nav-item"
          style={{ color: 'var(--danger)' }}
          onClick={onLogout}
        >
          <span>ออกจากระบบ</span>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
