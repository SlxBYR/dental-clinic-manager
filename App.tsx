import React, { useEffect, useState } from 'react';
import { BarChart3, BellRing, Calendar, Database, LayoutDashboard, Settings, Users } from 'lucide-react';
import { APP_VERSION } from './constants';
import { SidebarItem } from './components/SidebarItem';
import { SettingsModal } from './modals/SettingsModal';
import { Dashboard } from './pages/Dashboard';
import { PatientDetail } from './pages/PatientDetail';
import { PatientList } from './pages/PatientList';
import { RagAssistant } from './pages/RagAssistant';
import { Reports } from './pages/Reports';
import { ScheduleManager } from './pages/ScheduleManager';
import { clinicService } from './services/clinicService';
import { View } from './appTypes';
import { Patient } from './types';

const AGE_REVIEW_DECISION_KEY_PREFIX = 'ageReviewDecision';

const getAgeReviewDecisionKey = (year: number) => `${AGE_REVIEW_DECISION_KEY_PREFIX}_${year}`;

const isAgeReviewDay = (date: Date) => date.getMonth() === 0 && date.getDate() === 1;

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [clinicName, setClinicName] = useState('DentalClinic');
  const [refreshKey, setRefreshKey] = useState(0);
  const [ageReviewDecisionYear, setAgeReviewDecisionYear] = useState<number | null>(null);
  const today = new Date();
  const currentYear = today.getFullYear();
  const shouldShowAgeReviewNotice = isAgeReviewDay(today)
    && clinicService.getAllPatients().length > 0
    && ageReviewDecisionYear !== currentYear
    && !localStorage.getItem(getAgeReviewDecisionKey(currentYear));

  useEffect(() => {
    setClinicName(clinicService.getClinicName());
    if (currentView === 'patients') {
      setPatients([]);
      return;
    }
    setPatients(clinicService.getAllPatients());
  }, [refreshKey, currentView]);

  useEffect(() => {
    if (selectedPatientId && !clinicService.getPatient(selectedPatientId)) {
      setSelectedPatientId(null);
    }
  }, [selectedPatientId, refreshKey]);

  const refreshData = () => {
    setRefreshKey(prev => prev + 1);
  };

  const handlePatientClick = (patientId: string) => {
    setSelectedPatientId(patientId);
    setCurrentView('patients');
  };

  const recordAgeReviewDecision = (decision: 'update' | 'skip') => {
    localStorage.setItem(getAgeReviewDecisionKey(currentYear), JSON.stringify({
      decision,
      decidedAt: new Date().toISOString()
    }));
    setAgeReviewDecisionYear(currentYear);
  };

  const handleAgeReviewUpdate = () => {
    recordAgeReviewDecision('update');
    setSelectedPatientId(null);
    setCurrentView('patients');
  };

  // 顶层只负责页面路由和全局刷新，业务表单拆到 pages/modals 中维护。
  const renderContent = () => {
    if (selectedPatientId) {
      const patient = clinicService.getPatient(selectedPatientId);
      if (!patient) {
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
      case 'reports':
        return <Reports patients={patients} onPatientClick={handlePatientClick} />;
      case 'rag':
        return <RagAssistant patients={patients} onPatientClick={handlePatientClick} />;
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
          <SidebarItem
            icon={<BarChart3 size={20} />}
            label="统计报表"
            active={currentView === 'reports'}
            onClick={() => { setSelectedPatientId(null); setCurrentView('reports'); }}
          />
          <SidebarItem
            icon={<Database size={20} />}
            label="RAG 知识库"
            active={currentView === 'rag'}
            onClick={() => { setSelectedPatientId(null); setCurrentView('rag'); }}
          />
        </nav>
      </aside>

      <main className="flex-1 overflow-auto flex flex-col">
        {renderContent()}
      </main>

      {shouldShowAgeReviewNotice && (
        <div className="fixed bottom-6 right-6 z-40 w-[420px] rounded-xl border border-amber-200 bg-white p-5 shadow-2xl">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <BellRing size={21} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold text-slate-900">患者年龄年度更新提醒</div>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                今天是 {currentYear} 年 1 月 1 日。请确认是否需要更新患者年龄；做出选择前，此提醒会持续显示。
              </p>
              <div className="mt-4 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => recordAgeReviewDecision('skip')}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  今年无需更新
                </button>
                <button
                  type="button"
                  onClick={handleAgeReviewUpdate}
                  className="rounded-lg bg-teal-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-teal-700"
                >
                  去患者库更新
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} onRefresh={refreshData} currentClinicName={clinicName} />}
    </div>
  );
}
