import { GripVertical } from "lucide-react";
import { clsx } from "clsx";

export type DashboardWidget = {
  id: string;
  label: string;
  enabled: boolean;
  order: number;
};

interface Props {
  widgets: DashboardWidget[];
  onChange: (next: DashboardWidget[]) => void;
}

export default function WidgetReorderList({ widgets, onChange }: Props) {
  const sorted = [...widgets].sort((a, b) => a.order - b.order);

  const reorder = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const fromIdx = sorted.findIndex((w) => w.id === fromId);
    const toIdx = sorted.findIndex((w) => w.id === toId);
    if (fromIdx < 0 || toIdx < 0) return;
    const next = [...sorted];
    const [moved] = next.splice(fromIdx, 1);
    next.splice(toIdx, 0, moved);
    onChange(next.map((w, i) => ({ ...w, order: i })));
  };

  return (
    <div className="space-y-1 max-h-80 overflow-y-auto">
      {sorted.map((w) => (
        <div
          key={w.id}
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/widget-id", w.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const fromId = e.dataTransfer.getData("text/widget-id");
            reorder(fromId, w.id);
          }}
          className={clsx(
            "flex items-center gap-2 px-3 py-2 rounded-lg border border-transparent",
            "hover:bg-slate-800 hover:border-slate-700 cursor-grab active:cursor-grabbing",
          )}
        >
          <GripVertical size={14} className="text-slate-600 flex-shrink-0" />
          <input
            type="checkbox"
            checked={w.enabled}
            onChange={(e) => {
              onChange(widgets.map((x) => (x.id === w.id ? { ...x, enabled: e.target.checked } : x)));
            }}
            className="rounded"
            onClick={(e) => e.stopPropagation()}
          />
          <span className="text-sm text-slate-300 flex-1">{w.label}</span>
          <span className="text-xs text-slate-600">#{w.order + 1}</span>
        </div>
      ))}
      <p className="text-xs text-slate-500 pt-2">Drag rows to reorder dashboard sections.</p>
    </div>
  );
}
