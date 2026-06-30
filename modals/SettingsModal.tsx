import React, { useEffect, useRef, useState } from 'react';
import { Check, Download, Edit2, ExternalLink, Plus, RefreshCw, Save, Settings, Trash2, Upload, X } from 'lucide-react';
import { APP_VERSION } from '../constants';
import { clinicService } from '../services/clinicService';
import { CloudSyncResult, ImportPreview, ReleaseCheckResult, TreatmentCategory, TreatmentItem } from '../types';
import { Button } from '../components/Button';
import { ModalBase } from './ModalBase';
import { ConfirmationModal } from './ConfirmationModal';
import { getErrorStatusClass, getSuccessStatusClass } from '../utils/statusStyles';

export const SettingsModal = ({ onClose, onRefresh, currentClinicName }: { onClose: () => void, onRefresh: () => void, currentClinicName: string }) => {
  const [tab, setTab] = useState<'data' | 'catalog'>('data');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [clinicNameForm, setClinicNameForm] = useState(currentClinicName);
  const [backupSettings, setBackupSettings] = useState(clinicService.getBackupSettings());
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSendingBackup, setIsSendingBackup] = useState(false);
  const [cloudSyncSettings, setCloudSyncSettings] = useState(clinicService.getCloudSyncSettings());
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncResult | null>(null);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [releaseSettings, setReleaseSettings] = useState(clinicService.getReleaseSettings());
  const [releaseStatus, setReleaseStatus] = useState<ReleaseCheckResult | null>(null);
  const [isCheckingRelease, setIsCheckingRelease] = useState(false);
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);
  const [pendingImportPreview, setPendingImportPreview] = useState<ImportPreview | null>(null);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasPreImportBackup, setHasPreImportBackup] = useState(clinicService.hasPreImportBackup());
  const [storageStatus] = useState(clinicService.getStorageStatus());

  // 处置目录直接影响新增处置时的默认价格。
  const [catalog, setCatalog] = useState<TreatmentCategory[]>(clinicService.getCatalog());
  const [newCatName, setNewCatName] = useState('');

  // 新增项目的临时表单状态。
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemForm, setNewItemForm] = useState({ name: '', price: 0 });

  // 编辑项目时只保存当前项目的局部状态。
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

  const handleSaveCloudSyncSettings = () => {
    clinicService.updateCloudSyncSettings(cloudSyncSettings);
    setCloudSyncStatus({ success: true, message: '云端同步配置已保存。' });
  };

  const handlePullCloudData = async () => {
    if (!confirm('从云端同步会覆盖本机数据，确定继续吗？')) return;
    setIsPullingCloud(true);
    setCloudSyncStatus(null);
    clinicService.updateCloudSyncSettings(cloudSyncSettings);
    const result = await clinicService.pullCloudData(cloudSyncSettings);
    setCloudSyncStatus(result);
    if (result.success) onRefresh();
    setIsPullingCloud(false);
  };

  const handlePushCloudData = async () => {
    setIsPushingCloud(true);
    setCloudSyncStatus(null);
    clinicService.updateCloudSyncSettings(cloudSyncSettings);
    const result = await clinicService.pushCloudData(cloudSyncSettings);
    setCloudSyncStatus(result);
    setIsPushingCloud(false);
  };

  const handleSaveReleaseSettings = () => {
    clinicService.updateReleaseSettings(releaseSettings);
    setReleaseStatus({
      success: true,
      updateAvailable: false,
      currentVersion: APP_VERSION,
      message: '更新接口配置已保存。'
    });
  };

  const handleCheckRelease = async (settings = releaseSettings) => {
    setIsCheckingRelease(true);
    clinicService.updateReleaseSettings(settings);
    const result = await clinicService.checkLatestRelease(settings);
    setReleaseStatus(result);
    setIsCheckingRelease(false);
  };

  useEffect(() => {
    if (releaseSettings.autoCheck) {
      handleCheckRelease(releaseSettings);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
          setImportStatus(null);
          const content = event.target.result as string;
          const result = clinicService.createImportPreview(content);
          if (!result.success || !result.preview) {
            setPendingImportContent(null);
            setPendingImportPreview(null);
            setImportStatus({ type: 'error', message: result.message });
            return;
          }
          setPendingImportContent(content);
          setPendingImportPreview(result.preview);
          setImportStatus({ type: 'success', message: result.message });
        }
      };
    }
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!pendingImportContent) return;
    const result = await clinicService.importData(pendingImportContent);
    setPendingImportContent(null);
    setPendingImportPreview(null);
    setImportStatus({ type: result.success ? 'success' : 'error', message: result.message });
    if (result.success) {
      setHasPreImportBackup(clinicService.hasPreImportBackup());
      onRefresh();
    }
  };

  const cancelImportPreview = () => {
    setPendingImportContent(null);
    setPendingImportPreview(null);
  };

  const confirmRestorePreImportBackup = async () => {
    const result = await clinicService.restorePreImportBackup();
    setShowRestoreConfirm(false);
    setImportStatus({ type: result.success ? 'success' : 'error', message: result.message });
    if (result.success) onRefresh();
  };

  // 目录维护逻辑：先在弹窗本地编辑，点击保存后统一写入本地数据。
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

  // 项目新增与编辑都保留在设置弹窗内，避免污染全局状态。
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
            <div className="mt-5 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
              当前主存储：{storageStatus.primary === 'sqlite' ? 'SQLite' : 'localStorage'}。{storageStatus.message}
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
              <RefreshCw size={24} className="text-teal-600" /> 应用更新
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 mb-2 font-medium">GitHub Release 接口</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  value={releaseSettings.endpoint}
                  onChange={e => {
                    setReleaseSettings({ ...releaseSettings, endpoint: e.target.value });
                    setReleaseStatus(null);
                  }}
                />
              </div>
              <label className="inline-flex items-center gap-3 text-slate-700 font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  checked={releaseSettings.autoCheck}
                  onChange={e => {
                    const next = { ...releaseSettings, autoCheck: e.target.checked };
                    setReleaseSettings(next);
                    clinicService.updateReleaseSettings(next);
                  }}
                />
                打开设置时自动检测
              </label>
              {releaseStatus && (
                <div className={`rounded-lg border px-4 py-3 text-base ${
                  releaseStatus.success
                    ? releaseStatus.updateAvailable
                      ? 'border-amber-200 bg-amber-50 text-amber-800'
                      : 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  <div className="font-bold">{releaseStatus.message}</div>
                  <div className="mt-1 text-sm opacity-80">
                    当前 v{releaseStatus.currentVersion}
                    {releaseStatus.latestVersion ? ` · 最新 v${releaseStatus.latestVersion}` : ''}
                  </div>
                  {releaseStatus.releaseUrl && (
                    <a
                      href={releaseStatus.releaseUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-3 inline-flex items-center gap-1 font-bold underline underline-offset-2"
                    >
                      打开 Release <ExternalLink size={15} />
                    </a>
                  )}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveReleaseSettings} variant="secondary" size="lg">保存更新接口</Button>
                <Button onClick={() => handleCheckRelease()} size="lg" disabled={isCheckingRelease}>
                  {isCheckingRelease ? '检测中...' : '立即检测更新'}
                </Button>
              </div>
            </div>
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
              <RefreshCw size={24} className="text-teal-600" /> 云端同步
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 mb-2 font-medium">同步接口地址</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://your-domain.example.com/sync"
                  value={cloudSyncSettings.endpoint}
                  onChange={e => {
                    setCloudSyncSettings({ ...cloudSyncSettings, endpoint: e.target.value });
                    setCloudSyncStatus(null);
                  }}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-2 font-medium">同步 Key</label>
                <input
                  type="password"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  value={cloudSyncSettings.key}
                  onChange={e => {
                    setCloudSyncSettings({ ...cloudSyncSettings, key: e.target.value });
                    setCloudSyncStatus(null);
                  }}
                />
              </div>
              {cloudSyncStatus && (
                <div className={`rounded-lg border px-4 py-3 text-base ${
                  cloudSyncStatus.success
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  {cloudSyncStatus.message}
                </div>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleSaveCloudSyncSettings} variant="secondary" size="lg">保存同步配置</Button>
                <Button onClick={handlePullCloudData} size="lg" disabled={isPullingCloud || isPushingCloud}>
                  {isPullingCloud ? '同步中...' : '从云端同步'}
                </Button>
                <Button onClick={handlePushCloudData} variant="secondary" size="lg" disabled={isPullingCloud || isPushingCloud}>
                  {isPushingCloud ? '上传中...' : '上传本机数据'}
                </Button>
              </div>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-lg">
              <Upload size={24} className="text-blue-600" /> 导入数据
            </h4>
            <p className="text-base text-slate-500 mb-6">从备份的JSON文件中恢复数据 (会覆盖当前数据)。</p>
            {importStatus && (
              <div className={`mb-4 rounded-lg border px-4 py-3 text-base ${
                importStatus.type === 'success' ? getSuccessStatusClass() : getErrorStatusClass()
              }`}>
                {importStatus.message}
              </div>
            )}
            <input
              type="file"
              accept=".json"
              ref={fileInputRef}
              style={{ display: 'none' }}
              onChange={handleImport}
            />
            <Button variant="secondary" onClick={() => fileInputRef.current?.click()} size="lg">选择文件导入</Button>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-2 flex items-center gap-2 text-lg">
              <RefreshCw size={24} className="text-red-600" /> 恢复导入前备份
            </h4>
            <p className="text-base text-slate-500 mb-6">
              仅用于撤回最近一次导入覆盖。恢复前建议先导出当前数据。
            </p>
            {hasPreImportBackup ? (
              <Button variant="danger" onClick={() => setShowRestoreConfirm(true)} size="lg">恢复导入前备份</Button>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-400">暂无导入前备份</div>
            )}
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

      {pendingImportContent && pendingImportPreview && (
        <ModalBase title="导入预览" onClose={cancelImportPreview} size="lg">
          <div className="space-y-6">
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-amber-900">
              <div className="font-bold text-lg">确认后将覆盖当前本机数据</div>
              <div className="mt-1 text-sm leading-6">
                导入文件已完成迁移和结构校验。系统会在写入前保存导入前备份，但覆盖后的数据不能通过普通撤销恢复。
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-500">当前诊所</div>
                <div className="mt-1 font-bold text-slate-800">{pendingImportPreview.currentClinicName}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-500">导入后诊所</div>
                <div className="mt-1 font-bold text-slate-800">{pendingImportPreview.incomingClinicName}</div>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border border-slate-200">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">数据项</th>
                    <th className="px-4 py-3">当前</th>
                    <th className="px-4 py-3">导入后</th>
                    <th className="px-4 py-3 text-teal-700">新增</th>
                    <th className="px-4 py-3 text-amber-700">覆盖</th>
                    <th className="px-4 py-3 text-red-700">移除</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pendingImportPreview.metrics.map(metric => (
                    <tr key={metric.label}>
                      <td className="px-4 py-3 font-medium text-slate-800">{metric.label}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{metric.current}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{metric.incoming}</td>
                      <td className="px-4 py-3 font-mono text-teal-700">{metric.added}</td>
                      <td className="px-4 py-3 font-mono text-amber-700">{metric.overwritten}</td>
                      <td className="px-4 py-3 font-mono text-red-700">{metric.removed}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: '新增患者示例', items: pendingImportPreview.samples.addedPatients },
                { title: '覆盖患者示例', items: pendingImportPreview.samples.overwrittenPatients },
                { title: '移除患者示例', items: pendingImportPreview.samples.removedPatients }
              ].map(group => (
                <div key={group.title} className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="font-bold text-slate-700">{group.title}</div>
                  {group.items.length > 0 ? (
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {group.items.map(item => <li key={item} className="truncate">{item}</li>)}
                    </ul>
                  ) : (
                    <div className="mt-2 text-sm text-slate-400">无</div>
                  )}
                </div>
              ))}
            </div>

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="font-bold text-slate-700">风险提示</div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {pendingImportPreview.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={cancelImportPreview} size="lg">取消</Button>
              <Button variant="danger" onClick={confirmImport} size="lg">确认覆盖导入</Button>
            </div>
          </div>
        </ModalBase>
      )}

      {showRestoreConfirm && (
        <ConfirmationModal
          title="恢复导入前备份确认"
          message="恢复导入前备份会覆盖当前本机数据，并写回当前主存储。此操作不能通过普通撤销恢复，建议先导出当前数据后再继续。"
          confirmLabel="确认恢复备份"
          onConfirm={confirmRestorePreImportBackup}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
    </ModalBase>
  );
};
