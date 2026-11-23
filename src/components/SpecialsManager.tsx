import React, { useState } from 'react';
import { Check, Eye, EyeOff, MonitorPlay, Pencil, Trash2, X } from 'lucide-react';
import { DailySpecial } from '../types';
import { MediaAsset } from './MediaAsset';
import { MediaDropzone, UploadedMediaResult } from './MediaDropzone';
import { saveMediaFile } from '../utils/storage';

interface SpecialsManagerProps {
  specials: DailySpecial[];
  onChange: (next: DailySpecial[]) => void;
  onPreviewSpecials: (openEmulator?: boolean) => void;
}

export const SpecialsManager: React.FC<SpecialsManagerProps> = ({
  specials,
  onChange,
  onPreviewSpecials,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<DailySpecial>>({});
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);

  const handleUploadNewSpecial = (results: UploadedMediaResult[]) => {
    const created: DailySpecial[] = results.map((res, idx) => {
      const cleanTitle = res.fileName.replace(/\.[^/.]+$/, '').replace(/[_-]+/g, ' ');
      return {
        id: `spec-${Date.now()}-${idx}`,
        title: cleanTitle.charAt(0).toUpperCase() + cleanTitle.slice(1) || 'Chef Daily Special',
        description: 'Prepared fresh today in limited quantities. Ask your server for pairing suggestions.',
        specialPrice: 18.0,
        regularPrice: 23.0,
        windowLabel: 'Today Only · While Supplies Last',
        mediaUrl: res.mediaUrl,
        mediaKind: res.mediaKind,
        mediaAssetId: res.mediaAssetId,
        active: true,
      };
    });

    onChange([...created, ...specials]);
    if (created.length === 1) {
      setEditingId(created[0].id);
      setDraft(created[0]);
      onPreviewSpecials(false);
    }
  };

  const handleReplaceMediaDrop = async (e: React.DragEvent, specialId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setDragTargetId(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type.startsWith('video/');
    if (!isImage && !isVideo) return;

    const saved = await saveMediaFile(file);
    onChange(
      specials.map((s) =>
        s.id === specialId
          ? {
              ...s,
              mediaUrl: saved.objectUrl,
              mediaKind: isVideo ? 'video' : 'image',
              mediaAssetId: saved.assetId,
            }
          : s
      )
    );
    onPreviewSpecials(false);
  };

  const startEdit = (special: DailySpecial) => {
    setEditingId(special.id);
    setDraft({ ...special });
  };

  const saveEdit = () => {
    if (!editingId) return;
    onChange(
      specials.map((s) =>
        s.id === editingId
          ? {
              ...s,
              title: draft.title?.trim() || s.title,
              description: draft.description?.trim() || '',
              specialPrice: Math.max(0, Number(draft.specialPrice) || 0),
              regularPrice:
                draft.regularPrice !== undefined && Number(draft.regularPrice) > 0
                  ? Number(draft.regularPrice)
                  : undefined,
              windowLabel: draft.windowLabel?.trim() || 'Today Only',
            }
          : s
      )
    );
    setEditingId(null);
    setDraft({});
  };

  const toggleActive = (id: string) => {
    onChange(specials.map((s) => (s.id === id ? { ...s, active: !s.active } : s)));
  };

  const removeSpecial = (id: string) => {
    onChange(specials.filter((s) => s.id !== id));
    if (editingId === id) setEditingId(null);
  };

  const activeCount = specials.filter((s) => s.active).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Daily Specials</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Highlight limited-run plates and drink pairings with pricing and availability windows.
          </p>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-slate-500 tabular-nums">
            {activeCount} featured today
          </span>
          <button
            type="button"
            onClick={() => onPreviewSpecials(true)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap shrink-0"
          >
            <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
            Open Specials View
          </button>
        </div>
      </div>

      <MediaDropzone
        onUpload={handleUploadNewSpecial}
        acceptVideo
        multiple
        title="Drag and drop a dish photo or clip to add a Daily Special"
        subtitle="JPG, PNG, WebP, MP4, WebM"
      />

      {specials.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No daily specials scheduled</p>
          <p className="text-xs text-slate-500 mt-1">
            Drop an image or video above to publish today’s kitchen or bar feature.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {specials.map((special) => {
            const isEditing = editingId === special.id;
            const isDragTarget = dragTargetId === special.id;

            return (
              <div
                key={special.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTargetId(special.id);
                }}
                onDragLeave={() => setDragTargetId(null)}
                onDrop={(e) => void handleReplaceMediaDrop(e, special.id)}
                className={`p-4 transition-colors ${
                  isDragTarget ? 'bg-amber-50/70' : special.active ? 'bg-white' : 'bg-slate-50/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative w-full sm:w-36 aspect-[4/3] rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-200 flex items-center justify-center">
                    <MediaAsset
                      src={special.mediaUrl}
                      kind={special.mediaKind}
                      alt={special.title}
                      fit="contain"
                    />
                    {!special.active && (
                      <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center">
                        <span className="text-xs font-medium text-white">Hidden</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Special Name
                            </label>
                            <input
                              type="text"
                              value={draft.title ?? ''}
                              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Availability Window
                            </label>
                            <input
                              type="text"
                              value={draft.windowLabel ?? ''}
                              onChange={(e) => setDraft({ ...draft, windowLabel: e.target.value })}
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Description
                          </label>
                          <input
                            type="text"
                            value={draft.description ?? ''}
                            onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Special Price ($)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={draft.specialPrice ?? 0}
                              onChange={(e) =>
                                setDraft({ ...draft, specialPrice: Number(e.target.value) })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Regular Price (optional $)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={draft.regularPrice ?? ''}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  regularPrice: e.target.value ? Number(e.target.value) : undefined,
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap shrink-0"
                          >
                            <X className="w-3.5 h-3.5" aria-hidden="true" />
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={saveEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            Save Special
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-between h-full gap-2">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900">{special.title}</h3>
                            <div className="text-right font-mono tabular-nums shrink-0">
                              <span className="text-sm font-semibold text-slate-900">
                                ${special.specialPrice.toFixed(2)}
                              </span>
                              {special.regularPrice && special.regularPrice > special.specialPrice && (
                                <span className="ml-1.5 text-xs text-slate-400 line-through">
                                  ${special.regularPrice.toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                            {special.description}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="text-xs text-slate-500">
                            <span className={special.active ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                              {special.active ? 'Active' : 'Hidden'}
                            </span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>{special.windowLabel}</span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => toggleActive(special.id)}
                              title={special.active ? 'Hide special' : 'Show special'}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            >
                              {special.active ? (
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(special)}
                              title="Edit special"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeSpecial(special.id)}
                              title="Delete special"
                              className="p-1.5 rounded-md text-slate-500 hover:text-red-600 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
