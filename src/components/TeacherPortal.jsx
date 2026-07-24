import { useState } from 'react';
import Sidebar from './Sidebar';
import Dashboard from './Dashboard';
import Attendance from './Attendance';
import Grades from './Grades';
import Schedule from './Schedule';
import MissingWork from './MissingWork';
import Reports from './Reports';
import Scanner from './Scanner';

const TeacherPortal = ({ teacher, onLogout }) => {
  const [activeTab, setActiveTab] = useState('dashboard');

  return (
    <div className="app-container">
      <Sidebar activeTab={activeTab} setActiveTab={setActiveTab} teacher={teacher} onLogout={onLogout} />

      <main className="main-content">
        {activeTab === 'dashboard' && <Dashboard teacher={teacher} setActiveTab={setActiveTab} />}
        {activeTab === 'schedule' && <Schedule setActiveTab={setActiveTab} />}
        {activeTab === 'attendance' && <Attendance />}
        {activeTab === 'scanner' && <Scanner />}
        {activeTab === 'grades' && <Grades />}
        {activeTab === 'missing-work' && <MissingWork />}
        {activeTab === 'reports' && <Reports />}
      </main>
    </div>
  );
};

export default TeacherPortal;
