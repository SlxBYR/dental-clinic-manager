import React from 'react';

export const SidebarItem = ({
  icon,
  label,
  active,
  collapsed = false,
  onClick
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  collapsed?: boolean;
  onClick: () => void;
}) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={collapsed ? label : undefined}
    className={`flex w-full items-center rounded-lg py-3 transition-all duration-200 ${collapsed ? 'justify-center px-2' : 'gap-3 px-4'} ${
      active ? 'bg-teal-600 text-white shadow-lg' : 'hover:bg-slate-800 hover:text-white'
    }`}
  >
    <span className="shrink-0">{icon}</span>
    <span className={collapsed ? 'sr-only' : 'font-medium'}>{label}</span>
  </button>
);
