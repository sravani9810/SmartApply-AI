import type { NextPage } from 'next';
import Link from 'next/link';
import { useCallback, useContext, useEffect, useState } from 'react';
import { templates } from '../data/variants';
import { ToastContext } from '../contexts/ToastContext';
import { ToastType } from '../types/ToastType';

interface SavedResumeMeta {
  id: string;
  title: string;
  updatedAt: string;
}

const fmtDate = (iso: string): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
};

const Library: NextPage = () => {
  const { addToast } = useContext(ToastContext);
  const [saved, setSaved] = useState<SavedResumeMeta[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/resumes')
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('list failed'))))
      .then((list: SavedResumeMeta[]) => setSaved(list))
      .catch(() => addToast('Could not load your saved résumés.', ToastType.ERROR))
      .finally(() => setLoading(false));
  }, [addToast]);

  useEffect(() => {
    load();
  }, [load]);

  const onDelete = useCallback(
    (id: string, title: string) => {
      if (typeof window !== 'undefined' && !window.confirm(`Delete “${title}”? This cannot be undone.`)) return;
      fetch(`/api/resumes/${encodeURIComponent(id)}`, { method: 'DELETE' })
        .then((res) => {
          if (!res.ok && res.status !== 204) throw new Error('delete failed');
          addToast('Résumé deleted.', ToastType.SUCCESS);
          setSaved((prev) => prev.filter((r) => r.id !== id));
        })
        .catch(() => addToast('Could not delete that résumé.', ToastType.ERROR));
    },
    [addToast],
  );

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
          <div>
            <h1 className="text-3xl font-bold">Résumé Library</h1>
            <p className="text-gray-500 mt-1">Open a résumé to edit it in place, or start from a template.</p>
          </div>
          <Link href="/editResume?new=1">
            <a className="bg-blue-700 hover:bg-blue-800 text-white px-4 py-2 rounded font-semibold">+ New blank résumé</a>
          </Link>
        </div>

        {/* Saved résumés */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold mb-3">Saved résumés</h2>
          {loading ? (
            <p className="text-gray-400">Loading…</p>
          ) : saved.length === 0 ? (
            <div className="border border-dashed border-gray-300 rounded-lg p-6 text-gray-500">
              No saved résumés yet. Open a template below, edit it, then <span className="font-medium">Save as new</span>.
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {saved.map((r) => (
                <div key={r.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col">
                  <div className="flex-auto">
                    <h3 className="font-semibold text-lg leading-tight">{r.title}</h3>
                    <p className="text-xs text-gray-400 mt-1">Updated {fmtDate(r.updatedAt)}</p>
                  </div>
                  <div className="flex items-center gap-3 mt-4">
                    <Link href={`/editResume?id=${encodeURIComponent(r.id)}`}>
                      <a className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-3 py-1.5 rounded">Open &amp; edit</a>
                    </Link>
                    <button onClick={() => onDelete(r.id, r.title)} className="ml-auto text-sm text-red-500 hover:text-red-700">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Templates */}
        <section>
          <h2 className="text-xl font-semibold mb-3">Templates</h2>
          <p className="text-gray-500 text-sm mb-3">
            Built-in styles. Opening one loads its content into the editor — tweak it and <span className="font-medium">Save as new</span> to add it to your library.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {templates.map((t) => (
              <div key={t.id} className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm flex flex-col">
                <div className="flex-auto">
                  <h3 className="font-semibold text-lg leading-tight">{t.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">Template</p>
                </div>
                <div className="mt-4">
                  <Link href={`/editResume?template=${encodeURIComponent(t.id)}`}>
                    <a className="bg-gray-800 hover:bg-black text-white text-sm px-3 py-1.5 rounded">Open template</a>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Library;
