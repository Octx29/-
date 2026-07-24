import { useEffect, useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import Login from './components/Login';
import TeacherPortal from './components/TeacherPortal';
import StudentLookup from './components/StudentLookup';
import { api } from './lib/api';
import './App.css';

function App() {
  const [teacher, setTeacher] = useState(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    api
      .get('/auth/me')
      .then(setTeacher)
      .catch(() => {})
      .finally(() => setCheckingSession(false));
  }, []);

  const handleLogin = (teacherData) => setTeacher(teacherData);

  const handleLogout = async () => {
    await api.post('/auth/logout', {}).catch(() => {});
    setTeacher(null);
  };

  return (
    <Routes>
      <Route path="/lookup" element={<StudentLookup />} />
      <Route
        path="/"
        element={
          checkingSession ? null : teacher ? (
            <TeacherPortal teacher={teacher} onLogout={handleLogout} />
          ) : (
            <Login onLogin={handleLogin} />
          )
        }
      />
    </Routes>
  );
}

export default App;
