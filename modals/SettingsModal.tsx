import React, { useEffect, useRef, useState } from 'react';
import { Bot, Check, Database, Download, Edit2, ExternalLink, Plus, RefreshCw, Save, Settings, Trash2, Upload, X } from 'lucide-react';
import { APP_VERSION } from '../constants';
import { clinicService } from '../services/clinicService';
import { aiService } from '../services/aiService';
import { externalRagSourceService } from '../services/externalRagSourceService';
import { BackupSettings, CloudSyncResult, CloudSyncSettings, ImportConflictResolution, ImportPreview, RagExternalSourceConfig, ReleaseCheckResult, TreatmentCategory, TreatmentItem } from '../types';
import { Button } from '../components/Button';
import { ModalBase } from './ModalBase';
import { ConfirmationModal } from './ConfirmationModal';
import { getErrorStatusClass, getSuccessStatusClass } from '../utils/statusStyles';

const replaceWorkerActionPath = (rawEndpoint: string, action: 'backup' | 'sync') => {
  const trimmed = rawEndpoint.trim();
  if (!trimmed) return '';
  try {
    const url = new URL(trimmed);
    const path = url.pathname.replace(/\/+$/, '');
    if (/\/(backup|sync)$/.test(path)) url.pathname = path.replace(/\/(backup|sync)$/, `/${action}`);
    else url.pathname = `${path}/${action}`.replace(/^\/$/, `/${action}`);
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return trimmed;
  }
};

const getCloudSyncSettingsFromBackup = (settings: BackupSettings): CloudSyncSettings => ({
  endpoint: replaceWorkerActionPath(settings.endpoint, 'sync'),
  key: settings.token?.trim() || ''
});

const getInitialBackupSettings = (): BackupSettings => {
  const backup = clinicService.getBackupSettings();
  if (backup.endpoint || backup.token) return backup;
  const legacySync = clinicService.getCloudSyncSettings();
  return {
    endpoint: replaceWorkerActionPath(legacySync.endpoint, 'backup'),
    token: legacySync.key
  };
};

