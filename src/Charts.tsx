import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { HistoryEntry, QueueHistoryEntry } from './types';
import { LANES } from './constants';

const CHART_H = 180;

const scopeClass =
  'relative overflow-hidden rounded-sm border border-[#1e4d38] bg-[#06100c] shadow-[inset_0_0_80px_rgba(0,0,0,0.88),inset_0_0_2px_rgba(120,255,190,0.12)]';

const scopeGrid =
  "pointer-events-none absolute inset-0 z-[1] opacity-[0.14] bg-[linear-gradient(rgba(0,255,160,0.22)_1px,transparent_1px),linear-gradient(90deg,rgba(0,255,160,0.14)_1px,transparent_1px)] bg-[size:22px_22px] [mask-image:radial-gradient(ellipse_at_center,black_55%,transparent_100%)]";

const OscilloFrame = ({ children }: { children: React.ReactNode }) => (
  <div className={`${scopeClass} mt-2 -ml-6`} style={{ minWidth: 0 }}>
    <div className={scopeGrid} aria-hidden />
    <div
      className="pointer-events-none absolute inset-0 z-[2] opacity-[0.06] mix-blend-screen"
      style={{
        backgroundImage:
          'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,255,170,0.12) 2px, rgba(0,255,170,0.12) 3px)',
      }}
      aria-hidden
    />
    <div className="relative z-[3] [&_.recharts-cartesian-grid-horizontal_line]:stroke-[rgba(0,255,150,0.14)] [&_.recharts-cartesian-grid-vertical_line]:stroke-[rgba(0,255,150,0.06)] [&_.recharts-line-curve]:drop-shadow-[0_0_6px_rgba(0,255,180,0.45)]">
      {children}
    </div>
    <div className="pointer-events-none absolute bottom-1 right-2 z-[4] font-mono text-[8px] uppercase tracking-[0.2em] text-[#00c46b]/50">
      CRT / XY
    </div>
  </div>
);

export const AnalyticalChart = React.memo(({ history }: { history: HistoryEntry[] }) => (
  <OscilloFrame>
    <ResponsiveContainer width="100%" height={CHART_H} minWidth={0} initialDimension={{ width: 240, height: CHART_H }}>
      <LineChart data={history} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <filter id="phosphorA" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1.1" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="4 5" stroke="rgba(0,255,140,0.1)" vertical />
        <XAxis dataKey="time" hide />
        <YAxis hide domain={[0, 40]} />
        <Tooltip
          contentStyle={{
            background: '#040a08',
            border: '1px solid rgba(0,255,140,0.25)',
            fontSize: '11px',
            color: '#9fe8c5',
            fontFamily: 'JetBrains Mono, monospace',
          }}
          itemStyle={{ fontSize: '11px' }}
        />
        <Line
          isAnimationActive={false}
          type="monotone"
          dataKey="P1"
          stroke="#5dffc8"
          strokeWidth={1.35}
          dot={false}
          filter="url(#phosphorA)"
        />
        <Line isAnimationActive={false} type="monotone" dataKey="P2" stroke="#3ecf9a" strokeWidth={1.25} dot={false} filter="url(#phosphorA)" />
        <Line isAnimationActive={false} type="monotone" dataKey="P3" stroke="#2ab87d" strokeWidth={1.15} dot={false} filter="url(#phosphorA)" />
        <Line isAnimationActive={false} type="monotone" dataKey="P4" stroke="#1a8f5e" strokeWidth={1.1} dot={false} filter="url(#phosphorA)" />
      </LineChart>
    </ResponsiveContainer>
    <div className="flex justify-center gap-4 text-[10px] font-mono text-[#5dffc8]/55 -mt-1 ml-6 pb-1">
      <span className="flex items-center gap-1">
        <span className="h-0.5 w-2 bg-[#5dffc8]" /> P1
      </span>
      <span className="flex items-center gap-1">
        <span className="h-0.5 w-2 bg-[#3ecf9a]" /> P2
      </span>
      <span className="flex items-center gap-1">
        <span className="h-0.5 w-2 bg-[#2ab87d]" /> P3
      </span>
      <span className="flex items-center gap-1">
        <span className="h-0.5 w-2 bg-[#1a8f5e]" /> P4
      </span>
    </div>
  </OscilloFrame>
));

const queueTone = (i: number) => {
  const t = 0.35 + (i % 6) * 0.09;
  const g = Math.round(210 + t * 40);
  const b = Math.round(130 + t * 60);
  return `rgb(40,${g},${b})`;
};

export const QueueChart = React.memo(({ history }: { history: QueueHistoryEntry[] }) => (
  <OscilloFrame>
    <ResponsiveContainer width="100%" height={CHART_H} minWidth={0} initialDimension={{ width: 240, height: CHART_H }}>
      <LineChart data={history} margin={{ left: 0, right: 0, top: 4, bottom: 0 }}>
        <defs>
          <filter id="phosphorQ" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="1" result="bq" />
            <feMerge>
              <feMergeNode in="bq" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <CartesianGrid strokeDasharray="4 5" stroke="rgba(0,255,140,0.1)" vertical />
        <XAxis dataKey="time" hide />
        <YAxis hide domain={[0, 'auto']} />
        <Tooltip
          content={({ active, payload, label }) => {
            if (active && payload && payload.length) {
              const filtered = payload
                .filter((p: { value?: number }) => (p.value as number) > 0)
                .sort((a: { value?: number }, b: { value?: number }) => (b.value as number) - (a.value as number));
              if (filtered.length === 0) return null;
              return (
                <div className="border border-[rgba(0,255,140,0.28)] bg-[#040a08] p-2 font-mono text-[11px] text-[#9fe8c5] shadow-xl">
                  <div className="mb-1 text-[#5dffc8]/70">{label}</div>
                  {filtered.map((p: { dataKey?: string; color?: string; value?: number }) => (
                    <div key={String(p.dataKey)} style={{ color: p.color }}>
                      {String(p.dataKey).replace(/-/g, '_')} : {p.value}
                    </div>
                  ))}
                </div>
              );
            }
            return null;
          }}
        />
        {LANES.map((lane, i) => (
          <Line
            key={lane.id}
            isAnimationActive={false}
            type="monotone"
            dataKey={lane.id}
            stroke={queueTone(i)}
            strokeWidth={1.1}
            dot={false}
            filter="url(#phosphorQ)"
          />
        ))}
      </LineChart>
    </ResponsiveContainer>
    <div className="grid max-h-20 grid-cols-4 gap-x-2 gap-y-1 overflow-y-auto px-2 pb-1 text-[9px] font-mono text-[#5dffc8]/50 ml-6">
      {LANES.map((lane, i) => (
        <span key={lane.id} className="flex items-center gap-1 truncate">
          <span className="h-0.5 w-1.5 shrink-0" style={{ backgroundColor: queueTone(i) }} />{' '}
          {lane.id.replace(/-/g, '_').toUpperCase()}
        </span>
      ))}
    </div>
  </OscilloFrame>
));
