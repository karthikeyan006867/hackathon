"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

type SeverityChartProps = {
  data: Array<{ name: string; value: number }>;
};

export function SeverityChart({ data }: SeverityChartProps) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.09)" />
        <XAxis dataKey="name" stroke="#cbd5e1" tickLine={false} axisLine={false} />
        <YAxis stroke="#cbd5e1" tickLine={false} axisLine={false} allowDecimals={false} />
        <Tooltip cursor={{ fill: "rgba(255,255,255,0.08)" }} />
        <Bar dataKey="value" fill="#14b8a6" radius={[8, 8, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
