import { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { Camera, Printer } from 'lucide-react';
import { api } from '../lib/api';

const MODE_LABELS = { attendance: 'เช็คชื่อเข้าเรียน', submission: 'ตรวจงานส่ง', materials: 'ตรวจอุปกรณ์การเรียน' };

const QRRoster = ({ classId }) => {
  const [students, setStudents] = useState([]);
  const [qrDataUrls, setQrDataUrls] = useState({});

  useEffect(() => {
    if (!classId) return;
    let cancelled = false;
    api.get(`/classes/${classId}/students`).then(async (list) => {
      if (cancelled) return;
      setStudents(list);
      const urls = {};
      for (const s of list) {
        urls[s.id] = await QRCode.toDataURL(s.roll, { width: 160, margin: 1 });
      }
      if (!cancelled) setQrDataUrls(urls);
    });
    return () => { cancelled = true; };
  }, [classId]);

  return (
    <div>
      <div className="no-print" style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button className="btn btn-secondary" onClick={() => window.print()}>
          <Printer size={16} /> พิมพ์
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: '1.5rem' }}>
        {students.map((s) => (
          <div key={s.id} style={{ textAlign: 'center', border: '1px solid var(--border-color)', borderRadius: 'var(--border-radius)', padding: '1rem' }}>
            {qrDataUrls[s.id] && <img src={qrDataUrls[s.id]} alt={s.roll} style={{ width: '100%' }} />}
            <p style={{ margin: '0.5rem 0 0', fontWeight: 600 }}>{s.name}</p>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '0.85rem' }}>{s.roll}</p>
          </div>
        ))}
        {students.length === 0 && <p style={{ color: 'var(--text-muted)' }}>ไม่มีนักเรียนในห้องนี้</p>}
      </div>
    </div>
  );
};

