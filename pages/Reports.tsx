import React, { useMemo } from 'react';
import { Activity, BarChart3, CalendarDays, CircleDollarSign, TrendingUp, Users } from 'lucide-react';
import { Patient } from '../types';
import { buildReportStats, RankedStat } from '../features/reports/reportStats';

const formatCurrency = (value: number) => `¥ ${Math.round(value).toLocaleString('zh-CN')}`;

const StatCard = ({
  title,
  value,
  icon,
  tone = 'teal'
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  tone?: 'teal' | 'blue' | 'green' | 'amber' | 'slate';
}) => {
  const tones = {
    teal: 'text-teal-700 bg-teal-50',
    blue: 'text-blue-700 bg-blue-50',
    green: 'text-green-700 bg-green-50',
    amber: 'text-amber-700 bg-amber-50',
    slate: 'text-slate-700 bg-slate-100'
  };

  return (
    <div className="rounded-xl border border-slate-100 bg-white p-6 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-base font-bold text-slate-500">{title}</h3>
        <div className={`rounded-lg p-2 ${tones[tone]}`}>{icon}</div>
      </div>
      <div className="text-3xl font-bold text-slate-900">{value}</div>
    </div>
  );
};

const RankTable = ({ title, rows, mode }: { title: string; rows: RankedStat[]; mode: 'revenue' | 'count' }) => (
  <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
    <div className="border-b border-slate-100 px-6 py-4">
      <h3 className="text-lg font-bold text-slate-800">{title}</h3>
    </div>
    {rows.length === 0 ? (
      <div className="px-6 py-10 text-center text-slate-400">暂无处置数据</div>
    ) : (
      <div className="overflow-x-auto">
        <table className="w-full text-left">
          <thead className="bg-slate-50 text-sm font-bold text-slate-500">
            <tr>
              <th className="px-6 py-3">项目</th>
              <th className="px-6 py-3 text-right">次数</th>
              <th className="px-6 py-3 text-right">收入</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(row => (
              <tr key={row.name}>
                <td className="px-6 py-4 font-bold text-slate-800">{row.name}</td>
                <td className={`px-6 py-4 text-right font-mono ${mode === 'count' ? 'text-blue-700 font-bold' : 'text-slate-500'}`}>{row.count}</td>
                <td className={`px-6 py-4 text-right font-mono ${mode === 'revenue' ? 'text-green-700 font-bold' : 'text-slate-500'}`}>{formatCurrency(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    )}
  </div>
);

export const Reports = ({ patients, onPatientClick }: { patients: Patient[]; onPatientClick: (id: string) => void }) => {
  const stats = useMemo(() => buildReportStats(patients), [patients]);
  const hasTreatments = stats.last30TreatmentCount > 0 || stats.totalRevenue > 0;

  return (
    <div className="p-8 max-w-7xl mx-auto w-full">
      <header className="mb-8">
        <h1 className="text-3xl font-bold text-slate-900">统计报表</h1>
        <p className="mt-2 text-lg text-slate-500">基于处置记录的价格、日期和项目统计。</p>
      </header>

      <div className="mb-8 grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-5">
        <StatCard title="总收入" value={formatCurrency(stats.totalRevenue)} icon={<CircleDollarSign size={22} />} tone="green" />
        <StatCard title="今日收入" value={formatCurrency(stats.todayRevenue)} icon={<CalendarDays size={22} />} tone="blue" />
        <StatCard title="本月收入" value={formatCurrency(stats.monthRevenue)} icon={<TrendingUp size={22} />} tone="teal" />
        <StatCard title="近 30 天处置" value={`${stats.last30TreatmentCount} 次`} icon={<Activity size={22} />} tone="amber" />
        <StatCard title="近 30 天收入" value={formatCurrency(stats.last30Revenue)} icon={<BarChart3 size={22} />} tone="slate" />
      </div>

      {!hasTreatments ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center text-slate-400">
          暂无处置记录，录入处置后会自动生成统计报表。
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
          <RankTable title="项目收入排行" rows={stats.itemRevenueRank} mode="revenue" />
          <RankTable title="项目处置次数排行" rows={stats.itemCountRank} mode="count" />

          <div className="rounded-xl border border-slate-200 bg-white shadow-sm xl:col-span-2">
            <div className="flex items-center gap-2 border-b border-slate-100 px-6 py-4">
              <Users size={20} className="text-teal-600" />
              <h3 className="text-lg font-bold text-slate-800">活跃患者统计</h3>
            </div>
            {stats.activePatients.length === 0 ? (
              <div className="px-6 py-10 text-center text-slate-400">暂无活跃患者</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 text-sm font-bold text-slate-500">
                    <tr>
                      <th className="px-6 py-3">患者</th>
                      <th className="px-6 py-3">电话</th>
                      <th className="px-6 py-3 text-right">处置次数</th>
                      <th className="px-6 py-3 text-right">累计收入</th>
                      <th className="px-6 py-3">最近处置</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {stats.activePatients.map(patient => (
                      <tr
                        key={patient.patientId}
                        className="cursor-pointer hover:bg-teal-50/40"
                        onClick={() => onPatientClick(patient.patientId)}
                      >
                        <td className="px-6 py-4 font-bold text-slate-900">{patient.name}</td>
                        <td className="px-6 py-4 font-mono text-slate-500">{patient.phone || '未填写'}</td>
                        <td className="px-6 py-4 text-right font-mono text-blue-700">{patient.treatmentCount}</td>
                        <td className="px-6 py-4 text-right font-mono font-bold text-green-700">{formatCurrency(patient.revenue)}</td>
                        <td className="px-6 py-4 text-slate-500">{patient.lastTreatmentDate || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
