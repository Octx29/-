import { useEffect, useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { api } from '../lib/api';

const Reports = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [downloading, setDownloading] = useState(null);

  useEffect(() => {
    api.get('/classes').then(setClasses);
  }, []);

  const handleDownload = async (kind) => {
    setDownloading(kind);
    try {
      const query = classId ? `?classId=${classId}` : '';
      await api.download(`/reports/${kind}.xlsx${query}`, `${kind}.xlsx`);
    } finally {
      setDownloading(null);
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>รายงาน</h1>
          <p style={{ color: 'var(--text-muted)' }}>ดาวน์โหลดรายงานเป็นไฟล์ Excel เพื่อพิมพ์หรือเก็บไว้เป็นหลักฐาน</p>
        </div>
      </div>

      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1.5rem', maxWidth: '320px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          ห้องเรียน (เว้นว่างเพื่อรวมทุกห้อง)
        </label>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
        >
          <option value="">ทุกห้องเรียน</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>
          ))}
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px' }}>
        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <FileSpreadsheet size={22} color="var(--primary-color)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>รายงานงานค้างส่ง</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Missing Work Report</p>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => handleDownload('missing-work')} disabled={downloading === 'missing-work'}>
            <Download size={16} /> {downloading === 'missing-work' ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด'}
          </button>
        </div>

        <div className="glass-panel" style={{ padding: '1.25rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <FileSpreadsheet size={22} color="var(--primary-color)" />
            <div>
              <h3 style={{ margin: 0, fontSize: '1.05rem' }}>รายงานสรุปคะแนน</h3>
              <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Score Summary Report</p>
            </div>
          </div>
          <button className="btn btn-secondary" onClick={() => handleDownload('score-summary')} disabled={downloading === 'score-summary'}>
            <Download size={16} /> {downloading === 'score-summary' ? 'กำลังดาวน์โหลด...' : 'ดาวน์โหลด'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Reports;
