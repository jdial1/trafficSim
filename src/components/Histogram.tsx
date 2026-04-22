import React from 'react';

interface HistogramProps {
  title: string;
  value: number;
  unit: string;
  color: string;
  min: number;
  max: number;
}

export const Histogram: React.FC<HistogramProps> = ({ title, value, unit, color, min, max }) => {
  const bars = Array.from({ length: 30 }, (_, i) => {
    const x = (i / 29) * 2 - 1;
    return Math.exp(-x * x * 4) + Math.random() * 0.1; // Gaussian-ish with slight noise
  });
  
  const range = max - min;
  const clampedValue = Math.max(min, Math.min(max, value));
  const percent = (clampedValue - min) / range;
  const bucketIndex = Math.min(29, Math.max(0, Math.floor(percent * 29)));

  return (
    <div className="mb-4 last:mb-0">
      <div className="flex justify-between items-end mb-1">
        <span className="text-[#8B949E] text-[10px] font-bold tracking-wider">{title}</span>
        <span className="font-bold text-lg" style={{ color }}>
          {value.toLocaleString()}
          <span className="text-[10px] ml-1 text-[#8B949E] uppercase">{unit}</span>
        </span>
      </div>
      <div className="flex items-end h-12 gap-[1.5px] bg-black/40 p-2 border border-[#2D333B] rounded-sm">
        {bars.map((height, i) => (
          <div key={i} className="flex-1 flex flex-col justify-end h-full relative group">
            <div 
              style={{ 
                height: `${Math.min(100, height * 100)}%`,
                backgroundColor: i === bucketIndex ? color : '#2D333B',
                boxShadow: i === bucketIndex ? `0 0 10px ${color}` : 'none'
              }} 
              className="w-full transition-all"
            />
            {i === bucketIndex && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 text-[8px] font-bold" style={{ color }}>YOU</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
