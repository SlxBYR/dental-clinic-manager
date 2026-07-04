import React, { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Bot, Database, FileUp, Plus, Search, Trash2, UserRound } from 'lucide-react';
import { Button } from '../components/Button';
import { aiService } from '../services/aiService';
import { ragService } from '../services/ragService';
import { AiAnswerResult, Patient, RagKnowledgeEntry, RagSearchHit } from '../types';

const getSourceLabel = (sourceType: RagSearchHit['sourceType']) => {
  if (sourceType === 'patient') return '患者档案';
  if (sourceType === 'file') return '文件';
  if (sourceType === 'external') return '外部数据';
  return '手动条目';
};

const getEntryTypeLabel = (entry: RagKnowledgeEntry) => {
  if (entry.type === 'file') return '文件';
  if (entry.type === 'external') return '外部';
  return '手动';
};

const formatTime = (value: string) => {
  if (!value) return '';
  return value.replace('T', ' ').slice(0, 16);
};

export const RagAssistant = ({
  patients,
  onPatientClick
}: {
  patients: Patient[];
  onPatientClick: (patientId: string) => void;
}) => {
  const [query, setQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [entriesVersion, setEntriesVersion] = useState(0);
  const [status, setStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [aiResult, setAiResult] = useState<AiAnswerResult | null>(null);
  const [isGeneratingAi, setIsGeneratingAi] = useState(false);
  const [isIndexing, setIsIndexing] = useState(false);
  const [results, setResults] = useState<RagSearchHit[]>([]);
  const [indexMessage, setIndexMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const entries = useMemo(() => ragService.getKnowledgeEntries(), [entriesVersion]);
  const stats = useMemo(() => ragService.getStats(patients), [patients, entriesVersion]);
  const refreshEntries = () => setEntriesVersion(version => version + 1);

  useEffect(() => {
    if (!activeQuery) {
      setResults([]);
      setIsIndexing(false);
      setIndexMessage('');
      return;
    }

    let cancelled = false;
    setIsIndexing(true);
    setIndexMessage('正在构建本地索引并检索患者资料...');
    setResults([]);

    const timer = window.setTimeout(() => {
      window.requestAnimationFrame(() => {
        if (cancelled) return;
        const nextResults = ragService.search(activeQuery, patients);
        if (cancelled) return;
        setResults(nextResults);
        setIndexMessage(nextResults.length > 0 ? `已完成，找到 ${nextResults.length} 条相关片段。` : '已完成，未找到匹配片段。');
        setIsIndexing(false);
      });
    }, 120);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [activeQuery, patients, entriesVersion]);

  const handleSearch = (event: FormEvent) => {
    event.preventDefault();
    setActiveQuery(query.trim());
    setAiResult(null);
  };

  const handleAddManualEntry = (event: FormEvent) => {
    event.preventDefault();
    if (!content.trim()) {
      setStatus({ type: 'error', message: '请填写知识内容。' });
      return;
    }
    ragService.addKnowledgeEntry({
      type: 'manual',
      title,
      content
    });
    setTitle('');
    setContent('');
    refreshEntries();
    setStatus({ type: 'success', message: '知识条目已加入本地库。' });
  };

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      if (!text.trim()) {
        setStatus({ type: 'error', message: '文件内容为空。' });
        return;
      }
      ragService.addKnowledgeEntry({
        type: 'file',
        title: file.name,
        content: text,
        fileName: file.name
      });
      refreshEntries();
      setStatus({ type: 'success', message: `${file.name} 已加入本地库。` });
    } catch (error) {
      setStatus({ type: 'error', message: error instanceof Error ? error.message : '文件读取失败。' });
    } finally {
      event.target.value = '';
    }
  };

  const handleDeleteEntry = (entryId: string) => {
    ragService.deleteKnowledgeEntry(entryId);
    refreshEntries();
    setStatus({ type: 'success', message: '知识条目已删除。' });
  };

  const handleGenerateAiAnswer = async () => {
    setIsGeneratingAi(true);
    setAiResult(null);
    const result = await aiService.generateAnswer(activeQuery, results);
    setAiResult(result);
    setIsGeneratingAi(false);
  };

  return (
    <div className="h-full min-h-0 w-full overflow-auto p-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-3xl font-bold text-slate-900">RAG 知识库</h2>
            <div className="mt-2 flex flex-wrap gap-2 text-sm text-slate-500">
              <span className="rounded-md bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">患者 {stats.patientCount}</span>
              <span className="rounded-md bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">条目 {stats.knowledgeEntryCount}</span>
              <span className="rounded-md bg-white px-3 py-1.5 shadow-sm ring-1 ring-slate-200">片段 {stats.chunkCount}</span>
            </div>
          </div>

          <form onSubmit={handleSearch} className="flex w-full gap-2 lg:max-w-2xl">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
              <input
                value={query}
                onChange={event => setQuery(event.target.value)}
                className="w-full rounded-lg border border-slate-200 bg-white py-3 pl-10 pr-4 text-base outline-none focus:border-transparent focus:ring-2 focus:ring-teal-500"
                placeholder="搜索患者、处置、备注、预约或知识条目"
              />
            </div>
            <Button type="submit" size="lg">
              <Search size={18} className="mr-2" /> 检索
            </Button>
          </form>
        </div>

        <div className="grid min-h-[640px] gap-6 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-6 py-4">
              <div className="flex items-center justify-between gap-4">
                <div className="font-semibold text-slate-900">检索结果</div>
                <div className="flex items-center gap-3">
                  <div className="text-sm text-slate-500">
                    {isIndexing ? '正在检索' : activeQuery ? `${results.length} 条匹配` : '等待检索'}
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={handleGenerateAiAnswer}
                    disabled={!activeQuery || results.length === 0 || isGeneratingAi || isIndexing}
                  >
                    <Bot size={16} className="mr-2" /> {isGeneratingAi ? '生成中...' : '生成 AI 回答'}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              {activeQuery && aiResult && (
                <div className={`border-b px-6 py-5 ${
                  aiResult.success ? 'border-teal-100 bg-teal-50/60' : 'border-amber-100 bg-amber-50/70'
                }`}>
                  <div className="mb-3 flex items-center gap-2 font-semibold text-slate-900">
                    <Bot size={18} /> AI 回答
                  </div>
                  {aiResult.success && aiResult.answer ? (
                    <>
                      <div className="whitespace-pre-wrap rounded-lg bg-white px-4 py-3 text-sm leading-6 text-slate-700 ring-1 ring-teal-100">
                        {aiResult.answer}
                      </div>
                      {aiResult.citations && aiResult.citations.length > 0 && (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {aiResult.citations.map(citation => (
                            <button
                              key={`${citation.index}_${citation.chunkId}`}
                              type="button"
                              onClick={() => citation.patientId && onPatientClick(citation.patientId)}
                              className={`rounded-md border px-3 py-1.5 text-xs font-medium ${
                                citation.patientId
                                  ? 'border-teal-200 bg-white text-teal-700 hover:bg-teal-50'
                                  : 'border-slate-200 bg-white text-slate-600'
                              }`}
                            >
                              [{citation.index}] {citation.externalSourceName || citation.patientName || citation.title}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="rounded-lg bg-white px-4 py-3 text-sm leading-6 text-amber-800 ring-1 ring-amber-100">
                      {aiResult.message}
                    </div>
                  )}
                </div>
              )}

              {!activeQuery ? (
                <div className="flex h-full min-h-[360px] items-center justify-center text-slate-500">
                  输入关键词后开始检索。
                </div>
              ) : isIndexing ? (
                <div className="flex h-full min-h-[360px] items-center justify-center px-6">
                  <div className="w-full max-w-md rounded-xl border border-teal-100 bg-teal-50/70 px-6 py-5 text-center shadow-sm">
                    <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-white text-teal-600 ring-1 ring-teal-100">
                      <Search size={22} className="animate-pulse" />
                    </div>
                    <div className="font-semibold text-slate-900">正在准备 RAG 检索</div>
                    <div className="mt-2 text-sm leading-6 text-slate-600">{indexMessage}</div>
                    <div className="mt-4 flex items-center justify-center gap-1">
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:-0.24s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500 [animation-delay:-0.12s]" />
                      <span className="h-2 w-2 animate-bounce rounded-full bg-teal-500" />
                    </div>
                  </div>
                </div>
              ) : results.length === 0 ? (
                <div className="flex h-full min-h-[360px] items-center justify-center text-slate-500">
                  未找到匹配片段。
                </div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {results.map(result => (
                    <article key={result.id} className="p-6 transition-colors hover:bg-slate-50">
                      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="mb-2 flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center rounded-md bg-teal-50 px-2.5 py-1 text-xs font-semibold text-teal-700">
                              {getSourceLabel(result.sourceType)}
                            </span>
                            <span className="text-xs text-slate-400">相关度 {result.score}</span>
                          </div>
                          <h3 className="truncate text-lg font-semibold text-slate-900">{result.title}</h3>
                          {result.patientName && (
                            <div className="mt-1 flex items-center gap-1 text-sm text-slate-500">
                              <UserRound size={15} /> {result.patientName}
                            </div>
                          )}
                          {result.externalSourceName && (
                            <div className="mt-1 text-sm text-slate-500">
                              {result.externalSourceName}{result.externalId ? ` / ${result.externalId}` : ''}
                            </div>
                          )}
                        </div>
                        {result.patientId && (
                          <Button variant="secondary" size="sm" onClick={() => onPatientClick(result.patientId as string)}>
                            打开患者
                          </Button>
                        )}
                      </div>

                      <div className="whitespace-pre-wrap rounded-lg bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700">
                        {result.highlights[0] || result.content}
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          <aside className="flex min-h-0 flex-col gap-6">
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <Plus size={18} /> 手动条目
              </div>
              <form onSubmit={handleAddManualEntry} className="space-y-3">
                <input
                  value={title}
                  onChange={event => setTitle(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-teal-500"
                  placeholder="标题"
                />
                <textarea
                  value={content}
                  onChange={event => setContent(event.target.value)}
                  className="min-h-32 w-full resize-none rounded-lg border border-slate-200 px-3 py-2 outline-none focus:border-transparent focus:ring-2 focus:ring-teal-500"
                  placeholder="内容"
                />
                <Button type="submit" className="w-full">
                  <Plus size={17} className="mr-2" /> 加入知识库
                </Button>
              </form>
            </section>

            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="mb-4 flex items-center gap-2 font-semibold text-slate-900">
                <FileUp size={18} /> 文件导入
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.json,.csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button variant="secondary" className="w-full" onClick={() => fileInputRef.current?.click()}>
                <FileUp size={17} className="mr-2" /> 选择文本文件
              </Button>
              {status && (
                <div className={`mt-3 rounded-lg px-3 py-2 text-sm ${
                  status.type === 'success' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'
                }`}>
                  {status.message}
                </div>
              )}
            </section>

            <section className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 font-semibold text-slate-900">
                  <Database size={18} /> 本地条目
                </div>
                <div className="text-sm text-slate-500">{entries.length}</div>
              </div>
              <div className="flex-1 overflow-auto">
                {entries.length === 0 ? (
                  <div className="p-5 text-sm text-slate-500">暂无手动或文件条目。</div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {entries.map(entry => (
                      <div key={entry.id} className="p-5">
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="mb-1 flex items-center gap-2">
                              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                                {getEntryTypeLabel(entry)}
                              </span>
                              <span className="text-xs text-slate-400">{formatTime(entry.updatedAt)}</span>
                            </div>
                            <div className="truncate font-medium text-slate-900">{entry.title}</div>
                            {entry.externalSourceName && (
                              <div className="mt-1 truncate text-xs text-slate-400">
                                {entry.externalSourceName}{entry.externalId ? ` / ${entry.externalId}` : ''}
                              </div>
                            )}
                          </div>
                          <button
                            className="rounded-md p-2 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
                            onClick={() => handleDeleteEntry(entry.id)}
                            aria-label="删除条目"
                          >
                            <Trash2 size={17} />
                          </button>
                        </div>
                        <div className="line-clamp-3 text-sm leading-6 text-slate-500">{entry.content}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};
