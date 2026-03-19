import React from 'react';
import { LucideIcon } from 'lucide-react';
import { clsx } from 'clsx';

interface SummaryCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: LucideIcon;
  colorClass: string;
  iconColorClass: string;
}

export const SummaryCard: React.FC<SummaryCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  colorClass,
  iconColorClass,
}) => {
  return (
    <div className="bg-white rounded-xl p-6 shadow-sm border border-gray-100 hover:shadow-md transition-all duration-300">
      <div className="flex items-center justify-between mb-3">
        <div className={clsx("p-3 rounded-lg bg-opacity-10", iconColorClass.replace('text-', 'bg-'))}>
          <Icon className={clsx("w-6 h-6", iconColorClass)} />
        </div>
        <span className="text-xs font-bold text-gray-400 uppercase tracking-wider">{title}</span>
      </div>
      <p className="text-2xl font-bold text-gray-800">{value}</p>
      <p className={clsx("text-xs mt-2 font-medium", colorClass)}>{subtitle}</p>
    </div>
  );
};
