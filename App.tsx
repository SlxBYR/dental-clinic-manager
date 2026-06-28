import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Users, 
  Calendar, 
  LayoutDashboard, 
  Plus, 
  Search, 
  Phone, 
  Clock, 
  Trash2, 
  Edit2, 
  Save, 
  X,
  Stethoscope,
  ChevronRight,
  Smile,
  Settings,
  Download,
  Upload,
  Check,
  CheckCircle,
  Circle,
  AlertTriangle
} from 'lucide-react';
// @ts-ignore
import * as pinyin from 'tiny-pinyin';
import { clinicService } from './services/clinicService';
import { Patient, TreatmentCategory, TreatmentItem, GlobalAppointment, TreatmentRecord } from './types';
import { Button } from './components/Button';
import { APP_VERSION } from './constants';

// --- Types for App State ---
type View = 'dashboard' | 'patients' | 'schedule';

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
};

const getTreatmentCountByDate = (patients: Patient[]) => {
  const counts = new Map<string, number>();
  patients.forEach(patient => {
    patient.treatments.forEach(treatment => {
      counts.set(treatment.date, (counts.get(treatment.date) || 0) + 1);
    });
  });
  return counts;
};

const buildTreatmentContributionDays = (patients: Patient[], weekCount = 26) => {
  const counts = getTreatmentCountByDate(patients);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const end = new Date(today);
  end.setDate(today.getDate() + (6 - today.getDay()));

  const start = new Date(end);
  start.setDate(end.getDate() - weekCount * 7 + 1);

  const days = Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() + index);
    const dateKey = formatDateKey(date);
    return {
      date: dateKey,
      count: counts.get(dateKey) || 0,
      isFuture: date > today,
    };
  });

  return {
    days,
    total: days.reduce((sum, day) => sum + day.count, 0),
    max: days.reduce((max, day) => Math.max(max, day.count), 0),
  };
};

const getContributionColor = (count: number, isFuture: boolean) => {
  if (isFuture) return 'bg-slate-50 border-slate-100';
  if (count >= 5) return 'bg-teal-800 border-teal-800';
  if (count >= 3) return 'bg-teal-600 border-teal-600';
  if (count >= 2) return 'bg-teal-400 border-teal-400';
  if (count >= 1) return 'bg-teal-200 border-teal-200';
  return 'bg-slate-100 border-slate-200';
};

