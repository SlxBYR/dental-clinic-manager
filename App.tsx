import React, { useEffect, useState } from 'react';
import { Calendar, LayoutDashboard, Settings, Users } from 'lucide-react';
import { APP_VERSION } from './constants';
import { SidebarItem } from './components/SidebarItem';
import { SettingsModal } from './modals/SettingsModal';
import { Dashboard } from './pages/Dashboard';
import { PatientDetail } from './pages/PatientDetail';
import { PatientList } from './pages/PatientList';
import { ScheduleManager } from './pages/ScheduleManager';
import { clinicService } from './services/clinicService';
import { View } from './appTypes';
import { Patient } from './types';

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [clinicName, setClinicName] = useState('DentalClinic');
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setPatients(clinicService.getAllPatients());
    setClinicName(clinicService.getClinicName());
  }, [refreshKey]);

  const refreshData = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handlePatientClick = (patientId: string) => {
    setSelectedPatientId(patientId);
    setCurrentView('patients');
  };

  // 顶层只负责页面路由和全局刷新，业务表单拆到 pages/modals 中维护。
  const renderContent = () => {
    if (selectedPatientId) {
      const patient = clinicService.getPatient(selectedPatientId);
      if (!patient) {
        setSelectedPatientId(null);
        return <div>Patient not found</div>;
      }
      return <PatientDetail patient={patient} onBack={() => setSelectedPatientId(null)} onRefresh={refreshData} />;
    }

    switch (currentView) {
      case 'dashboard':
        return <Dashboard onViewChange={setCurrentView} patients={patients} onPatientClick={handlePatientClick} onRefresh={refreshData} />;
      case 'patients':
        return <PatientList patients={patients} onSelect={handlePatientClick} onRefresh={refreshData} />;
      case 'schedule':
        return <ScheduleManager patients={patients} onRefresh={refreshData} onPatientClick={handlePatientClick} />;
      default:
        return <Dashboard onViewChange={setCurrentView} patients={patients} onPatientClick={handlePatientClick} onRefresh={refreshData} />;
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans text-slate-900 relative">
      <aside className="w-64 bg-slate-900 text-slate-300 flex flex-col shadow-xl flex-shrink-0 relative">
        <div className="p-4 border-b border-slate-800">
          <div className="flex items-center gap-3 min-w-0">
            <img src="./app-icon.png" alt="" className="h-11 w-11 rounded-xl bg-white object-cover shadow-sm flex-shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-bold text-lg leading-tight text-white truncate">{clinicName}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500 font-mono">v{APP_VERSION}</span>
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-md hover:bg-slate-800"
                  aria-label="系统设置"
                >
                  <Settings size={17} />
                </button>
              </div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2">
          <SidebarItem
            icon={<LayoutDashboard size={20} />}
            label="总览"
            active={currentView === 'dashboard' && !selectedPatientId}
            onClick={() => { setSelectedPatientId(null); setCurrentView('dashboard'); }}
          />
          <SidebarItem
            icon={<Users size={20} />}
            label="患者管理"
            active={currentView === 'patients'}
            onClick={() => { setSelectedPatientId(null); setCurrentView('patients'); }}
          />
          <SidebarItem
            icon={<Calendar size={20} />}
            label="日程预约"
            active={currentView === 'schedule'}
            onClick={() => { setSelectedPatientId(null); setCurrentView('schedule'); }}
          />
        </nav>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col">
        {renderContent()}
      </main>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onRefresh={refreshData} currentClinicName={clinicName} />}
    </div>
  );
}
