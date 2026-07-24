import { useState } from 'react';
import { Link } from 'react-router-dom';
import { LogIn, User } from 'lucide-react';
import { api } from '../lib/api';
import './Login.css';

const Login = ({ onLogin }) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const teacher = await api.post('/auth/login', { username, password });
      onLogin(teacher);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="login-container animate-fade-in">
      <div className="login-card">
        <div className="login-header">
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--primary-color)' }}>
            <User size={48} />
          </div>
          <h2>ระบบจัดการสำหรับครู</h2>
          <p>กรุณาเข้าสู่ระบบเพื่อจัดการชั้นเรียนและตรวจงาน</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label>ชื่อผู้ใช้ (Username)</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="เช่น teacher_somchai"
              required
            />
          </div>
          <div className="form-group">
            <label>รหัสผ่าน (Password)</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              required
            />
          </div>

          {error && <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0 }}>{error}</p>}

          <button type="submit" className="btn btn-primary login-btn" disabled={submitting}>
            <LogIn size={18} /> {submitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
          </button>
        </form>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.9rem' }}>
          เป็นนักเรียนหรือผู้ปกครอง?{' '}
          <Link to="/lookup" style={{ color: 'var(--primary-color)', fontWeight: 600 }}>
            ตรวจสอบข้อมูลนักเรียนที่นี่
          </Link>
        </p>
      </div>
    </div>
  );
};

export default Login;
