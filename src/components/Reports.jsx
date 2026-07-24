import { useEffect, useState } from 'react';
import { FileSpreadsheet, Download, Wand2 } from 'lucide-react';
import { api } from '../lib/api';

const FIELD_OPTIONS = [
  { id: 'studentId', label: 'เลขประจำตัวนักเรียน' },
  { id: 'prefix', label: 'คำนำหน้า' },
  { id: 'name', label: 'ชื่อ-นามสกุล' },
  { id: 'pieces', label: 'ชิ้นงาน 1-10' },
  { id: 'preMidterm', label: 'คะแนนก่อนกลางภาค' },
  { id: 'midterm', label: 'คะแนนสอบกลางภาค' },
  { id: 'final', label: 'คะแนนสอบปลายภาค' },
];

// Small keyword-matching "AI" - not a real model call, just deterministic Thai keyword
// detection so teachers can type a description and get a starting column selection
// instead of hunting through checkboxes cold. The checkboxes remain the source of truth.
function parseFieldsFromText(text) {
  let remaining = text;
  const selected = { studentId: false, prefix: false, name: false, pieces: false, preMidterm: false, midterm: false, final: false };

  if (remaining.includes('เลขประจำตัว') || remaining.includes('รหัสนักเรียน') || remaining.includes('เลขที่')) selected.studentId = true;
  if (remaining.includes('คำนำหน้า')) selected.prefix = true;
  if (remaining.includes('ชื่อ') || remaining.includes('นามสกุล')) selected.name = true;
  if (remaining.includes('ชิ้นงาน') || remaining.includes('งานที่')) selected.pieces = true;
  if (remaining.includes('ก่อนกลางภาค')) {
    selected.preMidterm = true;
    remaining = remaining.replaceAll('ก่อนกลางภาค', '');
  }
  if (remaining.includes('กลางภาค')) selected.midterm = true;
  if (remaining.includes('ปลายภาค')) selected.final = true;

  return selected;
}

const CustomReportBuilder = ({ classes }) => {
  const [classId, setClassId] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState({});
  const [filename, setFilename] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState('');

  const toggleField = (id) => setSelected((s) => ({ ...s, [id]: !s[id] }));

  const handleGenerate = async () => {
    setError('');
    if (!classId) {
      setError('กรุณาเลือกห้องเรียน');
      return;
    }
    const chosen = Object.entries(selected).filter(([, v]) => v).map(([k]) => k);
    if (chosen.length === 0) {
      setError('กรุณาเลือกอย่างน้อยหนึ่งคอลัมน์');
      return;
    }
    const fields = chosen.flatMap((id) => (id === 'pieces' ? Array.from({ length: 10 }, (_, i) => `piece${i + 1}`) : [id]));

    setDownloading(true);
    try {
      const name = filename.trim() || 'รายงานกำหนดเอง';
      await api.download(
        `/reports/custom.xlsx?classId=${classId}&fields=${fields.join(',')}&filename=${encodeURIComponent(name)}`,
        `${name}.xlsx`
      );
    } catch (err) {
      setError(err.message);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', maxWidth: '640px' }}>
      <h3 style={{ marginTop: 0 }}>สร้างรายงานแบบกำหนดเอง</h3>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '-0.5rem' }}>
        พิมพ์อธิบายว่าต้องการคอลัมน์อะไรบ้าง ระบบจะเลือกให้อัตโนมัติ แล้วปรับแก้รายการด้านล่างก่อนสร้างไฟล์ได้
      </p>

      <div style={{ marginBottom: '1rem' }}>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>ห้องเรียน</label>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
        >
          <option value="">เลือกห้องเรียน</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: '0.75rem' }}>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>
          อธิบายรายงานที่ต้องการ เช่น "อยากได้คะแนนชิ้นงานทุกชิ้นกับคะแนนสอบกลางภาค"
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)', fontFamily: 'inherit', resize: 'vertical' }}
        />
      </div>
      <button className="btn btn-secondary" onClick={() => setSelected(parseFieldsFromText(description))} disabled={!description.trim()}>
        <Wand2 size={16} /> แปลงข้อความเป็นคอลัมน์
      </button>

      <div style={{ marginTop: '1.25rem' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>คอลัมน์ที่จะรวมในรายงาน (แก้ไขได้)</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: '0.5rem' }}>
          {FIELD_OPTIONS.map((f) => (
            <label key={f.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', cursor: 'pointer', fontSize: '0.9rem' }}>
              <input type="checkbox" checked={!!selected[f.id]} onChange={() => toggleField(f.id)} />
              {f.label}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginTop: '1.25rem' }}>
        <label style={{ display: 'block', marginBottom: '0.4rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>ชื่อไฟล์</label>
        <input
          type="text"
          value={filename}
          onChange={(e) => setFilename(e.target.value)}
          placeholder="เช่น คะแนน ม.1-2"
          style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
        />
      </div>

      {error && <p style={{ color: 'var(--danger)', fontSize: '0.9rem', marginTop: '0.75rem' }}>{error}</p>}

      <button className="btn btn-primary" onClick={handleGenerate} disabled={downloading} style={{ marginTop: '1.25rem' }}>
        <Download size={16} /> {downloading ? 'กำลังสร้าง...' : 'สร้างและดาวน์โหลด'}
      </button>
    </div>
  );
};

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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '520px', marginBottom: '2rem' }}>
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

      <CustomReportBuilder classes={classes} />
    </div>
  );
};

export default Reports;