export default function App() {
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [patients, setPatients] = useState<Patient[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [clinicName, setClinicName] = useState('DentalClinic');
  
  // Refresh data trigger
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

  const renderContent = () => {
    if (selectedPatientId) {
      const p = clinicService.getPatient(selectedPatientId);
      if (!p) {
        setSelectedPatientId(null);
        return <div>Patient not found</div>;
      }
      return <PatientDetail patient={p} onBack={() => setSelectedPatientId(null)} onRefresh={refreshData} />;
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

// --- Sub Components ---

const SidebarItem = ({ icon, label, active, onClick }: { icon: React.ReactNode, label: string, active: boolean, onClick: () => void }) => (
  <button 
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
      active ? 'bg-teal-600 text-white shadow-lg' : 'hover:bg-slate-800 hover:text-white'
    }`}
  >
    {icon}
    <span className="font-medium">{label}</span>
  </button>
);

// 1. Dashboard View
const Dashboard = ({ patients, onViewChange, onPatientClick, onRefresh }: { patients: Patient[], onViewChange: (v: View) => void, onPatientClick: (id: string) => void, onRefresh: () => void }) => {
  const today = formatDateKey(new Date());
  const todayAppts = clinicService.getAppointmentsByDate(today);
  const contribution = useMemo(() => buildTreatmentContributionDays(patients), [patients]);

  const toggleStatus = (e: React.MouseEvent, appt: GlobalAppointment) => {
    e.stopPropagation();
    const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
    clinicService.updateAppointmentStatus(appt.date, appt.patientId, appt.time, newStatus);
    onRefresh();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">诊所概况</h1>
        <p className="text-slate-500 mt-2 text-lg">欢迎回来，今天 {today} 的工作安排如下</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewChange('patients')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-lg">总患者数</h3>
            <Users className="text-teal-600 bg-teal-50 p-2 rounded-lg w-10 h-10" />
          </div>
          <p className="text-5xl font-bold text-slate-900">{patients.length}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 hover:shadow-md transition-shadow cursor-pointer" onClick={() => onViewChange('schedule')}>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-500 font-medium text-lg">今日预约</h3>
            <Calendar className="text-blue-600 bg-blue-50 p-2 rounded-lg w-10 h-10" />
          </div>
          <p className="text-5xl font-bold text-slate-900">{todayAppts.length}</p>
        </div>

        <div className="bg-gradient-to-br from-teal-500 to-emerald-600 p-6 rounded-xl shadow-lg text-white">
          <h3 className="font-medium opacity-90 mb-2 text-lg">快速操作</h3>
          <div className="space-y-3">
            <button onClick={() => onViewChange('patients')} className="w-full bg-white/20 hover:bg-white/30 text-left px-4 py-3 rounded-lg text-base transition-colors flex items-center gap-2">
              <Plus size={18} /> 新增患者
            </button>
            <button onClick={() => onViewChange('schedule')} className="w-full bg-white/20 hover:bg-white/30 text-left px-4 py-3 rounded-lg text-base transition-colors flex items-center gap-2">
              <Clock size={18} /> 查看今日日程
            </button>
          </div>
        </div>
      </div>

      <TreatmentContributionWall contribution={contribution} />

      <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6">
        <h3 className="text-xl font-bold text-slate-800 mb-4">今日预约列表</h3>
        {todayAppts.length === 0 ? (
          <div className="text-center py-8 text-slate-400 bg-slate-50 rounded-lg text-lg">
            今日暂无预约
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500 text-base">
                  <th className="pb-3 font-medium">时间</th>
                  <th className="pb-3 font-medium">姓名</th>
                  <th className="pb-3 font-medium">电话</th>
                  <th className="pb-3 font-medium">状态 (点击切换)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-base">
                {todayAppts.map((appt, i) => (
                  <tr key={i} className="group hover:bg-slate-50 cursor-pointer" onClick={() => onPatientClick(appt.patientId)}>
                    <td className="py-3 font-medium text-slate-700">{appt.time}</td>
                    <td className="py-3 text-slate-900 font-bold hover:text-teal-600">{appt.name}</td>
                    <td className="py-3 text-slate-500">{appt.phone || '未填写'}</td>
                    <td className="py-3">
                       <button 
                         onClick={(e) => toggleStatus(e, appt)}
                         className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                           appt.status === 'completed' 
                             ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' 
                             : 'bg-green-100 text-green-700 hover:bg-green-200'
                         }`}
                       >
                         {appt.status === 'completed' ? <CheckCircle size={14}/> : <Circle size={14}/>}
                         {appt.status === 'completed' ? '完成' : '待诊'}
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const TreatmentContributionWall = ({ contribution }: { contribution: ReturnType<typeof buildTreatmentContributionDays> }) => {
  const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六'];
  const hasActivity = contribution.total > 0;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-100 p-6 mb-8">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
        <div>
          <h3 className="text-xl font-bold text-slate-800">处置完成记录</h3>
          <p className="text-sm text-slate-500 mt-1">每个格子代表一天，处置完成越多颜色越深。</p>
        </div>
        <div className="text-right">
          <div className="text-3xl font-bold text-slate-900">{contribution.total}</div>
          <div className="text-sm text-slate-500">近 26 周完成处置</div>
        </div>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2">
        <div className="grid grid-rows-7 gap-1 pt-0.5 text-[11px] leading-3 text-slate-400 flex-shrink-0">
          {weekdayLabels.map((label, index) => (
            <div key={label} className="h-3 flex items-center justify-end">
              {index % 2 === 1 ? label : ''}
            </div>
          ))}
        </div>

        <div className="grid grid-flow-col grid-rows-7 gap-1 min-w-max">
          {contribution.days.map(day => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} 个处置`}
              className={`h-3 w-3 rounded-sm border ${getContributionColor(day.count, day.isFuture)}`}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
        <span>{hasActivity ? `单日最高 ${contribution.max} 个处置` : '暂无处置记录'}</span>
        <div className="flex items-center gap-2">
          <span>少</span>
          {[0, 1, 2, 3, 5].map(level => (
            <span key={level} className={`h-3 w-3 rounded-sm border ${getContributionColor(level, false)}`} />
          ))}
          <span>多</span>
        </div>
      </div>
    </div>
  );
};

// 2. Patient List View
const PatientList = ({ patients, onSelect, onRefresh }: { patients: Patient[], onSelect: (id: string) => void, onRefresh: () => void }) => {
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);

  // Helper to check match
  const isMatch = (p: Patient, query: string) => {
    const q = query.toLowerCase();
    if (!q) return true;
    
    // 1. Standard name/phone match
    if (p.name.toLowerCase().includes(q) || p.phone.includes(q)) return true;

    // 2. Pinyin Initials match (if query is alphabetic)
    if (pinyin && /^[a-zA-Z]+$/.test(q)) {
      if (typeof pinyin.convertToPinyin === 'function') {
        const fullPinyin = pinyin.convertToPinyin(p.name, ' ', true); // returns "zhang san" if lowerCase is true
        const initials = fullPinyin.split(' ').map((s: string) => s[0]).join(''); 
        if (initials.includes(q)) return true;
      }
    }
    
    return false;
  };

  // Helper to get last update time for sorting
  const getLastUpdate = (p: Patient) => {
     // Check appointments created_at and treatments date
     let last = '0000-00-00';
     // Most recent treatment
     if (p.treatments.length > 0) {
       const tDate = p.treatments[p.treatments.length - 1].date;
       if (tDate > last) last = tDate;
     }
     // Most recent appointment creation
     if (p.appointments.length > 0) {
       const aDate = p.appointments[0].datetime.split(' ')[0];
       if (aDate > last) last = aDate;
     }
     return last;
  };

  const filtered = patients.filter(p => isMatch(p, search));
  
  // Sort descending by last update
  filtered.sort((a, b) => getLastUpdate(b).localeCompare(getLastUpdate(a)));

  return (
    <div className="p-8 max-w-7xl mx-auto w-full h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-3xl font-bold text-slate-900">患者库</h2>
        <Button onClick={() => setShowAddModal(true)} size="lg">
          <Plus size={20} className="mr-2" /> 新增患者
        </Button>
      </div>

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 mb-6 sticky top-0 z-10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
          <input 
            type="text" 
            placeholder="搜索姓名、拼音首字母或电话..." 
            className="w-full pl-10 pr-4 py-3 text-lg border border-slate-200 rounded-lg focus:ring-2 focus:ring-teal-500 focus:border-transparent outline-none"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 flex-1 overflow-auto">
        {filtered.length === 0 ? (
          <div className="p-10 text-center text-slate-500 text-lg">
            {patients.length === 0 ? "暂无患者数据，请点击右上角新增。" : "未找到匹配的患者。"}
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-slate-50 sticky top-0">
              <tr>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">姓名</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">电话</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">性别/年龄</th>
                <th className="px-6 py-4 text-sm font-bold text-slate-500 uppercase tracking-wider">最近更新</th>
                <th className="px-6 py-4"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-lg">
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-teal-50/30 transition-colors group cursor-pointer" onClick={() => onSelect(p.id)}>
                  <td className="px-6 py-4 font-medium text-slate-900 flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-teal-100 text-teal-700 flex items-center justify-center font-bold text-lg">
                      {p.name.charAt(0)}
                    </div>
                    {p.name}
                  </td>
                  <td className="px-6 py-4 text-slate-600">{p.phone || '未填写'}</td>
                  <td className="px-6 py-4 text-slate-600">{p.gender}, {p.age}岁</td>
                  <td className="px-6 py-4 text-slate-400 text-base">
                    {getLastUpdate(p) === '0000-00-00' ? '-' : getLastUpdate(p)}
                  </td>
                  <td className="px-6 py-4 text-right">
                    <ChevronRight className="inline-block text-slate-300 group-hover:text-teal-500" size={24} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showAddModal && (
        <AddPatientModal
          patients={patients}
          onSelectPatient={(patientId) => {
            setShowAddModal(false);
            onSelect(patientId);
          }}
          onClose={() => setShowAddModal(false)}
          onSuccess={() => { setShowAddModal(false); onRefresh(); }}
        />
      )}
    </div>
  );
};

// 3. Patient Detail View
const PatientDetail = ({ patient, onBack, onRefresh }: { patient: Patient, onBack: () => void, onRefresh: () => void }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'treatments' | 'appointments'>('info');
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editForm, setEditForm] = useState({ name: patient.name, phone: patient.phone, gender: patient.gender, age: patient.age });
  const [editError, setEditError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  // State for editing treatment
  const [editingTreatment, setEditingTreatment] = useState<TreatmentRecord | null>(null);
  const [deleteTreatmentId, setDeleteTreatmentId] = useState<string | null>(null);

  const handleSaveInfo = () => {
    const cleanName = editForm.name.trim();
    const cleanPhone = editForm.phone.trim();
    if (!cleanName) {
      setEditError('姓名是必填项');
      return;
    }
    const existing = cleanPhone ? clinicService.findPatientByPhone(cleanPhone) : undefined;
    if (existing && existing.id !== patient.id) {
      setEditError(`该电话已属于患者 ${existing.name}`);
      return;
    }
    clinicService.updatePatient(patient.id, {
      name: cleanName,
      phone: cleanPhone,
      gender: editForm.gender,
      age: editForm.age.trim()
    });
    setEditError('');
    setEditingInfo(false);
    onRefresh();
  };
  
  const handleDeleteClick = () => {
    setShowDeleteConfirm(true);
  };

  const handleConfirmDelete = () => {
    clinicService.deletePatient(patient.id);
    onRefresh();
    onBack();
  };

  const handleTreatmentDeleteClick = (id: string) => {
    setDeleteTreatmentId(id);
  };

  const confirmDeleteTreatment = () => {
    if (deleteTreatmentId) {
      clinicService.deleteTreatment(patient.id, deleteTreatmentId);
      setDeleteTreatmentId(null);
      onRefresh();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <div className="bg-white border-b border-slate-200 px-8 py-6 flex items-center justify-between shadow-sm flex-shrink-0">
        <div className="flex items-center gap-6">
          <Button variant="secondary" size="md" onClick={onBack}>
             &larr; 返回列表
          </Button>
          <div className="h-10 w-[1px] bg-slate-200"></div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              {patient.name}
              <span className="text-base font-normal text-slate-500 bg-slate-100 px-3 py-1 rounded-full">{patient.gender}, {patient.age}岁</span>
            </h1>
            <p className="text-slate-500 text-base flex items-center gap-2 mt-1">
              <Phone size={16} /> {patient.phone || '未填写电话'}
            </p>
          </div>
        </div>
        <div className="flex gap-3">
           <Button variant="danger" size="md" onClick={handleDeleteClick} className="mr-4">
             <Trash2 size={18} className="mr-2" /> 删除档案
           </Button>
           <Button onClick={() => setShowAppointmentModal(true)} variant="secondary" size="md">
             <Calendar size={18} className="mr-2" /> 新增预约
           </Button>
           <Button onClick={() => setShowTreatmentModal(true)} size="md">
             <Stethoscope size={18} className="mr-2" /> 新增处置
           </Button>
        </div>
      </div>

      <div className="px-8 mt-6">
        <div className="border-b border-slate-200 flex gap-8">
           <button onClick={() => setActiveTab('info')} className={`pb-4 px-2 font-bold text-lg transition-colors relative ${activeTab === 'info' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
             基本信息
             {activeTab === 'info' && <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-600 rounded-t"></div>}
           </button>
           <button onClick={() => setActiveTab('treatments')} className={`pb-4 px-2 font-bold text-lg transition-colors relative ${activeTab === 'treatments' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
             处置记录 ({patient.treatments.length})
             {activeTab === 'treatments' && <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-600 rounded-t"></div>}
           </button>
           <button onClick={() => setActiveTab('appointments')} className={`pb-4 px-2 font-bold text-lg transition-colors relative ${activeTab === 'appointments' ? 'text-teal-600' : 'text-slate-500 hover:text-slate-700'}`}>
             预约历史 ({patient.appointments.length})
             {activeTab === 'appointments' && <div className="absolute bottom-0 left-0 w-full h-1 bg-teal-600 rounded-t"></div>}
           </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-8">
        {activeTab === 'info' && (
          <div className="bg-white p-8 rounded-xl border border-slate-200 max-w-2xl shadow-sm text-lg">
            <div className="flex justify-between items-center mb-6">
               <h3 className="text-xl font-bold text-slate-800">详细档案</h3>
               {!editingInfo ? (
                 <Button variant="ghost" size="sm" onClick={() => setEditingInfo(true)}><Edit2 size={18} className="mr-1"/> 编辑</Button>
               ) : (
                 <div className="flex gap-2">
                    <Button variant="ghost" size="sm" onClick={() => { setEditingInfo(false); setEditError(''); setEditForm({ name: patient.name, phone: patient.phone, gender: patient.gender, age: patient.age }); }}>取消</Button>
                    <Button variant="primary" size="sm" onClick={handleSaveInfo}><Save size={18} className="mr-1"/> 保存</Button>
                 </div>
               )}
            </div>
            {editError && <div className="mb-5 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-base text-red-700">{editError}</div>}
            
            <div className="grid grid-cols-1 gap-6">
              <div className="grid grid-cols-3 items-center border-b border-slate-50 pb-4">
                <span className="text-slate-500 font-medium">姓名</span>
                <div className="col-span-2">
                  {editingInfo ? (
                    <input className="border border-slate-300 rounded px-3 py-2 w-full" value={editForm.name} onChange={e => setEditForm({...editForm, name: e.target.value})} />
                  ) : <span className="text-slate-900">{patient.name}</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 items-center border-b border-slate-50 pb-4">
                <span className="text-slate-500 font-medium">电话</span>
                <div className="col-span-2">
                  {editingInfo ? (
                    <input className="border border-slate-300 rounded px-3 py-2 w-full font-mono" value={editForm.phone} onChange={e => { setEditError(''); setEditForm({...editForm, phone: e.target.value.replace(/\s/g, '')}); }} />
                  ) : <span className="text-slate-900 font-mono">{patient.phone || '未填写'}</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 items-center border-b border-slate-50 pb-4">
                <span className="text-slate-500 font-medium">性别</span>
                <div className="col-span-2">
                  {editingInfo ? (
                    <select className="border border-slate-300 rounded px-3 py-2 w-full bg-white" value={editForm.gender} onChange={e => setEditForm({...editForm, gender: e.target.value})}>
                      <option value="男">男</option>
                      <option value="女">女</option>
                    </select>
                  ) : <span className="text-slate-900">{patient.gender}</span>}
                </div>
              </div>
              <div className="grid grid-cols-3 items-center border-b border-slate-50 pb-4">
                <span className="text-slate-500 font-medium">年龄</span>
                <div className="col-span-2">
                  {editingInfo ? (
                    <input className="border border-slate-300 rounded px-3 py-2 w-full" value={editForm.age} onChange={e => setEditForm({...editForm, age: e.target.value})} />
                  ) : <span className="text-slate-900">{patient.age}</span>}
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'treatments' && (
          <div className="space-y-4">
            {patient.treatments.length === 0 ? (
               <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                 <p className="text-slate-400 text-lg">暂无处置记录</p>
                 <Button className="mt-6" size="lg" onClick={() => setShowTreatmentModal(true)}>添加第一条记录</Button>
               </div>
            ) : (
              patient.treatments.slice().reverse().map((t, i) => (
                <div key={i} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow">
                  <div className="md:w-56 flex-shrink-0 border-r border-slate-100 pr-6">
                    <div className="text-slate-500 text-sm mb-1">日期</div>
                    <div className="font-bold text-slate-800 text-xl">{t.date}</div>
                    <div className="text-sm text-slate-400 font-mono mt-2">ID: {t.id}</div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-start justify-between">
                       <div>
                         <h4 className="font-bold text-teal-700 text-xl">{t.item}</h4>
                         <div className="flex items-center gap-3 mt-3">
                            <span className="bg-orange-50 text-orange-700 px-3 py-1 rounded text-sm font-bold">¥ {t.price}</span>
                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded text-sm font-bold">牙位: {t.teeth}</span>
                         </div>
                       </div>
                       <div className="flex gap-2">
                          <button onClick={() => setEditingTreatment(t)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="编辑记录">
                             <Edit2 size={18} />
                          </button>
                          <button onClick={() => handleTreatmentDeleteClick(t.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="删除记录">
                             <Trash2 size={18} />
                          </button>
                       </div>
                    </div>
                    {t.note && (
                      <div className="mt-4 bg-slate-50 p-4 rounded-lg text-slate-700 text-base border border-slate-100">
                        <span className="font-bold text-slate-400 text-xs uppercase block mb-1">备注</span>
                        {t.note}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 'appointments' && (
           <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden text-lg">
             <table className="w-full text-left">
               <thead className="bg-slate-50 border-b border-slate-200">
                 <tr>
                   <th className="px-8 py-4 font-bold text-slate-500 text-sm">预约时间</th>
                   <th className="px-8 py-4 font-bold text-slate-500 text-sm">创建时间</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {patient.appointments.length === 0 ? (
                   <tr><td colSpan={2} className="px-8 py-10 text-center text-slate-400">无历史预约</td></tr>
                 ) : (
                   patient.appointments.map((a, i) => (
                     <tr key={i}>
                       <td className="px-8 py-5 font-bold text-slate-700">{a.datetime}</td>
                       <td className="px-8 py-5 text-slate-500 text-base">{a.created_at}</td>
                     </tr>
                   ))
                 )}
               </tbody>
             </table>
           </div>
        )}
      </div>

      {showTreatmentModal && (
        <AddTreatmentModal 
          phone={patient.id} 
          onClose={() => setShowTreatmentModal(false)} 
          onSuccess={() => { setShowTreatmentModal(false); onRefresh(); }} 
        />
      )}

      {editingTreatment && (
        <EditTreatmentModal
           phone={patient.id}
           record={editingTreatment}
           onClose={() => setEditingTreatment(null)}
           onSuccess={() => { setEditingTreatment(null); onRefresh(); }}
        />
      )}

      {showAppointmentModal && (
        <AddAppointmentModal 
          phone={patient.id} 
          defaultName={patient.name}
          onClose={() => setShowAppointmentModal(false)} 
          onSuccess={() => { setShowAppointmentModal(false); onRefresh(); }} 
        />
      )}

      {showDeleteConfirm && (
        <ConfirmationModal 
           title="删除患者档案确认" 
           message={`您确定要删除患者 ${patient.name} 的所有档案吗？此操作包含所有治疗记录和预约历史，且不可恢复。`}
           onConfirm={handleConfirmDelete}
           onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {deleteTreatmentId && (
        <ConfirmationModal
          title="删除处置记录确认"
          message="确定要删除这条处置记录吗？此操作不可恢复。"
          onConfirm={confirmDeleteTreatment}
          onCancel={() => setDeleteTreatmentId(null)}
        />
      )}
    </div>
  );
};

// 4. Schedule Manager View
const ScheduleManager = ({ patients, onRefresh, onPatientClick }: { patients: Patient[], onRefresh: () => void, onPatientClick: (id: string) => void }) => {
  const [mode, setMode] = useState<'daily' | 'range'>('daily');
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [endDate, setEndDate] = useState(formatDateKey(addDays(new Date(), 7)));

  const appointments = useMemo(() => {
    if (mode === 'daily') {
      return clinicService.getAppointmentsByDate(date);
    } else {
      return clinicService.getAppointmentsByRange(date, endDate);
    }
  }, [mode, date, endDate, patients]);

  const toggleStatus = (e: React.MouseEvent, appt: GlobalAppointment) => {
    e.stopPropagation();
    const newStatus = appt.status === 'completed' ? 'pending' : 'completed';
    clinicService.updateAppointmentStatus(appt.date, appt.patientId, appt.time, newStatus);
    onRefresh();
  };

  return (
    <div className="p-8 max-w-6xl mx-auto w-full">
      <div className="flex items-center justify-between mb-8">
        <h2 className="text-3xl font-bold text-slate-900">日程表管理</h2>
        <div className="bg-white p-1 rounded-lg border border-slate-200 flex">
           <button onClick={() => setMode('daily')} className={`px-6 py-2 rounded-md text-base font-medium transition-colors ${mode === 'daily' ? 'bg-teal-100 text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>单日视图</button>
           <button onClick={() => setMode('range')} className={`px-6 py-2 rounded-md text-base font-medium transition-colors ${mode === 'range' ? 'bg-teal-100 text-teal-800' : 'text-slate-600 hover:bg-slate-50'}`}>范围视图</button>
        </div>
      </div>

      <div className="bg-white p-8 rounded-xl border border-slate-200 shadow-sm mb-8 flex items-end gap-6">
         <div className="flex-1">
            <label className="block text-base font-medium text-slate-600 mb-2">{mode === 'daily' ? '选择日期' : '开始日期'}</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg text-slate-700 outline-none focus:ring-2 focus:ring-teal-500" />
         </div>
         {mode === 'range' && (
           <>
            <div className="text-slate-300 font-bold mb-5 text-xl">-</div>
            <div className="flex-1">
              <label className="block text-base font-medium text-slate-600 mb-2">结束日期</label>
              <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg text-slate-700 outline-none focus:ring-2 focus:ring-teal-500" />
            </div>
           </>
         )}
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-8 py-5 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
           <h3 className="font-bold text-slate-700 text-lg">
             {mode === 'daily' ? `${date} 的预约` : `${date} 至 ${endDate} 的预约`}
           </h3>
           <span className="text-sm text-slate-500 bg-white border border-slate-200 px-3 py-1 rounded-full">共 {appointments.length} 条</span>
        </div>
        {appointments.length === 0 ? (
          <div className="p-16 text-center text-slate-400 text-lg">
            该时间段内无预约记录
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-slate-100 text-sm font-bold text-slate-500 uppercase">
                 {mode === 'range' && <th className="px-8 py-4">日期</th>}
                 <th className="px-8 py-4">时间</th>
                 <th className="px-8 py-4">姓名</th>
                 <th className="px-8 py-4">电话</th>
                 <th className="px-8 py-4">状态</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 text-lg">
              {appointments.map((appt, i) => (
                <tr key={i} className="hover:bg-teal-50/30 cursor-pointer" onClick={() => onPatientClick(appt.patientId)}>
                  {mode === 'range' && <td className="px-8 py-5 font-mono text-slate-600">{appt.date}</td>}
                  <td className="px-8 py-5 font-bold text-teal-700">{appt.time}</td>
                  <td className="px-8 py-5 text-slate-900 font-bold">{appt.name}</td>
                  <td className="px-8 py-5 text-slate-500">{appt.phone || '未填写'}</td>
                  <td className="px-8 py-5">
                       <button 
                         onClick={(e) => toggleStatus(e, appt)}
                         className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                           appt.status === 'completed' 
                             ? 'bg-slate-200 text-slate-600 hover:bg-slate-300' 
                             : 'bg-green-100 text-green-700 hover:bg-green-200'
                         }`}
                       >
                         {appt.status === 'completed' ? <CheckCircle size={14}/> : <Circle size={14}/>}
                         {appt.status === 'completed' ? '完成' : '待诊'}
                       </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};

// --- Tooth Selector Component ---

type ToothPoint = {
  id: number;
  x: number;
  y: number;
  angle: number;
  labelX: number;
  labelY: number;
  type?: 'front' | 'premolar' | 'molar';
};

const TOOTH_POINTS: ToothPoint[] = [
  { id: 11, x: 248, y: 96, angle: -12, labelX: 232, labelY: 48, type: 'front' },
  { id: 12, x: 208, y: 112, angle: -34, labelX: 188, labelY: 68, type: 'front' },
  { id: 13, x: 172, y: 143, angle: -48, labelX: 148, labelY: 100, type: 'front' },
  { id: 14, x: 142, y: 184, angle: -64, labelX: 110, labelY: 147, type: 'premolar' },
  { id: 15, x: 121, y: 232, angle: -78, labelX: 82, labelY: 206, type: 'premolar' },
  { id: 16, x: 106, y: 288, angle: -85, labelX: 63, labelY: 277, type: 'molar' },
  { id: 17, x: 101, y: 352, angle: -93, labelX: 58, labelY: 352, type: 'molar' },
  { id: 18, x: 104, y: 414, angle: -98, labelX: 62, labelY: 428, type: 'molar' },
  { id: 21, x: 312, y: 96, angle: 12, labelX: 326, labelY: 48, type: 'front' },
  { id: 22, x: 352, y: 112, angle: 34, labelX: 370, labelY: 68, type: 'front' },
  { id: 23, x: 388, y: 143, angle: 48, labelX: 410, labelY: 100, type: 'front' },
  { id: 24, x: 418, y: 184, angle: 64, labelX: 448, labelY: 147, type: 'premolar' },
  { id: 25, x: 439, y: 232, angle: 78, labelX: 476, labelY: 206, type: 'premolar' },
  { id: 26, x: 454, y: 288, angle: 85, labelX: 495, labelY: 277, type: 'molar' },
  { id: 27, x: 459, y: 352, angle: 93, labelX: 502, labelY: 352, type: 'molar' },
  { id: 28, x: 456, y: 414, angle: 98, labelX: 498, labelY: 428, type: 'molar' },
  { id: 48, x: 104, y: 506, angle: 98, labelX: 62, labelY: 494, type: 'molar' },
  { id: 47, x: 104, y: 568, angle: 93, labelX: 62, labelY: 570, type: 'molar' },
  { id: 46, x: 116, y: 628, angle: 82, labelX: 74, labelY: 642, type: 'molar' },
  { id: 45, x: 139, y: 681, angle: 62, labelX: 103, labelY: 708, type: 'premolar' },
  { id: 44, x: 172, y: 724, angle: 45, labelX: 145, labelY: 760, type: 'premolar' },
  { id: 43, x: 210, y: 753, angle: 30, labelX: 188, labelY: 795, type: 'front' },
  { id: 42, x: 248, y: 769, angle: 12, labelX: 234, labelY: 816, type: 'front' },
  { id: 41, x: 280, y: 774, angle: 0, labelX: 280, labelY: 824, type: 'front' },
  { id: 31, x: 312, y: 769, angle: -12, labelX: 326, labelY: 816, type: 'front' },
  { id: 32, x: 350, y: 753, angle: -30, labelX: 372, labelY: 795, type: 'front' },
  { id: 33, x: 388, y: 724, angle: -45, labelX: 415, labelY: 760, type: 'front' },
  { id: 34, x: 421, y: 681, angle: -62, labelX: 457, labelY: 708, type: 'premolar' },
  { id: 35, x: 444, y: 628, angle: -82, labelX: 486, labelY: 642, type: 'premolar' },
  { id: 36, x: 456, y: 568, angle: -93, labelX: 498, labelY: 570, type: 'molar' },
  { id: 37, x: 456, y: 506, angle: -98, labelX: 498, labelY: 494, type: 'molar' },
  { id: 38, x: 454, y: 444, angle: -100, labelX: 496, labelY: 430, type: 'molar' }
];

type ToothImagePoint = {
  id: number;
  left: number;
  top: number;
};

const TOOTH_IMAGE_POINTS: ToothImagePoint[] = [
  { id: 18, left: 3.3, top: 34.2 },
  { id: 17, left: 9.3, top: 34.2 },
  { id: 16, left: 15.3, top: 34.2 },
  { id: 15, left: 21.3, top: 34.2 },
  { id: 14, left: 27.3, top: 34.2 },
  { id: 13, left: 33.3, top: 34.2 },
  { id: 12, left: 39.4, top: 34.2 },
  { id: 11, left: 45.4, top: 34.2 },
  { id: 21, left: 51.9, top: 34.2 },
  { id: 22, left: 58.0, top: 34.2 },
  { id: 23, left: 64.0, top: 34.2 },
  { id: 24, left: 70.0, top: 34.2 },
  { id: 25, left: 76.0, top: 34.2 },
  { id: 26, left: 82.0, top: 34.2 },
  { id: 27, left: 88.0, top: 34.2 },
  { id: 28, left: 94.1, top: 34.2 },
  { id: 48, left: 3.3, top: 69.2 },
  { id: 47, left: 9.3, top: 69.2 },
  { id: 46, left: 15.3, top: 69.2 },
  { id: 45, left: 21.3, top: 69.2 },
  { id: 44, left: 27.3, top: 69.2 },
  { id: 43, left: 33.3, top: 69.2 },
  { id: 42, left: 39.4, top: 69.2 },
  { id: 41, left: 45.4, top: 69.2 },
  { id: 31, left: 51.9, top: 69.2 },
  { id: 32, left: 58.0, top: 69.2 },
  { id: 33, left: 64.0, top: 69.2 },
  { id: 34, left: 70.0, top: 69.2 },
  { id: 35, left: 76.0, top: 69.2 },
  { id: 36, left: 82.0, top: 69.2 },
  { id: 37, left: 88.0, top: 69.2 },
  { id: 38, left: 94.1, top: 69.2 },
];

const ToothCrown = ({ tooth, selected }: { tooth: ToothPoint, selected: boolean }) => {
  const isMolar = tooth.type === 'molar';
  const isPremolar = tooth.type === 'premolar';
  const width = isMolar ? 44 : isPremolar ? 34 : 29;
  const height = isMolar ? 50 : isPremolar ? 39 : 34;
  const rx = isMolar ? 12 : 15;

  return (
    <g transform={`translate(${tooth.x} ${tooth.y}) rotate(${tooth.angle})`}>
      <rect
        x={-width / 2}
        y={-height / 2}
        width={width}
        height={height}
        rx={rx}
        className={`${selected ? 'fill-teal-100 stroke-teal-600' : 'fill-white stroke-slate-500 group-hover:fill-teal-50 group-hover:stroke-teal-500'} transition-colors`}
        strokeWidth="3"
      />
      {isMolar ? (
        <>
          <path d="M-13 -10 C-4 -15 4 -15 13 -10 M-13 10 C-4 15 4 15 13 10 M-13 -10 C-18 0 -18 5 -13 10 M13 -10 C18 0 18 5 13 10" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2.4" strokeLinecap="round" />
          <path d="M-12 0 H12 M0 -14 V14" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2" strokeLinecap="round" />
        </>
      ) : (
        <>
          <path d="M-10 -7 C-2 -14 8 -12 11 -4 C7 3 1 8 -9 9 C-13 3 -14 -2 -10 -7Z" className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          <path d={isPremolar ? 'M-6 0 C0 -6 7 -3 8 5' : 'M-7 4 C0 0 5 -3 8 -9'} className={selected ? 'stroke-teal-700' : 'stroke-slate-500 group-hover:stroke-teal-600'} fill="none" strokeWidth="2" strokeLinecap="round" />
        </>
      )}
    </g>
  );
};

const ToothSelector = ({ value, onChange }: { value: string, onChange: (val: string) => void }) => {
  const isDragging = useRef(false);
  const dragMode = useRef<'select' | 'deselect'>('select');

  // Parsing currently selected teeth
  const selectedTeeth = useMemo(() => {
    if (value === 'ALL') return new Set(['ALL']);
    if (value === 'UPPER') return new Set(['UPPER']);
    if (value === 'LOWER') return new Set(['LOWER']);
    return new Set(value.split(',').filter(Boolean));
  }, [value]);

  useEffect(() => {
    const handleUp = () => { isDragging.current = false; };
    window.addEventListener('mouseup', handleUp);
    return () => window.removeEventListener('mouseup', handleUp);
  }, []);

  const updateSelection = (id: number, mode: 'select' | 'deselect') => {
    const idStr = id.toString();
    const newSet = new Set(selectedTeeth);
    
    // Clear special flags if selecting specific
    if (newSet.has('ALL') || newSet.has('UPPER') || newSet.has('LOWER')) {
      newSet.clear();
    }

    if (mode === 'select') {
      newSet.add(idStr);
    } else {
      newSet.delete(idStr);
    }
    
    onChange(Array.from(newSet).join(','));
  };

  const handleMouseDown = (id: number) => {
    isDragging.current = true;
    const idStr = id.toString();
    const isSelected = selectedTeeth.has(idStr);
    
    // If it's already selected, we are in deselect mode. If not, select mode.
    dragMode.current = isSelected ? 'deselect' : 'select';
    
    updateSelection(id, dragMode.current);
  };

  const handleMouseEnter = (id: number) => {
    if (isDragging.current) {
      updateSelection(id, dragMode.current);
    }
  };

  const setSpecial = (type: string) => {
    onChange(type);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 select-none shadow-inner w-full flex flex-col items-center p-3 sm:p-4 min-w-0">
      <div className="flex flex-wrap justify-center gap-2 mb-3">
        <button type="button" onClick={() => setSpecial('UPPER')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='UPPER' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>上颌</button>
        <button type="button" onClick={() => setSpecial('ALL')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='ALL' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>全口</button>
        <button type="button" onClick={() => setSpecial('LOWER')} className={`px-3 py-1.5 text-sm font-bold rounded-lg border transition-all ${value==='LOWER' ? 'bg-teal-600 text-white shadow-lg' : 'bg-white hover:bg-slate-100 text-slate-600'}`}>下颌</button>
      </div>

      <div className="w-full overflow-x-auto">
        <div className="relative mx-auto min-w-[760px] max-w-[920px] aspect-[1850/850] rounded-lg bg-white">
          <img
            src="./tooth-chart.png"
            alt="牙位选择图"
            className="absolute inset-0 h-full w-full rounded-lg object-contain"
            draggable={false}
          />
          {TOOTH_IMAGE_POINTS.map(tooth => {
          const selected = selectedTeeth.has(tooth.id.toString()) || selectedTeeth.has('ALL') || (selectedTeeth.has('UPPER') && tooth.id < 30) || (selectedTeeth.has('LOWER') && tooth.id > 30);
          return (
            <button
              key={tooth.id}
              type="button"
              aria-label={`选择牙位 ${tooth.id}`}
              title={`牙位 ${tooth.id}`}
              style={{ left: `${tooth.left}%`, top: `${tooth.top}%` }}
              className={`absolute h-9 w-9 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 text-sm font-bold transition-all ${
                selected
                  ? 'border-teal-700 bg-teal-500/80 text-white shadow-md'
                  : 'border-transparent bg-white/0 text-transparent hover:border-teal-500 hover:bg-teal-100/70 hover:text-teal-900'
              }`}
              onMouseDown={() => handleMouseDown(tooth.id)}
              onMouseEnter={() => handleMouseEnter(tooth.id)}
              onTouchStart={() => handleMouseDown(tooth.id)}
            >
              {selected ? tooth.id : ''}
            </button>
          );
        })}
        </div>
      </div>
      
      <div className="mt-3 text-center min-h-8 max-w-full">
        {value ? (
           <div className="inline-flex max-w-full items-center gap-2 bg-teal-100 text-teal-800 px-4 py-1.5 rounded-full text-sm font-medium animate-in fade-in zoom-in duration-200 shadow-sm border border-teal-200">
             <Check size={16} className="flex-shrink-0"/> <span className="flex-shrink-0">已选择:</span> <span className="font-mono font-bold truncate">{value}</span>
           </div>
        ) : (
          <span className="text-slate-400 italic text-sm">请点击或拖动选择牙位</span>
        )}
      </div>
    </div>
  );
};


// --- Modals ---

const ModalBase = ({ title, children, onClose, size = 'md' }: { title: string, children?: React.ReactNode, onClose: () => void, size?: 'md' | 'lg' | 'xl' | '2xl' }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-2 sm:p-4">
    <div className={`bg-white rounded-2xl shadow-2xl w-full overflow-hidden flex flex-col max-h-[calc(100vh-1rem)] sm:max-h-[calc(100vh-2rem)] animate-in fade-in zoom-in duration-200
      ${size === 'md' ? 'max-w-md' : size === 'lg' ? 'max-w-3xl' : size === 'xl' ? 'max-w-5xl' : 'max-w-[min(1280px,calc(100vw-2rem))]'}`}>
      <div className="px-5 sm:px-8 py-4 sm:py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/80 flex-shrink-0 gap-4">
        <h3 className="text-lg sm:text-xl font-bold text-slate-800 truncate">{title}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition-colors p-1 rounded hover:bg-slate-200"><X size={24}/></button>
      </div>
      <div className="p-4 sm:p-6 lg:p-8 overflow-auto min-h-0">
        {children}
      </div>
    </div>
  </div>
);

const SettingsModal = ({ onClose, onRefresh, currentClinicName }: { onClose: () => void, onRefresh: () => void, currentClinicName: string }) => {
  const [tab, setTab] = useState<'data' | 'catalog'>('data');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clinicNameForm, setClinicNameForm] = useState(currentClinicName);
  const [backupSettings, setBackupSettings] = useState(clinicService.getBackupSettings());
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSendingBackup, setIsSendingBackup] = useState(false);
  
  // Catalog State
  const [catalog, setCatalog] = useState<TreatmentCategory[]>(clinicService.getCatalog());
  const [newCatName, setNewCatName] = useState('');
  
  // Add Item State
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemForm, setNewItemForm] = useState({ name: '', price: 0 });

  // Edit Item State
  const [editingItem, setEditingItem] = useState<{catId: string, itemId: string} | null>(null);
  const [editItemForm, setEditItemForm] = useState({ name: '', price: 0 });

  const handleSaveClinicName = () => {
    clinicService.updateClinicName(clinicNameForm.trim());
    alert('诊所名称已更新');
    onRefresh();
  };

  const handleSaveBackupSettings = () => {
    clinicService.updateBackupSettings(backupSettings);
    setBackupStatus({ type: 'success', message: '备份接口配置已保存。' });
  };

  const handleSendBackup = async () => {
    setIsSendingBackup(true);
    setBackupStatus(null);
    clinicService.updateBackupSettings(backupSettings);
    const result = await clinicService.sendBackupToServer(backupSettings);
    setBackupStatus({ type: result.success ? 'success' : 'error', message: result.message });
    setIsSendingBackup(false);
  };

  const handleExport = () => {
    const dataStr = clinicService.exportData();
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = `dental_clinic_backup_${new Date().toISOString().slice(0,10)}.json`;

    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files.length > 0) {
      fileReader.readAsText(e.target.files[0], "UTF-8");
      fileReader.onload = (event) => {
        if (event.target?.result) {
          const success = clinicService.importData(event.target.result as string);
          if (success) {
            alert("导入成功！");
            onRefresh();
            onClose();
          } else {
            alert("导入失败，文件格式可能有误。");
          }
        }
      };
    }
  };

  // Catalog Logic
  const addCategory = () => {
    const clean = newCatName.trim();
    if (!clean) return;
    const newCat: TreatmentCategory = {
      id: `cat_${Date.now()}`,
      name: clean,
      items: []
    };
    const updated = [...catalog, newCat];
    setCatalog(updated);
    setNewCatName('');
  };

  const deleteCategory = (catId: string) => {
    if(!confirm("确定删除该分类及其所有项目吗？")) return;
    setCatalog(catalog.filter(c => c.id !== catId));
  };

  // Add Item Logic
  const startAddItem = (catId: string) => {
    setAddingItemTo(catId);
    setNewItemForm({ name: '', price: 0 });
  };

  const confirmAddItem = (catId: string) => {
    const cleanName = newItemForm.name.trim();
    if (!cleanName) return;
    
    setCatalog(catalog.map(c => {
      if (c.id === catId) {
        return {
          ...c,
          items: [...c.items, { id: Date.now().toString(), name: cleanName, price: newItemForm.price }]
        };
      }
      return c;
    }));
    setAddingItemTo(null);
    setNewItemForm({ name: '', price: 0 });
  };

  const deleteItem = (catId: string, itemId: string) => {
    setCatalog(catalog.map(c => {
      if (c.id === catId) {
        return { ...c, items: c.items.filter(i => i.id !== itemId) };
      }
      return c;
    }));
  };

  const startEditItem = (item: TreatmentItem, catId: string) => {
    setEditingItem({ catId, itemId: item.id });
    setEditItemForm({ name: item.name, price: item.price });
  };

  const saveEditItem = () => {
    if (!editingItem) return;
    const cleanName = editItemForm.name.trim();
    if (!cleanName) return;
    setCatalog(catalog.map(c => {
      if (c.id === editingItem.catId) {
        return {
          ...c,
          items: c.items.map(i => i.id === editingItem.itemId ? { ...i, name: cleanName, price: editItemForm.price } : i)
        };
      }
      return c;
    }));
    setEditingItem(null);
  };

  const saveCatalog = () => {
    clinicService.updateCatalog(catalog);
    alert("目录已更新");
    onRefresh();
  };

  return (
    <ModalBase title="系统设置" onClose={onClose} size="lg">
      <div className="flex gap-6 mb-8 border-b border-slate-200">
        <button onClick={() => setTab('data')} className={`pb-3 px-2 text-lg font-medium transition-colors ${tab === 'data' ? 'border-b-2 border-teal-600 text-teal-800' : 'text-slate-500 hover:text-slate-700'}`}>通用与数据</button>
        <button onClick={() => setTab('catalog')} className={`pb-3 px-2 text-lg font-medium transition-colors ${tab === 'catalog' ? 'border-b-2 border-teal-600 text-teal-800' : 'text-slate-500 hover:text-slate-700'}`}>处置项目管理</button>
      </div>

      {tab === 'data' && (
        <div className="space-y-8">
           <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-4 flex items-center gap-2 text-lg">
              <Settings size={24} className="text-teal-600" /> 基本设置
            </h4>
            <div className="flex gap-4 items-end">
              <div className="flex-1">
                 <label className="block text-slate-600 mb-2 font-medium">诊所名称 (显示在左上角)</label>
                 <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500" value={clinicNameForm} onChange={e => setClinicNameForm(e.target.value)} />
              </div>
              <Button onClick={handleSaveClinicName} size="lg">保存名称</Button>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-lg">
              <Download size={24} className="text-teal-600" /> 导出数据
            </h4>
            <p className="text-base text-slate-500 mb-6">将所有患者、预约和设置数据导出为JSON文件备份。</p>
            <Button onClick={handleExport} size="lg">导出 JSON</Button>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-lg">
              <Upload size={24} className="text-teal-600" /> 服务器备份
            </h4>
            <p className="text-base text-slate-500 mb-6">
              向自建接口发送完整备份。请求方式为 POST，JSON body 包含 generatedAt、clinicName、version 和 data；Token 会通过 Authorization: Bearer 发送。
            </p>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 mb-2 font-medium">备份接口地址</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://your-domain.example.com/backup"
                  value={backupSettings.endpoint}
                  onChange={e => {
                    setBackupSettings({ ...backupSettings, endpoint: e.target.value });
                    setBackupStatus(null);
                  }}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-2 font-medium">访问 Token（可选）</label>
                <input
                  type="password"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="服务器校验用 Token"
                  value={backupSettings.token || ''}
                  onChange={e => {
                    setBackupSettings({ ...backupSettings, token: e.target.value });
                    setBackupStatus(null);
                  }}
                />
              </div>
              {backupStatus && (
                <div className={`rounded-lg border px-4 py-3 text-base ${
                  backupStatus.type === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  {backupStatus.message}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveBackupSettings} variant="secondary" size="lg">保存接口配置</Button>
                <Button onClick={handleSendBackup} size="lg" disabled={isSendingBackup}>
                  {isSendingBackup ? '发送中...' : '立即发送备份'}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-lg">
              <Upload size={24} className="text-blue-600" /> 导入数据
            </h4>
            <p className="text-base text-slate-500 mb-6">从备份的JSON文件中恢复数据 (会覆盖当前数据)。</p>
            <input 
              type="file" 
              accept=".json" 
              ref={fileInputRef} 
              style={{ display: 'none' }} 
              onChange={handleImport} 
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} size="lg">选择文件导入</Button>
          </div>
        </div>
      )}

      {tab === 'catalog' && (
        <div className="space-y-6">
          <div className="flex gap-4 mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
             <input className="border border-slate-300 px-4 py-2 rounded-lg flex-1 text-base outline-none focus:ring-2 focus:ring-teal-500" placeholder="输入新分类名称..." value={newCatName} onChange={e => setNewCatName(e.target.value)} />
             <Button onClick={addCategory}>添加分类</Button>
          </div>
          <div className="flex justify-end mb-2">
             <Button onClick={saveCatalog} variant="primary" size="lg" className="shadow-md"><Save size={18} className="mr-2"/> 保存所有更改</Button>
          </div>
          <div className="max-h-[60vh] overflow-y-auto space-y-6 pr-2">
            {catalog.map(cat => (
              <div key={cat.id} className="border border-slate-200 rounded-xl p-5 shadow-sm">
                 <div className="flex justify-between items-center mb-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    <h5 className="font-bold text-lg text-slate-800">{cat.name}</h5>
                    <div className="flex gap-3">
                       <button onClick={() => startAddItem(cat.id)} className="text-sm bg-teal-100 hover:bg-teal-200 text-teal-800 px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1"><Plus size={14}/> 添加项目</button>
                       <button onClick={() => deleteCategory(cat.id)} className="text-slate-400 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"><Trash2 size={18}/></button>
                    </div>
                 </div>
                 
                 {addingItemTo === cat.id && (
                    <div className="mb-4 flex items-center gap-3 p-3 bg-teal-50 border border-teal-200 rounded-lg animate-in fade-in slide-in-from-top-2">
                      <input 
                        className="flex-1 border border-teal-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500" 
                        placeholder="项目名称"
                        value={newItemForm.name} 
                        onChange={e => setNewItemForm({...newItemForm, name: e.target.value})}
                        autoFocus
                      />
                      <div className="flex items-center gap-1">
                        <span className="text-slate-500 text-sm">¥</span>
                        <input 
                          className="w-24 border border-teal-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-500" 
                          type="number" 
                          placeholder="0"
                          value={newItemForm.price} 
                          onChange={e => setNewItemForm({...newItemForm, price: parseFloat(e.target.value)})}
                        />
                      </div>
                      <Button size="sm" onClick={() => confirmAddItem(cat.id)}>确定</Button>
                      <Button size="sm" variant="ghost" onClick={() => setAddingItemTo(null)}>取消</Button>
                    </div>
                 )}

                 <div className="space-y-2 pl-2">
                   {cat.items.length === 0 && <p className="text-slate-400 text-sm italic py-2">暂无项目</p>}
                   {cat.items.map(item => (
                     <div key={item.id} className="flex justify-between text-base border-b border-dashed border-slate-100 py-3 items-center hover:bg-slate-50 px-2 rounded transition-colors">
                        {editingItem?.itemId === item.id ? (
                          <div className="flex gap-3 flex-1 items-center bg-white p-1 rounded shadow-sm border border-blue-200">
                             <input className="border border-slate-300 rounded px-3 py-1.5 flex-1 text-base outline-none focus:ring-1 focus:ring-blue-500" value={editItemForm.name} onChange={e => setEditItemForm({...editItemForm, name: e.target.value})} />
                             <input className="border border-slate-300 rounded px-3 py-1.5 w-24 text-base outline-none focus:ring-1 focus:ring-blue-500" type="number" value={editItemForm.price} onChange={e => setEditItemForm({...editItemForm, price: parseFloat(e.target.value)})} />
                             <button onClick={saveEditItem} className="text-green-600 hover:text-green-800 p-1 hover:bg-green-50 rounded"><Check size={20} /></button>
                             <button onClick={() => setEditingItem(null)} className="text-slate-400 hover:text-slate-600 p-1 hover:bg-slate-100 rounded"><X size={20} /></button>
                          </div>
                        ) : (
                          <>
                            <span className="text-slate-700 font-medium">{item.name}</span>
                            <div className="flex gap-6 items-center">
                              <span className="font-mono text-slate-500 font-bold">¥{item.price}</span>
                              <div className="flex gap-1">
                                <button onClick={() => startEditItem(item, cat.id)} className="text-slate-300 hover:text-blue-500 p-1.5 rounded hover:bg-blue-50 transition-colors"><Edit2 size={16}/></button>
                                <button onClick={() => deleteItem(cat.id, item.id)} className="text-slate-300 hover:text-red-500 p-1.5 rounded hover:bg-red-50 transition-colors"><X size={16}/></button>
                              </div>
                            </div>
                          </>
                        )}
                     </div>
                   ))}
                 </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </ModalBase>
  );
};

const ConfirmationModal = ({ title, message, onConfirm, onCancel }: { title: string, message: string, onConfirm: () => void, onCancel: () => void }) => (
  <ModalBase title={title} onClose={onCancel} size="md">
    <div className="space-y-6">
       <div className="flex items-start gap-4 p-4 bg-red-50 rounded-lg text-red-800 border border-red-100">
          <AlertTriangle className="flex-shrink-0 mt-1 text-red-600" size={24}/>
          <p className="text-lg leading-relaxed font-medium">{message}</p>
       </div>
       <div className="flex justify-end gap-4 pt-2">
          <Button variant="secondary" onClick={onCancel} size="lg">取消</Button>
          <Button variant="danger" onClick={onConfirm} size="lg">确认删除</Button>
       </div>
    </div>
  </ModalBase>
);

const AddPatientModal = ({ patients, onSelectPatient, onClose, onSuccess }: { patients: Patient[], onSelectPatient: (id: string) => void, onClose: () => void, onSuccess: () => void }) => {
  const [form, setForm] = useState({ name: '', phone: '', gender: '男', age: '' });
  const [error, setError] = useState('');
  const nameQuery = form.name.trim().toLowerCase();

  const similarPatients = useMemo(() => {
    if (!nameQuery) return [];
    return patients
      .filter(patient => {
        const name = patient.name.toLowerCase();
        if (name.includes(nameQuery) || nameQuery.includes(name)) return true;
        if (/^[a-zA-Z]+$/.test(nameQuery) && pinyin && typeof pinyin.convertToPinyin === 'function') {
          const fullPinyin = pinyin.convertToPinyin(patient.name, ' ', true);
          const initials = fullPinyin.split(' ').map((s: string) => s[0]).join('');
          return fullPinyin.replace(/\s/g, '').includes(nameQuery) || initials.includes(nameQuery);
        }
        return false;
      })
      .slice(0, 5);
  }, [patients, nameQuery]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = form.name.trim();
    const cleanPhone = form.phone.trim();
    
    if (!cleanName) {
      setError('姓名是必填项');
      return;
    }
    const result = clinicService.addPatient({
      ...form,
      name: cleanName,
      phone: cleanPhone,
      age: form.age.trim(),
      treatments: [],
      appointments: []
    });

    if (result.merged) alert('该电话号码已存在，已归并到同一个患者档案。');
    onSuccess();
  };

  return (
    <ModalBase title="新增患者档案" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && <div className="p-3 bg-red-50 text-red-600 text-base rounded-lg border border-red-100">{error}</div>}
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">姓名</label>
          <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none" 
            value={form.name} onChange={e => { setError(''); setForm({...form, name: e.target.value}); }} autoFocus />
          {similarPatients.length > 0 && (
            <div className="mt-3 rounded-lg border border-teal-100 bg-teal-50/60 overflow-hidden">
              <div className="px-4 py-2 text-sm font-medium text-teal-800 border-b border-teal-100">
                已有相似患者，点击可直接查看档案
              </div>
              <div className="divide-y divide-teal-100">
                {similarPatients.map(patient => (
                  <button
                    key={patient.id}
                    type="button"
                    onClick={() => onSelectPatient(patient.id)}
                    className="w-full px-4 py-3 text-left hover:bg-white transition-colors flex items-center justify-between gap-4"
                  >
                    <span className="font-bold text-slate-800">{patient.name}</span>
                    <span className="text-sm font-mono text-slate-500">{patient.phone || '未填写电话'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div>
          <label className="block text-base font-bold text-slate-700 mb-2">电话 (可选)</label>
          <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none" 
            value={form.phone} onChange={e => setForm({...form, phone: e.target.value.replace(/\s/g, '')})} />
        </div>
        <div className="grid grid-cols-2 gap-6">
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">性别</label>
            <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]" 
              value={form.gender} onChange={e => setForm({...form, gender: e.target.value})}>
              <option value="男">男</option>
              <option value="女">女</option>
            </select>
          </div>
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">年龄</label>
            <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none h-[54px]" type="number"
              value={form.age} onChange={e => setForm({...form, age: e.target.value})} />
          </div>
        </div>
        <div className="pt-6 flex justify-end gap-4">
          <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
          <Button type="submit" size="lg">保存患者</Button>
        </div>
      </form>
    </ModalBase>
  );
};

const AddTreatmentModal = ({ phone, onClose, onSuccess }: { phone: string, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());
  const [selectedCatId, setSelectedCatId] = useState(catalog.length > 0 ? catalog[0].id : '');
  const [selectedItemId, setSelectedItemId] = useState('');
  
  const [price, setPrice] = useState(0);
  const [teeth, setTeeth] = useState('');
  const [note, setNote] = useState('');

  // Update items when category changes
  useEffect(() => {
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat && cat.items.length > 0) {
      setSelectedItemId(cat.items[0].id);
      setPrice(cat.items[0].price);
    } else {
      setSelectedItemId('');
      setPrice(0);
    }
  }, [selectedCatId, catalog]);

  // Update price when item changes
  useEffect(() => {
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat) {
      const item = cat.items.find(i => i.id === selectedItemId);
      if (item) {
        setPrice(item.price);
      }
    }
  }, [selectedItemId, selectedCatId, catalog]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!teeth) {
      alert("请选择牙位");
      return;
    }
    const cat = catalog.find(c => c.id === selectedCatId);
    const item = cat?.items.find(i => i.id === selectedItemId);
    
    if (item) {
      clinicService.addTreatment(phone, item, price, teeth, note.trim(), selectedCatId);
      onSuccess();
    }
  };

  const currentCategory = catalog.find(c => c.id === selectedCatId);

  return (
    <ModalBase title="新增处置记录" onClose={onClose} size="2xl">
      <form onSubmit={handleSubmit} className="space-y-6 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_220px_minmax(260px,0.9fr)] gap-4 lg:gap-6 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">分类</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedCatId} onChange={e => setSelectedCatId(e.target.value)}>
                 {catalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">项目</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                 {currentCategory?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
               </select>
            </div>
          </div>
          
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">价格 (¥)</label>
            <input type="number" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none font-mono h-[54px]"
              value={price} onChange={e => setPrice(parseFloat(e.target.value))} />
            <p className="text-sm text-slate-400 mt-2">原价: ¥{currentCategory?.items.find(i => i.id === selectedItemId)?.price || 0}</p>
          </div>

          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">备注 (可选)</label>
            <textarea className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none min-h-[54px] h-[54px] lg:h-[92px] resize-none"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col min-w-0">
           <label className="block text-base font-bold text-slate-700 mb-4 flex flex-wrap items-center gap-2">
             <Smile size={20} className="text-teal-600"/>
             选择牙位 
             <span className="text-sm font-normal text-slate-400 ml-2">(支持拖动多选)</span>
           </label>
           <div className="flex-1 flex items-center justify-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-2 sm:p-4 min-w-0">
             <ToothSelector value={teeth} onChange={setTeeth} />
           </div>
        </div>

        <div className="pt-2 flex flex-wrap justify-end gap-3">
           <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
           <Button type="submit" size="lg">提交记录</Button>
        </div>
      </form>
    </ModalBase>
  );
};

const EditTreatmentModal = ({ phone, record, onClose, onSuccess }: { phone: string, record: TreatmentRecord, onClose: () => void, onSuccess: () => void }) => {
  const [catalog] = useState(clinicService.getCatalog());
  const [selectedCatId, setSelectedCatId] = useState('');
  const [selectedItemId, setSelectedItemId] = useState('');
  
  const [price, setPrice] = useState(record.price);
  const [teeth, setTeeth] = useState(record.teeth);
  const [note, setNote] = useState(record.note);
  const [initialLoad, setInitialLoad] = useState(true);

  // Initialize form with existing record data
  useEffect(() => {
    let foundCatId = '';
    let foundItemId = '';
    
    // Try to find the item in current catalog
    for (const cat of catalog) {
      const foundItem = cat.items.find(i => i.id === record.itemId || i.name === record.item);
      if (foundItem) {
        foundCatId = cat.id;
        foundItemId = foundItem.id;
        break;
      }
    }
    
    // If found, select it. If not (maybe catalog changed), default to first to avoid empty state,
    // or we could keep it empty but for simplicity let's default to first if existing is invalid.
    if (foundCatId && foundItemId) {
      setSelectedCatId(foundCatId);
      setSelectedItemId(foundItemId);
    } else if (catalog.length > 0) {
      setSelectedCatId(catalog[0].id);
      if (catalog[0].items.length > 0) setSelectedItemId(catalog[0].items[0].id);
    }
    
    // Disable initial load flag after a short delay to allow 'price' effect to be skipped once
    setTimeout(() => setInitialLoad(false), 50);
  }, [record, catalog]);

  // Update items when category changes (user interaction)
  useEffect(() => {
    if (initialLoad) return;
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat && cat.items.length > 0) {
      setSelectedItemId(cat.items[0].id);
      // Also update price to default when category changes manually
      setPrice(cat.items[0].price);
    } else {
      setSelectedItemId('');
      setPrice(0);
    }
  }, [selectedCatId, catalog, initialLoad]);

  // Update price when item changes (user interaction)
  useEffect(() => {
    if (initialLoad) return;
    const cat = catalog.find(c => c.id === selectedCatId);
    if (cat) {
      const item = cat.items.find(i => i.id === selectedItemId);
      if (item) {
        setPrice(item.price);
      }
    }
  }, [selectedItemId, selectedCatId, catalog, initialLoad]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if(!teeth) {
      alert("请选择牙位");
      return;
    }
    const cat = catalog.find(c => c.id === selectedCatId);
    const item = cat?.items.find(i => i.id === selectedItemId);
    
    // We use the selected item name, or fallback to record.item if something is wrong (shouldn't happen with valid catalog)
    const itemName = item ? item.name : record.item;
    
    const success = clinicService.updateTreatment(phone, record.id, {
      categoryId: selectedCatId,
      itemId: item?.id,
      item: itemName,
      price: price,
      teeth: teeth,
      note: note.trim()
    });

    if (success) {
      onSuccess();
    } else {
      alert("更新失败");
    }
  };

  const currentCategory = catalog.find(c => c.id === selectedCatId);

  return (
    <ModalBase title="编辑处置记录" onClose={onClose} size="2xl">
      <form onSubmit={handleSubmit} className="space-y-6 min-h-0">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,1fr)_220px_minmax(260px,0.9fr)] gap-4 lg:gap-6 items-start">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">分类</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedCatId} onChange={e => setSelectedCatId(e.target.value)}>
                 {catalog.map(cat => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
               </select>
            </div>
            <div>
               <label className="block text-base font-bold text-slate-700 mb-2">项目</label>
               <select className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white h-[54px]"
                 value={selectedItemId} onChange={e => setSelectedItemId(e.target.value)}>
                 {currentCategory?.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
               </select>
            </div>
          </div>
          
          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">价格 (¥)</label>
            <input type="number" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg focus:ring-2 focus:ring-teal-500 outline-none font-mono h-[54px]"
              value={price} onChange={e => setPrice(parseFloat(e.target.value))} />
            <p className="text-sm text-slate-400 mt-2">原价: ¥{currentCategory?.items.find(i => i.id === selectedItemId)?.price || 0}</p>
          </div>

          <div>
            <label className="block text-base font-bold text-slate-700 mb-2">备注 (可选)</label>
            <textarea className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none min-h-[54px] h-[54px] lg:h-[92px] resize-none"
              value={note} onChange={e => setNote(e.target.value)} />
          </div>
        </div>

        <div className="flex flex-col min-w-0">
           <label className="block text-base font-bold text-slate-700 mb-4 flex flex-wrap items-center gap-2">
             <Smile size={20} className="text-teal-600"/>
             选择牙位 
             <span className="text-sm font-normal text-slate-400 ml-2">(支持拖动多选)</span>
           </label>
           <div className="flex-1 flex items-center justify-center bg-slate-50/50 rounded-2xl border-2 border-dashed border-slate-200 p-2 sm:p-4 min-w-0">
             <ToothSelector value={teeth} onChange={setTeeth} />
           </div>
        </div>

        <div className="pt-2 flex flex-wrap justify-end gap-3">
           <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
           <Button type="submit" size="lg">保存更改</Button>
        </div>
      </form>
    </ModalBase>
  );
};

const AddAppointmentModal = ({ phone, defaultName, onClose, onSuccess }: { phone: string, defaultName: string, onClose: () => void, onSuccess: () => void }) => {
  const [date, setDate] = useState(formatDateKey(new Date()));
  const [time, setTime] = useState('09:00');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !time) return;
    
    clinicService.addAppointment(phone, date, time);
    onSuccess();
  };

  return (
    <ModalBase title="新增预约" onClose={onClose} size="md">
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">患者姓名</label>
           <div className="text-lg text-slate-900 font-medium px-4 py-3 bg-slate-50 rounded-lg border border-slate-200">{defaultName}</div>
        </div>
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">预约日期</label>
           <input type="date" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
             value={date} onChange={e => setDate(e.target.value)} required />
        </div>
        <div>
           <label className="block text-base font-bold text-slate-700 mb-2">预约时间</label>
           <input type="time" className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
             value={time} onChange={e => setTime(e.target.value)} required />
        </div>
        <div className="pt-4 flex justify-end gap-4">
           <Button type="button" variant="secondary" onClick={onClose} size="lg">取消</Button>
           <Button type="submit" size="lg">确认预约</Button>
        </div>
      </form>
    </ModalBase>
  );
};
