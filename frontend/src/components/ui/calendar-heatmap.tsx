"use client";

import React from "react";

type DataPoint = { date: string; value: number };

export function CalendarHeatmap({ data, title }: { data: DataPoint[]; title?: string }) {
  const year = data?.length
    ? new Date(data[0].date).getFullYear()
    : new Date().getFullYear();

  const weeks = 53;
  const days = 7;
  const grid = Array.from({ length: days }, () => Array(weeks).fill(0));

  let maxVal = 1;
  if (data && data.length > 0) {
    maxVal = Math.max(...data.map((d) => d.value), 1);
  }

  for (let date = new Date(year, 0, 1), i = 0; date.getFullYear() === year; date.setDate(date.getDate() + 1), i++) {
    const diff = i;
    const weekIndex = Math.floor(diff / 7);
    const weekday = (date.getDay() + 6) % 7; 
    const isoDate = date.toISOString().slice(0, 10);
    const found = data?.find((d) => d.date === isoDate);
    if (weekIndex < weeks) grid[weekday][weekIndex] = found ? found.value : 0;
  }

  const monthStarts: string[] = [];
  let currentMonth = -1;
  for (let w = 0; w < weeks; w++) {
    const firstDay = new Date(year, 0, 1 + w * 7);
    const m = firstDay.getMonth();
    if (m !== currentMonth) {
      monthStarts.push(firstDay.toLocaleDateString(undefined, { month: 'short' }));
      currentMonth = m;
    } else {
      monthStarts.push(""); 
    }
  }

  const colorFor = (v: number) => {
    if (v <= 0) return 'hsl(var(--muted))'; 
    const t = Math.min(1, v / maxVal);
    if (t < 0.25) return '#c8e8c1';
    if (t < 0.5) return '#9bd6a0';
    if (t < 0.75) return '#5cc07a';
    return '#0f9b2f';
  };

  const weekdays = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];

  return (
    <section aria-label={title ?? 'Activity Heatmap'} className="w-full">
      {title && <div className="text-sm font-semibold mb-4 text-muted-foreground">{title}</div>}
      
      <div className="overflow-x-auto pb-4 custom-scrollbar">
        <div className="min-w-[750px]">
          <table style={{ borderCollapse: 'separate', borderSpacing: '3px' }} aria-label="Calendar heatmap">
            <thead>
              <tr>
                <th style={{ width: 32 }}></th>
                {Array.from({ length: weeks }).map((_, w) => (
                  <th key={`header-${w}`} className="text-xs font-normal text-muted-foreground text-left" style={{ width: 14, minWidth: 14 }}>
                    {monthStarts[w]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weekdays.map((dayLabel, r) => (
                <tr key={`row-${r}`}>
                  <td className="text-[10px] text-muted-foreground pr-2 text-right align-middle" style={{ width: 32, height: 14 }}>
                    {r % 2 === 0 ? dayLabel : ''}
                  </td>
                  {Array.from({ length: weeks }).map((_, c) => (
                    <td
                      key={`cell-${r}-${c}`}
                      title={`${dayLabel} week ${c + 1} activity: ${grid[r][c]}`}
                      style={{
                        width: 14,
                        height: 14,
                        backgroundColor: colorFor(grid[r][c]),
                        borderRadius: 2
                      }}
                    />
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-2 flex items-center justify-end gap-2 text-xs text-muted-foreground" aria-hidden>
        <span>Less</span>
        <div className="flex gap-1">
          <span className="w-3 h-3 rounded-sm bg-muted" />
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#c8e8c1' }} />
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#9bd6a0' }} />
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#5cc07a' }} />
          <span className="w-3 h-3 rounded-sm" style={{ backgroundColor: '#0f9b2f' }} />
        </div>
        <span>More</span>
      </div>
    </section>
  );
}