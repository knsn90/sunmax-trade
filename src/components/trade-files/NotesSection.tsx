import { useState } from 'react';
import { useTradeFileNotes, useCreateTradeFileNote, useDeleteTradeFileNote } from '@/hooks/useTradeFileNotes';
import { useTheme } from '@/contexts/ThemeContext';
import { MessageSquare, Trash2, Send } from 'lucide-react';
import { fDate } from '@/lib/formatters';

export function NotesSection({ tradeFileId }: { tradeFileId: string }) {
  const { accent } = useTheme();
  const { data: notes = [], isLoading } = useTradeFileNotes(tradeFileId);
  const create = useCreateTradeFileNote(tradeFileId);
  const remove = useDeleteTradeFileNote(tradeFileId);
  const [text, setText] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    await create.mutateAsync(text.trim());
    setText('');
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 flex items-center gap-2.5 border-b border-gray-50">
        <MessageSquare className="h-4 w-4 text-gray-400" />
        <span className="text-[11px] font-bold uppercase tracking-widest text-gray-500">Notlar</span>
        {notes.length > 0 && (
          <span className="ml-auto text-[10px] font-semibold bg-gray-100 text-gray-500 px-2 py-0.5 rounded-full">
            {notes.length}
          </span>
        )}
      </div>

      {/* Add note form */}
      <form onSubmit={handleSubmit} className="px-6 py-3 border-b border-gray-50 flex gap-2">
        <textarea
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder="Not ekle…"
          rows={2}
          className="flex-1 text-[13px] text-gray-700 placeholder:text-gray-400 resize-none outline-none bg-gray-50 rounded-xl px-3 py-2 border border-gray-100 focus:border-gray-300 transition-colors"
          onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleSubmit(e as unknown as React.FormEvent); }}
        />
        <button
          type="submit"
          disabled={!text.trim() || create.isPending}
          className="self-end w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
          style={{ background: accent }}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      {/* Notes list */}
      {isLoading ? (
        <div className="px-6 py-4 text-[12px] text-gray-400">Yükleniyor…</div>
      ) : notes.length === 0 ? (
        <div className="px-6 py-6 text-center text-[12px] text-gray-400">Henüz not yok</div>
      ) : (
        <div className="divide-y divide-gray-50">
          {notes.map(note => (
            <div key={note.id} className="px-6 py-3 group flex gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-gray-800 whitespace-pre-wrap">{note.content}</p>
                <p className="text-[10px] text-gray-400 mt-1">{fDate(note.created_at)}</p>
              </div>
              <button
                onClick={() => remove.mutate(note.id)}
                className="opacity-0 group-hover:opacity-100 transition-opacity text-gray-300 hover:text-red-500 p-1 rounded-lg hover:bg-red-50 shrink-0 self-start"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
