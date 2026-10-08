import { useState } from 'react';
import { Download, ChevronDown, Loader2 } from 'lucide-react';
import { clsx } from 'clsx';

const FORMATS = [
  { id: 'csv', label: 'CSV' },
  { id: 'tsv', label: 'Excel (TSV)' },
  { id: 'json', label: 'JSON' },
  { id: 'pdf', label: 'PDF' },
] as const;

interface Props {
  endpoint: string;
  filename: string;
  className?: string;
}

export default function ExportMenu({ endpoint, filename, className }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);

  const download = async (format: string) => {
    setLoading(true);
    setOpen(false);
    try {
      const token = localStorage.getItem('admin_token');
      const base = import.meta.env.VITE_API_URL || 'http://localhost:3001';
      const sep = endpoint.includes('?') ? '&' : '?';
      const url = `${base}${endpoint}${sep}format=${format}&download=1`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const ext = format === 'json' ? 'json' : format === 'tsv' ? 'tsv' : format === 'pdf' ? 'pdf' : 'csv';
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${filename}.${ext}`;
      a.click();
      URL.revokeObjectURL(a.href);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={clsx('relative', className)}>
      <button
        onClick={() => setOpen(!open)}
        disabled={loading}
        className="flex items-center gap-2 px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-400 hover:text-white text-sm"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
        Export
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 bg-slate-900 border border-slate-700 rounded-lg shadow-xl py-1 min-w-[140px]">
          {FORMATS.map((f) => (
            <button
              key={f.id}
              onClick={() => download(f.id)}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-slate-800 hover:text-white"
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
