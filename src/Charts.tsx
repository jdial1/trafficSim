import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HistoryEntry, QueueHistoryEntry } from './types';
import { LANES } from './constants';

const CHART_H = 180;

export const AnalyticalChart = React.memo(({ history }: { history: HistoryEntry[] }) => (
  <div className="h-[180px] w-full mt-2 -ml-6" style={{ minWidth: 0 }}>
    <ResponsiveContainer width="100%" height={CHART_H} minWidth={0} initialDimension={{ width: 240, height: CHART_H }}>
      <LineChart data={history} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" vertical={false} />
        <XAxis dataKey="time" hide />
        <YAxis hide domain={[0, 40]} />
        <Tooltip contentStyle={{ background: '#1A1D23', border: '1px solid #2D333B', fontSize: '11px' }} itemStyle={{ fontSize: '11px' }} />
        <Line isAnimationActive={false} type="monotone" dataKey="P1" stroke="#3FB950" strokeWidth={1} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="P2" stroke="#58A6FF" strokeWidth={1} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="P3" stroke="#D29922" strokeWidth={1} dot={false} />
        <Line isAnimationActive={false} type="monotone" dataKey="P4" stroke="#8b5cf6" strokeWidth={1} dot={false} />
      </LineChart>
    </ResponsiveContainer>
    <div className="flex justify-center gap-4 text-[10px] font-mono text-[#C9D1D9]/60 -mt-2 ml-6">
      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#3FB950]"></span> P1</span>
      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#58A6FF]"></span> P2</span>
      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#D29922]"></span> P3</span>
      <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-[#8b5cf6]"></span> P4</span>
    </div>
  </div>
));

export const QueueChart = React.memo(({ history }: { history: QueueHistoryEntry[] }) => (
  <div className="h-[180px] w-full mt-2 -ml-6" style={{ minWidth: 0 }}>
    <ResponsiveContainer width="100%" height={CHART_H} minWidth={0} initialDimension={{ width: 240, height: CHART_H }}>
      <LineChart data={history} margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#2D333B" vertical={false} />
        <XAxis dataKey="time" hide />
        <YAxis hide domain={[0, 'auto']} />
        <Tooltip content={({ active, payload, label }) => {
          if (active && payload && payload.length) {
            const filtered = payload.filter((p: any) => (p.value as number) > 0).sort((a: any, b: any) => (b.value as number) - (a.value as number));
            if (filtered.length === 0) return null;
            return (
              <div className="bg-[#1A1D23] border border-[#2D333B] p-2 rounded shadow-xl font-mono text-[11px]">
                <div className="text-[#8B949E] mb-1">{label}</div>
                {filtered.map((p: any) => (<div key={p.dataKey} style={{ color: p.color }}>{String(p.dataKey).replace(/-/g, '_')} : {p.value}</div>))}
              </div>
            );
          }
          return null;
        }} />
        {LANES.map((lane, i) => {
          const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00', '#0366d6', '#28a745', '#ffd33d', '#ea4aaa', '#6f42c1'];
          return (<Line key={lane.id} isAnimationActive={false} type="monotone" dataKey={lane.id} stroke={colors[i % colors.length]} strokeWidth={1} dot={false} />);
        })}
      </LineChart>
    </ResponsiveContainer>
    <div className="grid grid-cols-4 gap-x-2 gap-y-1 text-[9px] font-mono text-[#C9D1D9]/60 -mt-2 ml-6 px-2">
      {LANES.map((lane, i) => {
        const colors = ['#58A6FF', '#F85149', '#3FB950', '#D29922', '#8b5cf6', '#ec4899', '#ffcc00', '#0366d6', '#28a745', '#ffd33d', '#ea4aaa', '#6f42c1'];
        return (<span key={lane.id} className="flex items-center gap-1 truncate"><span className="w-1.5 h-0.5 shrink-0" style={{ backgroundColor: colors[i % colors.length] }}></span> {lane.id.replace(/-/g, '_').toUpperCase()}</span>);
      })}
    </div>
  </div>
));