const CameraScanner = ({ classId, mode }) => {
  const [assignments, setAssignments] = useState([]);
  const [assignmentId, setAssignmentId] = useState(null);
  const [scanning, setScanning] = useState(false);
  const [manualCode, setManualCode] = useState('');
  const [log, setLog] = useState([]);
  const html5QrRef = useRef(null);

  useEffect(() => {
    if (mode !== 'submission' || !classId) return;
    api.get(`/assignments?classId=${classId}`).then((data) => {
      setAssignments(data);
      setAssignmentId((current) => (data.some((a) => a.id === current) ? current : data[0]?.id ?? null));
    });
  }, [mode, classId]);

  const submitCode = async (code) => {
    try {
      let result;
      if (mode === 'attendance') result = await api.post('/scan/attendance', { classId, studentCode: code });
      else if (mode === 'submission') result = await api.post('/scan/submission', { assignmentId, studentCode: code });
      else result = await api.post('/scan/materials', { classId, studentCode: code });
      setLog((l) => [{ time: new Date().toLocaleTimeString('th-TH'), ok: true, message: `${result.student.roll} · ${result.student.name}` }, ...l].slice(0, 20));
    } catch (err) {
      setLog((l) => [{ time: new Date().toLocaleTimeString('th-TH'), ok: false, message: `${code}: ${err.message}` }, ...l].slice(0, 20));
    }
  };

  const startCamera = async () => {
    const html5QrCode = new Html5Qrcode('qr-reader');
    html5QrRef.current = html5QrCode;
    try {
      await html5QrCode.start(
        { facingMode: 'environment' },
        { fps: 10, qrbox: 220 },
        (decodedText) => submitCode(decodedText.trim()),
        () => {}
      );
      setScanning(true);
    } catch (err) {
      setLog((l) => [{ time: new Date().toLocaleTimeString('th-TH'), ok: false, message: `เปิดกล้องไม่สำเร็จ: ${err.message || err}` }, ...l]);
    }
  };

  const stopCamera = async () => {
    if (html5QrRef.current) {
      try {
        await html5QrRef.current.stop();
        await html5QrRef.current.clear();
      } catch {
        // camera may already be stopped
      }
    }
    setScanning(false);
  };

  useEffect(() => {
    return () => {
      if (html5QrRef.current) html5QrRef.current.stop().catch(() => {});
    };
  }, []);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    submitCode(manualCode.trim());
    setManualCode('');
  };

  return (
    <div>
      {mode === 'submission' && (
        <div className="glass-panel" style={{ padding: '1rem', marginBottom: '1rem' }}>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.9rem', color: 'var(--text-muted)' }}>เลือกงานที่จะเช็ค</label>
          <select
            value={assignmentId ?? ''}
            onChange={(e) => setAssignmentId(Number(e.target.value))}
            style={{ width: '100%', padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
          >
            {assignments.map((a) => (
              <option key={a.id} value={a.id}>{a.title}</option>
            ))}
          </select>
        </div>
      )}

      <div className="glass-panel" style={{ padding: '1.25rem', marginBottom: '1rem' }}>
        <div id="qr-reader" style={{ width: '100%', maxWidth: '360px', margin: '0 auto' }} />
        <div style={{ display: 'flex', justifyContent: 'center', gap: '0.75rem', marginTop: '1rem' }}>
          {!scanning ? (
            <button className="btn btn-primary" onClick={startCamera}><Camera size={16} /> เปิดกล้อง</button>
          ) : (
            <button className="btn btn-secondary" onClick={stopCamera}>หยุดกล้อง</button>
          )}
        </div>
      </div>

      <form onSubmit={handleManualSubmit} className="glass-panel" style={{ padding: '1rem', display: 'flex', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <input
          type="text"
          placeholder="กรอกรหัสนักเรียนด้วยตนเอง (กรณีกล้องใช้ไม่ได้)"
          value={manualCode}
          onChange={(e) => setManualCode(e.target.value)}
          style={{ flex: 1, padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
        />
        <button type="submit" className="btn btn-secondary">บันทึก</button>
      </form>

      <div className="glass-panel" style={{ padding: '1rem' }}>
        <h4 style={{ marginTop: 0 }}>ประวัติการสแกนล่าสุด</h4>
        {log.length === 0 && <p style={{ color: 'var(--text-muted)' }}>ยังไม่มีการสแกน</p>}
        {log.map((entry, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0', borderBottom: '1px solid var(--border-color)' }}>
            <span style={{ color: entry.ok ? 'var(--text-main)' : 'var(--danger)' }}>{entry.message}</span>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{entry.time}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

const Scanner = () => {
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState(null);
  const [view, setView] = useState('scan'); // 'scan' | 'roster'
  const [mode, setMode] = useState('attendance');

  useEffect(() => {
    api.get('/classes').then((data) => {
      setClasses(data);
      if (data.length) setClassId(data[0].id);
    });
  }, []);

  return (
    <div className="animate-fade-in">
      <div className="dashboard-header no-print">
        <div>
          <h1 style={{ fontSize: '1.75rem', marginBottom: '0.25rem' }}>QR & สแกน</h1>
          <p style={{ color: 'var(--text-muted)' }}>พิมพ์ QR ประจำตัวนักเรียน หรือใช้กล้องสแกนเพื่อเช็คชื่อ ตรวจงานส่ง และตรวจอุปกรณ์</p>
        </div>
      </div>

      <div className="attendance-controls glass-panel no-print" style={{ marginBottom: '1.5rem', padding: '1rem 1.25rem', display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
        <select
          value={classId ?? ''}
          onChange={(e) => setClassId(Number(e.target.value))}
          style={{ padding: '0.6rem', borderRadius: 'var(--border-radius)', border: '1px solid var(--border-color)' }}
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.name} - {c.subject}</option>
          ))}
        </select>
      </div>

      <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem' }}>
        <button className={`btn ${view === 'scan' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('scan')}>สแกน QR</button>
        <button className={`btn ${view === 'roster' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('roster')}>พิมพ์ QR นักเรียน</button>
      </div>

      {view === 'scan' && (
        <>
          <div className="no-print" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
            {Object.entries(MODE_LABELS).map(([key, label]) => (
              <button key={key} className={`btn ${mode === key ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setMode(key)}>{label}</button>
            ))}
          </div>
          <CameraScanner classId={classId} mode={mode} />
        </>
      )}

      {view === 'roster' && <QRRoster classId={classId} />}
    </div>
  );
};

export default Scanner;
