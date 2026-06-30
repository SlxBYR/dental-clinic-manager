import React, { useState } from 'react';
import { Calendar, Edit2, History, Phone, Save, Stethoscope, Trash2 } from 'lucide-react';
import { clinicService } from '../services/clinicService';
import { Patient, TreatmentRecord } from '../types';
import { Button } from '../components/Button';
import { AddAppointmentModal } from '../modals/AddAppointmentModal';
import { AddTreatmentModal } from '../modals/AddTreatmentModal';
import { ConfirmationModal } from '../modals/ConfirmationModal';
import { EditTreatmentModal } from '../modals/EditTreatmentModal';
import { TreatmentChangeLogModal } from '../modals/TreatmentChangeLogModal';
import { getAppointmentStatusClass, getAppointmentStatusLabel } from '../utils/statusStyles';

export const PatientDetail = ({ patient, onBack, onRefresh }: { patient: Patient, onBack: () => void, onRefresh: () => void }) => {
  const [activeTab, setActiveTab] = useState<'info' | 'treatments' | 'appointments'>('info');
  const [showTreatmentModal, setShowTreatmentModal] = useState(false);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [editingInfo, setEditingInfo] = useState(false);
  const [editForm, setEditForm] = useState({ name: patient.name, phone: patient.phone, gender: patient.gender, age: patient.age });
  const [editError, setEditError] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // 处置编辑和删除弹窗状态集中在详情页，避免跨页面传递临时状态。
  const [editingTreatment, setEditingTreatment] = useState<TreatmentRecord | null>(null);
  const [viewingTreatmentLogs, setViewingTreatmentLogs] = useState<TreatmentRecord | null>(null);
  const [deleteTreatmentId, setDeleteTreatmentId] = useState<string | null>(null);

  const handleSaveInfo = () => {
    const cleanName = editForm.name.trim();
    const cleanPhone = editForm.phone.trim();
    if (!cleanName) {
      setEditError('姓名是必填项');
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
    // 删除患者时由服务层按 patientId 精确清理预约，避免误删同手机号家属预约。
    clinicService.deletePatient(patient.id);
    onRefresh();
    onBack();
  };

  const handleTreatmentDeleteClick = (id: string) => {
    setDeleteTreatmentId(id);
  };

  const confirmDeleteTreatment = () => {
    if (deleteTreatmentId) {
      // 处置记录删除是永久操作，入口前置了独立确认弹窗。
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
              patient.treatments.slice().reverse().map((t) => (
                <div key={t.id} className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm flex flex-col md:flex-row gap-6 hover:shadow-md transition-shadow">
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
                            <span className="bg-blue-50 text-blue-700 px-3 py-1 rounded text-sm font-bold">牙位: {t.teeth || '未指定'}</span>
                         </div>
                       </div>
                       <div className="flex gap-2">
                          <button onClick={() => setViewingTreatmentLogs(t)} className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="修改记录">
                             <History size={18} />
                          </button>
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
                   <th className="px-8 py-4 font-bold text-slate-500 text-sm">状态</th>
                 </tr>
               </thead>
               <tbody className="divide-y divide-slate-100">
                 {patient.appointments.length === 0 ? (
                   <tr><td colSpan={3} className="px-8 py-10 text-center text-slate-400">无历史预约</td></tr>
                 ) : (
                   patient.appointments.map((a, i) => (
                     <tr key={a.id || i}>
                       <td className="px-8 py-5 font-bold text-slate-700">{a.datetime}</td>
                       <td className="px-8 py-5 text-slate-500 text-base">{a.created_at}</td>
                       <td className="px-8 py-5">
                         <span className={`inline-flex rounded-full px-3 py-1 text-sm font-medium ${getAppointmentStatusClass(a.status || 'pending')}`}>
                           {getAppointmentStatusLabel(a.status || 'pending')}
                         </span>
                       </td>
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

      {viewingTreatmentLogs && (
        <TreatmentChangeLogModal
          record={viewingTreatmentLogs}
          onClose={() => setViewingTreatmentLogs(null)}
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
           message={`将永久删除患者 ${patient.name} 的档案、所有处置记录、预约历史，并同步清理全局预约表中明确关联该患者的预约。此操作不可恢复，不会删除同号码其他患者的预约。`}
           confirmLabel="永久删除患者"
           onConfirm={handleConfirmDelete}
           onCancel={() => setShowDeleteConfirm(false)}
        />
      )}

      {deleteTreatmentId && (
        <ConfirmationModal
          title="删除处置记录确认"
          message="将永久删除这条处置记录，包括项目、价格、牙位和备注信息。此操作不可恢复。"
          confirmLabel="永久删除处置"
          onConfirm={confirmDeleteTreatment}
          onCancel={() => setDeleteTreatmentId(null)}
        />
      )}
    </div>
  );
};