export const SettingsModal = ({ onClose, onRefresh, currentClinicName }: { onClose: () => void, onRefresh: () => void, currentClinicName: string }) => {
  const [tab, setTab] = useState<'data' | 'ai' | 'external' | 'catalog'>('data');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isMountedRef = useRef(true);
  const [clinicNameForm, setClinicNameForm] = useState(currentClinicName);
  const [backupSettings, setBackupSettings] = useState(getInitialBackupSettings);
  const [backupStatus, setBackupStatus] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  const [isSendingBackup, setIsSendingBackup] = useState(false);
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncResult | null>(null);
  const [isPullingCloud, setIsPullingCloud] = useState(false);
  const [isPushingCloud, setIsPushingCloud] = useState(false);
  const [releaseSettings, setReleaseSettings] = useState(clinicService.getReleaseSettings());
  const [releaseStatus, setReleaseStatus] = useState<ReleaseCheckResult | null>(null);
  const [isCheckingRelease, setIsCheckingRelease] = useState(false);
  const [pendingImportContent, setPendingImportContent] = useState<string | null>(null);
  const [pendingImportPreview, setPendingImportPreview] = useState<ImportPreview | null>(null);
  const [pendingImportSource, setPendingImportSource] = useState<'file' | 'cloud'>('file');
  const [importConflictResolution, setImportConflictResolution] = useState<ImportConflictResolution>('local');
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [importStatus, setImportStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [hasPreImportBackup, setHasPreImportBackup] = useState(clinicService.hasPreImportBackup());
  const [storageStatus] = useState(clinicService.getStorageStatus());
  const [aiSettings, setAiSettings] = useState(aiService.getSettings());
  const [aiStatus, setAiStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [externalSources, setExternalSources] = useState<RagExternalSourceConfig[]>(externalRagSourceService.getSources());
  const [externalStatus, setExternalStatus] = useState<Record<string, { type: 'success' | 'error'; message: string }>>({});
  const [syncingExternalSourceId, setSyncingExternalSourceId] = useState<string | null>(null);

  // 处置目录直接影响新增处置时的默认价格。
  const [catalog, setCatalog] = useState<TreatmentCategory[]>(clinicService.getCatalog());
  const [newCatName, setNewCatName] = useState('');

  // 新增项目的临时表单状态。
  const [addingItemTo, setAddingItemTo] = useState<string | null>(null);
  const [newItemForm, setNewItemForm] = useState({ name: '', price: 0 });

  // 编辑项目时只保存当前项目的局部状态。
  const [editingItem, setEditingItem] = useState<{catId: string, itemId: string} | null>(null);
  const [editItemForm, setEditItemForm] = useState({ name: '', price: 0 });

  useEffect(() => () => {
    isMountedRef.current = false;
  }, []);

  const handleSaveClinicName = () => {
    clinicService.updateClinicName(clinicNameForm.trim());
    alert('诊所名称已更新');
    onRefresh();
  };

  const handleSaveBackupSettings = () => {
    const normalizedBackupSettings = {
      ...backupSettings,
      endpoint: replaceWorkerActionPath(backupSettings.endpoint, 'backup')
    };
    setBackupSettings(normalizedBackupSettings);
    clinicService.updateBackupSettings(normalizedBackupSettings);
    clinicService.updateCloudSyncSettings(getCloudSyncSettingsFromBackup(normalizedBackupSettings));
    setBackupStatus({ type: 'success', message: '云端接口配置已保存。' });
  };

  const handleSendBackup = async () => {
    setIsSendingBackup(true);
    setBackupStatus(null);
    const normalizedBackupSettings = {
      ...backupSettings,
      endpoint: replaceWorkerActionPath(backupSettings.endpoint, 'backup')
    };
    setBackupSettings(normalizedBackupSettings);
    clinicService.updateBackupSettings(normalizedBackupSettings);
    clinicService.updateCloudSyncSettings(getCloudSyncSettingsFromBackup(normalizedBackupSettings));
    const result = await clinicService.sendBackupToServer(normalizedBackupSettings);
    if (!isMountedRef.current) return;
    setBackupStatus({ type: result.success ? 'success' : 'error', message: result.message });
    setIsSendingBackup(false);
  };

  const handlePullCloudData = async () => {
    setIsPullingCloud(true);
    setCloudSyncStatus(null);
    const cloudSyncSettings = getCloudSyncSettingsFromBackup(backupSettings);
    clinicService.updateCloudSyncSettings(cloudSyncSettings);
    const result = await clinicService.pullCloudData(cloudSyncSettings);
    if (!isMountedRef.current) return;
    setCloudSyncStatus(result);
    if (result.success && result.importContent && result.preview) {
      setPendingImportSource('cloud');
      setPendingImportContent(result.importContent);
      setPendingImportPreview(result.preview);
      setImportConflictResolution('local');
    }
    setIsPullingCloud(false);
  };

  const handlePushCloudData = async () => {
    if (!confirm('直接上传会用当前本机数据替换云端最新数据，只建议首次初始化云端或明确需要覆盖时使用。确定继续吗？')) return;
    setIsPushingCloud(true);
    setCloudSyncStatus(null);
    const cloudSyncSettings = getCloudSyncSettingsFromBackup(backupSettings);
    clinicService.updateCloudSyncSettings(cloudSyncSettings);
    const result = await clinicService.pushCloudData(cloudSyncSettings);
    if (!isMountedRef.current) return;
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
    if (!isMountedRef.current) return;
    setReleaseStatus(result);
    setIsCheckingRelease(false);
  };

  const handleSaveAiSettings = async () => {
    try {
      await aiService.updateSettings(aiSettings);
      setAiSettings(aiService.getSettings());
      setAiStatus({ type: 'success', message: aiSettings.enabled ? 'AI 设置已保存。' : 'AI 已保持关闭。' });
    } catch (error) {
      setAiStatus({ type: 'error', message: error instanceof Error ? error.message : 'AI 设置保存失败。' });
    }
  };

  const updateExternalSource = (sourceId: string, updates: Partial<RagExternalSourceConfig>) => {
    setExternalSources(prev => prev.map(source => source.id === sourceId ? { ...source, ...updates } : source));
    setExternalStatus(prev => {
      const next = { ...prev };
      delete next[sourceId];
      return next;
    });
  };

  const addExternalSource = () => {
    const source = externalRagSourceService.createSource();
    setExternalSources(prev => [source, ...prev]);
  };

  const saveExternalSource = async (source: RagExternalSourceConfig) => {
    const saved = await externalRagSourceService.upsertSource(source);
    setExternalSources(externalRagSourceService.getSources());
    setExternalStatus(prev => ({
      ...prev,
      [saved.id]: { type: 'success', message: '外部数据源配置已保存。' }
    }));
  };

  const deleteExternalSource = async (sourceId: string) => {
    if (!confirm('确定删除这个外部数据源配置吗？已同步的 RAG 条目不会自动删除。')) return;
    await externalRagSourceService.deleteSource(sourceId);
    setExternalSources(externalRagSourceService.getSources());
  };

  const testExternalSource = async (source: RagExternalSourceConfig) => {
    const saved = await externalRagSourceService.upsertSource(source);
    setExternalSources(externalRagSourceService.getSources());
    setSyncingExternalSourceId(saved.id);
    const result = await externalRagSourceService.testConnection(saved);
    if (!isMountedRef.current) return;
    setExternalStatus(prev => ({
      ...prev,
      [saved.id]: { type: result.success ? 'success' : 'error', message: result.message }
    }));
    if (result.success) onRefresh();
    setSyncingExternalSourceId(null);
  };

  const syncExternalSource = async (source: RagExternalSourceConfig) => {
    const saved = await externalRagSourceService.upsertSource(source);
    setExternalSources(externalRagSourceService.getSources());
    setSyncingExternalSourceId(saved.id);
    const result = await externalRagSourceService.syncSource(saved);
    if (!isMountedRef.current) return;
    setExternalSources(externalRagSourceService.getSources());
    setExternalStatus(prev => ({
      ...prev,
      [saved.id]: { type: result.success ? 'success' : 'error', message: result.message }
    }));
    if (result.success) onRefresh();
    setSyncingExternalSourceId(null);
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
          setPendingImportSource('file');
          setImportConflictResolution('local');
          const result = clinicService.createImportPreview(content, 'local', 'file');
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
    if (!pendingImportContent || !pendingImportPreview) return;
    const source = pendingImportSource;
    const result = await clinicService.importData(
      pendingImportContent,
      importConflictResolution,
      pendingImportPreview.localFingerprint,
      source
    );
    if (source === 'cloud') setCloudSyncStatus({ success: result.success, message: result.message });
    else setImportStatus({ type: result.success ? 'success' : 'error', message: result.message });
    if (result.success) {
      if (source === 'cloud') {
        setIsPushingCloud(true);
        const cloudSyncSettings = getCloudSyncSettingsFromBackup(backupSettings);
        const pushResult = await clinicService.pushCloudData(cloudSyncSettings);
        if (isMountedRef.current) {
          setCloudSyncStatus({
            success: pushResult.success,
            message: pushResult.success
              ? `${result.message} 合并结果已重新上传，所有设备可继续从同一基线同步。`
              : `${result.message} 本机合并已完成，但合并结果未能回传云端：${pushResult.message}`
          });
          setIsPushingCloud(false);
        }
      }
      setPendingImportContent(null);
      setPendingImportPreview(null);
      setPendingImportSource('file');
      setImportConflictResolution('local');
      setHasPreImportBackup(clinicService.hasPreImportBackup());
      onRefresh();
    } else {
      const refreshedPreview = clinicService.createImportPreview(pendingImportContent, importConflictResolution, source);
      if (refreshedPreview.success && refreshedPreview.preview) setPendingImportPreview(refreshedPreview.preview);
    }
  };

  const cancelImportPreview = () => {
    setPendingImportContent(null);
    setPendingImportPreview(null);
    setPendingImportSource('file');
    setImportConflictResolution('local');
  };

  const changeImportConflictResolution = (resolution: ImportConflictResolution) => {
    setImportConflictResolution(resolution);
    if (!pendingImportContent) return;
    const refreshedPreview = clinicService.createImportPreview(pendingImportContent, resolution, pendingImportSource);
    if (refreshedPreview.success && refreshedPreview.preview) setPendingImportPreview(refreshedPreview.preview);
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
        <button onClick={() => setTab('ai')} className={`pb-3 px-2 text-lg font-medium transition-colors ${tab === 'ai' ? 'border-b-2 border-teal-600 text-teal-800' : 'text-slate-500 hover:text-slate-700'}`}>AI 设置</button>
        <button onClick={() => setTab('external')} className={`pb-3 px-2 text-lg font-medium transition-colors ${tab === 'external' ? 'border-b-2 border-teal-600 text-teal-800' : 'text-slate-500 hover:text-slate-700'}`}>外部数据源</button>
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
                 <label className="block text-slate-600 mb-2 font-medium">诊所名称</label>
                 <input className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500" value={clinicNameForm} onChange={e => setClinicNameForm(e.target.value)} />
              </div>
              <Button onClick={handleSaveClinicName} size="lg">保存名称</Button>
            </div>
          </div>

          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-5 flex items-center gap-2 text-lg">
              <Database size={24} className="text-teal-600" /> 本地数据管理
            </h4>
            {importStatus && (
              <div className={`mb-5 rounded-lg border px-4 py-3 text-base ${
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
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
                  <Download size={20} className="text-teal-600" /> 导出数据
                </div>
                <p className="mb-5 flex-1 text-sm leading-6 text-slate-500">将当前诊所数据导出为 JSON 文件。</p>
                <Button onClick={handleExport} size="lg" className="w-full">导出 JSON</Button>
              </div>

              <div className="flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
                  <Upload size={20} className="text-blue-600" /> 导入数据
                </div>
                <p className="mb-5 flex-1 text-sm leading-6 text-slate-500">选择 JSON 备份，预览后增量合并到本机。</p>
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} size="lg" className="w-full">选择文件导入</Button>
              </div>

              <div className="flex min-h-40 flex-col rounded-xl border border-slate-200 bg-white p-5">
                <div className="mb-2 flex items-center gap-2 font-bold text-slate-800">
                  <RefreshCw size={20} className="text-red-600" /> 恢复备份
                </div>
                <p className="mb-5 flex-1 text-sm leading-6 text-slate-500">撤回最近一次导入或云端增量更新。</p>
                {hasPreImportBackup ? (
                  <Button variant="danger" onClick={() => setShowRestoreConfirm(true)} size="lg" className="w-full">恢复更新前备份</Button>
                ) : (
                  <div className="flex min-h-12 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 px-4 text-slate-400">暂无更新前备份</div>
                )}
              </div>
            </div>
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
              <Upload size={24} className="text-teal-600" /> 云端备份与同步配置
            </h4>
            <div className="space-y-4">
              <div>
                <label className="block text-slate-600 mb-2 font-medium">Worker 接口地址</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://your-domain.example.com/backup"
                  value={backupSettings.endpoint}
                  onChange={e => {
                    setBackupSettings({ ...backupSettings, endpoint: e.target.value });
                    setBackupStatus(null);
                    setCloudSyncStatus(null);
                  }}
                />
              </div>
              <div>
                <label className="block text-slate-600 mb-2 font-medium">访问与加密 Token</label>
                <input
                  type="password"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="服务器校验用 Token"
                  value={backupSettings.token || ''}
                  onChange={e => {
                    setBackupSettings({ ...backupSettings, token: e.target.value });
                    setBackupStatus(null);
                    setCloudSyncStatus(null);
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
                <Button onClick={handleSaveBackupSettings} variant="secondary" size="lg">保存云端配置</Button>
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
              <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                <div className="text-sm font-medium text-slate-500">自动使用的同步地址</div>
                <div className="mt-1 break-all font-mono text-sm text-slate-700">
                  {getCloudSyncSettingsFromBackup(backupSettings).endpoint || '请先在上方填写并保存 Worker 接口地址'}
                </div>
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
                <Button onClick={handlePullCloudData} size="lg" disabled={isPullingCloud || isPushingCloud}>
                  {isPullingCloud ? '同步中...' : '从云端同步'}
                </Button>
                <Button onClick={handlePushCloudData} variant="secondary" size="lg" disabled={isPullingCloud || isPushingCloud}>
                  {isPushingCloud ? '上传中...' : '初始化/覆盖云端'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'ai' && (
        <div className="space-y-6">
          <div className="bg-slate-50 p-8 rounded-xl border border-slate-200">
            <h4 className="font-bold text-slate-800 mb-5 flex items-center gap-2 text-lg">
              <Bot size={24} className="text-teal-600" /> AI 回答设置
            </h4>
            <div className="space-y-5">
              <label className="inline-flex items-center gap-3 text-slate-700 font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  checked={aiSettings.enabled}
                  onChange={e => {
                    setAiSettings({ ...aiSettings, enabled: e.target.checked });
                    setAiStatus(null);
                  }}
                />
                启用 AI 回答
              </label>

              <div>
                <label className="block text-slate-600 mb-2 font-medium">Provider</label>
                <select
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white focus:ring-2 focus:ring-teal-500"
                  value={aiSettings.provider}
                  onChange={() => setAiSettings({ ...aiSettings, provider: 'openai-compatible' })}
                >
                  <option value="openai-compatible">OpenAI-compatible</option>
                </select>
              </div>

              <div>
                <label className="block text-slate-600 mb-2 font-medium">Base URL</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="https://api.openai.com/v1"
                  value={aiSettings.baseUrl}
                  onChange={e => {
                    setAiSettings({ ...aiSettings, baseUrl: e.target.value });
                    setAiStatus(null);
                  }}
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-2 font-medium">API Key</label>
                <input
                  type="password"
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  value={aiSettings.apiKey}
                  onChange={e => {
                    setAiSettings({ ...aiSettings, apiKey: e.target.value });
                    setAiStatus(null);
                  }}
                />
              </div>

              <div>
                <label className="block text-slate-600 mb-2 font-medium">模型</label>
                <input
                  className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder=""
                  value={aiSettings.model}
                  onChange={e => {
                    setAiSettings({ ...aiSettings, model: e.target.value });
                    setAiStatus(null);
                  }}
                />
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between gap-3">
                  <label className="block text-slate-600 font-medium">System Prompt</label>
                  <span className="text-xs text-slate-400">{aiSettings.systemPrompt.length}/4000</span>
                </div>
                <textarea
                  className="min-h-36 w-full resize-y rounded-lg border border-slate-300 px-4 py-3 text-base leading-6 outline-none focus:ring-2 focus:ring-teal-500"
                  maxLength={4000}
                  value={aiSettings.systemPrompt}
                  onChange={e => {
                    setAiSettings({ ...aiSettings, systemPrompt: e.target.value });
                    setAiStatus(null);
                  }}
                />
                <p className="mt-2 text-sm leading-6 text-slate-500">
                  用于定义回答的角色、语气和格式。系统会始终附加引用、无依据不回答和非诊断等安全约束。
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-slate-600 mb-2 font-medium">脱敏模式</label>
                  <select
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none bg-white focus:ring-2 focus:ring-teal-500"
                    value={aiSettings.redactionMode}
                    onChange={e => {
                      setAiSettings({ ...aiSettings, redactionMode: e.target.value as typeof aiSettings.redactionMode });
                      setAiStatus(null);
                    }}
                  >
                    <option value="strict">严格脱敏</option>
                    <option value="basic">基础脱敏</option>
                    <option value="off">不脱敏</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-600 mb-2 font-medium">上下文片段数</label>
                  <input
                    type="number"
                    min={1}
                    max={12}
                    className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                    value={aiSettings.maxContextChunks}
                    onChange={e => {
                      setAiSettings({ ...aiSettings, maxContextChunks: Number(e.target.value) });
                      setAiStatus(null);
                    }}
                  />
                </div>
              </div>

              <label className="inline-flex items-center gap-3 text-slate-700 font-medium">
                <input
                  type="checkbox"
                  className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                  checked={aiSettings.sendPatientInfo}
                  onChange={e => {
                    const sendPatientInfo = e.target.checked;
                    setAiSettings({
                      ...aiSettings,
                      sendPatientInfo,
                      redactionMode: sendPatientInfo ? aiSettings.redactionMode : 'strict'
                    });
                    setAiStatus(null);
                  }}
                />
                允许向 AI 服务发送可识别患者信息
              </label>

              {aiStatus && (
                <div className={`rounded-lg border px-4 py-3 text-base ${
                  aiStatus.type === 'success'
                    ? 'border-teal-200 bg-teal-50 text-teal-800'
                    : 'border-red-200 bg-red-50 text-red-700'
                }`}>
                  {aiStatus.message}
                </div>
              )}

              <div className="flex justify-end">
                <Button onClick={handleSaveAiSettings} size="lg">保存 AI 设置</Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'external' && (
        <div className="space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h4 className="font-bold text-slate-800 flex items-center gap-2 text-lg">
                <Database size={24} className="text-teal-600" /> 外部数据源
              </h4>
            </div>
            <Button onClick={addExternalSource}>
              <Plus size={18} className="mr-2" /> 新增数据源
            </Button>
          </div>

          {externalSources.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-5 py-8 text-center text-slate-500">
              暂无外部数据源。
            </div>
          ) : (
            <div className="space-y-5">
              {externalSources.map(source => {
                const status = externalStatus[source.id];
                const isBusy = syncingExternalSourceId === source.id;
                return (
                  <div key={source.id} className="rounded-xl border border-slate-200 bg-slate-50 p-6">
                    <div className="mb-5 flex items-center justify-between gap-4">
                      <div className="font-bold text-slate-800">{source.name || '外部 JSON 数据源'}</div>
                      <button
                        onClick={() => deleteExternalSource(source.id)}
                        className="text-slate-400 hover:text-red-500 p-2 rounded hover:bg-red-50 transition-colors"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <label className="inline-flex items-center gap-3 text-slate-700 font-medium">
                        <input
                          type="checkbox"
                          className="h-5 w-5 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
                          checked={source.enabled}
                          onChange={e => updateExternalSource(source.id, { enabled: e.target.checked })}
                        />
                        启用该数据源
                      </label>

                      <div>
                        <label className="block text-slate-600 mb-2 font-medium">名称</label>
                        <input
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                          value={source.name}
                          onChange={e => updateExternalSource(source.id, { name: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 mb-2 font-medium">HTTP JSON Endpoint</label>
                        <input
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                          placeholder="https://your-domain.example.com/rag-source"
                          value={source.endpoint}
                          onChange={e => updateExternalSource(source.id, { endpoint: e.target.value })}
                        />
                      </div>

                      <div>
                        <label className="block text-slate-600 mb-2 font-medium">Token（可选）</label>
                        <input
                          type="password"
                          className="w-full border border-slate-300 rounded-lg px-4 py-3 text-lg outline-none focus:ring-2 focus:ring-teal-500"
                          value={source.token || ''}
                          onChange={e => updateExternalSource(source.id, { token: e.target.value })}
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                          <div className="text-slate-500">Cursor</div>
                          <div className="mt-1 truncate font-mono text-slate-700">{source.cursor || '-'}</div>
                        </div>
                        <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
                          <div className="text-slate-500">最近同步</div>
                          <div className="mt-1 truncate font-mono text-slate-700">{source.lastSyncedAt || '-'}</div>
                        </div>
                      </div>

                      {status && (
                        <div className={`rounded-lg border px-4 py-3 text-base ${
                          status.type === 'success'
                            ? 'border-teal-200 bg-teal-50 text-teal-800'
                            : 'border-red-200 bg-red-50 text-red-700'
                        }`}>
                          {status.message}
                        </div>
                      )}

                      <div className="flex flex-wrap gap-3">
                        <Button onClick={() => saveExternalSource(source)} variant="secondary" size="lg">保存配置</Button>
                        <Button onClick={() => testExternalSource(source)} variant="secondary" size="lg" disabled={isBusy}>
                          {isBusy ? '请求中...' : '测试连接'}
                        </Button>
                        <Button onClick={() => syncExternalSource(source)} size="lg" disabled={isBusy || !source.enabled}>
                          {isBusy ? '同步中...' : '同步到 RAG'}
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
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
        <ModalBase title={pendingImportSource === 'cloud' ? '云端同步预览' : '导入预览'} onClose={cancelImportPreview} size="lg">
          <div className="space-y-6">
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-5 py-4 text-teal-900">
              <div className="font-bold text-lg">将增量合并到本机数据</div>
              <div className="mt-1 text-sm leading-6">
                {pendingImportSource === 'cloud'
                  ? '本机独有内容会保留，只有云端的新变化会自动加入；确认后会把合并结果重新加密上传，并保存为下一次云端同步快照。'
                  : '本机独有内容会保留，只有导入文件中的新变化会自动加入。成功后会保存本次导入文件作为下一次冲突判断快照。'}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-500">当前诊所</div>
                <div className="mt-1 font-bold text-slate-800">{pendingImportPreview.currentClinicName}</div>
              </div>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-500">{pendingImportSource === 'cloud' ? '云端诊所' : '导入文件诊所'}</div>
                <div className="mt-1 font-bold text-slate-800">{pendingImportPreview.incomingClinicName}</div>
              </div>
            </div>

            <div className="overflow-x-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="px-4 py-3">数据项</th>
                    <th className="px-4 py-3">当前</th>
                    <th className="px-4 py-3">{pendingImportSource === 'cloud' ? '云端' : '导入文件'}</th>
                    <th className="px-4 py-3 text-teal-700">新增</th>
                    <th className="px-4 py-3 text-blue-700">更新</th>
                    <th className="px-4 py-3 text-red-700">删除</th>
                    <th className="px-4 py-3 text-amber-700">冲突</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                  {pendingImportPreview.metrics.map(metric => (
                    <tr key={metric.key}>
                      <td className="px-4 py-3 font-medium text-slate-800">{metric.label}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{metric.current}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">{metric.incoming}</td>
                      <td className="px-4 py-3 font-mono text-teal-700">{metric.added}</td>
                      <td className="px-4 py-3 font-mono text-blue-700">{metric.updated}</td>
                      <td className="px-4 py-3 font-mono text-red-700">{metric.removed}</td>
                      <td className="px-4 py-3 font-mono text-amber-700">{metric.conflicts}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { title: '新增患者示例', items: pendingImportPreview.samples.addedPatients },
                { title: '内容变化患者示例', items: pendingImportPreview.samples.updatedPatients },
                { title: '明确删除预约示例', items: pendingImportPreview.samples.removedPatients }
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

            {pendingImportPreview.conflictCount > 0 ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-5 py-4 text-amber-950">
                <div className="font-bold text-lg">发现 {pendingImportPreview.conflictCount} 项冲突</div>
                <div className="mt-1 text-sm leading-6">以下选择应用于全部冲突；没有冲突的字段仍会自动增量合并。</div>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  {([
                    { value: 'local' as const, title: '保留本机内容（推荐）', description: '冲突字段继续使用当前本机值。' },
                    {
                      value: 'incoming' as const,
                      title: pendingImportSource === 'cloud' ? '采用云端内容' : '采用导入文件内容',
                      description: pendingImportSource === 'cloud' ? '冲突字段改用云端值。' : '冲突字段改用导入文件中的值。'
                    }
                  ]).map(option => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => changeImportConflictResolution(option.value)}
                      className={`rounded-lg border px-4 py-3 text-left transition-colors ${
                        importConflictResolution === option.value
                          ? 'border-amber-500 bg-white ring-2 ring-amber-200'
                          : 'border-amber-200 bg-amber-50/50 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-2 font-bold">
                        <span className={`h-3 w-3 rounded-full border ${importConflictResolution === option.value ? 'border-amber-600 bg-amber-500' : 'border-amber-400 bg-white'}`} />
                        {option.title}
                      </div>
                      <div className="mt-1 text-sm text-amber-800">{option.description}</div>
                    </button>
                  ))}
                </div>
                <div className="mt-4 max-h-48 space-y-2 overflow-y-auto">
                  {pendingImportPreview.conflicts.slice(0, 20).map(conflict => (
                    <div key={`${conflict.entityType}:${conflict.entityId}`} className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm">
                      <span className="font-bold">【{conflict.entityType}】{conflict.label}</span>
                      <span className="text-amber-800">：{conflict.fields.join('、')}；{conflict.reason}</span>
                    </div>
                  ))}
                  {pendingImportPreview.conflictCount > 20 && (
                    <div className="text-sm text-amber-800">另有 {pendingImportPreview.conflictCount - 20} 项冲突未在列表中展开。</div>
                  )}
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-teal-200 bg-teal-50 px-4 py-3 font-medium text-teal-800">
                未发现冲突，可以直接{pendingImportSource === 'cloud' ? '增量同步' : '增量导入'}。
              </div>
            )}

            <div className="rounded-lg border border-slate-200 bg-white px-4 py-3">
              <div className="font-bold text-slate-700">{pendingImportSource === 'cloud' ? '同步说明' : '导入说明'}</div>
              <ul className="mt-2 space-y-1 text-sm text-slate-600">
                {pendingImportPreview.warnings.map(warning => <li key={warning}>{warning}</li>)}
              </ul>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="secondary" onClick={cancelImportPreview} size="lg">取消</Button>
              <Button onClick={confirmImport} size="lg">
                {pendingImportPreview.conflictCount > 0
                  ? `按所选方式${pendingImportSource === 'cloud' ? '增量同步' : '增量导入'}`
                  : `确认${pendingImportSource === 'cloud' ? '增量同步' : '增量导入'}`}
              </Button>
            </div>
          </div>
        </ModalBase>
      )}

      {showRestoreConfirm && (
        <ConfirmationModal
          title="恢复更新前备份确认"
          message="恢复更新前备份会整体替换当前本机数据，并同步恢复文件导入和云端同步的冲突判断快照。此操作不能通过普通撤销恢复，建议先导出当前数据后再继续。"
          confirmLabel="确认恢复备份"
          onConfirm={confirmRestorePreImportBackup}
          onCancel={() => setShowRestoreConfirm(false)}
        />
      )}
    </ModalBase>
  );
};
