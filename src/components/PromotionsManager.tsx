import React, { useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Eye,
  EyeOff,
  Info,
  MonitorPlay,
  Pencil,
  Trash2,
  X,
} from 'lucide-react';
import { PromotionItem, PromotionSchedule } from '../types';
import { evaluatePromotionSchedule } from '../utils/schedule';
import { MediaAsset } from './MediaAsset';
import { MediaDropzone, UploadedMediaResult } from './MediaDropzone';
import { saveMediaFile } from '../utils/storage';

interface PromotionsManagerProps {
  promotions: PromotionItem[];
  onChange: (next: PromotionItem[]) => void;
  onPreviewSlide: (promoId: string, openEmulator?: boolean) => void;
}

const DEFAULT_SCHEDULE: PromotionSchedule = {
  mode: 'always',
  startDate: '',
  endDate: '',
  startTime: '',
  endTime: '',
};

export const PromotionsManager: React.FC<PromotionsManagerProps> = ({
  promotions,
  onChange,
  onPreviewSlide,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<PromotionItem>>({});
  const [dragTargetId, setDragTargetId] = useState<string | null>(null);
  const [showPromotionsInfo, setShowPromotionsInfo] = useState(false);

  const handleBulkUpload = (results: UploadedMediaResult[]) => {
    const newSlides: PromotionItem[] = results.map((res, index) => {
      return {
        id: `promo-${Date.now()}-${index}`,
        title: '',
        subtitle: '',
        scheduleLabel: '',
        durationSec: res.mediaKind === 'video' ? 12 : 8,
        mediaUrl: res.mediaUrl,
        mediaKind: res.mediaKind,
        mediaAssetId: res.mediaAssetId,
        active: true,
        ctaLabel: '',
        schedule: { ...DEFAULT_SCHEDULE },
      };
    });

    const updated = [...newSlides, ...promotions];
    onChange(updated);

    if (newSlides.length === 1) {
      setEditingId(newSlides[0].id);
      setDraft(newSlides[0]);
      onPreviewSlide(newSlides[0].id, false);
    }
  };

  const handleReplaceMediaDrop = async (e: React.DragEvent, promoId: string) => {
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
      promotions.map((item) =>
        item.id === promoId
          ? {
              ...item,
              mediaUrl: saved.objectUrl,
              mediaKind: isVideo ? 'video' : 'image',
              mediaAssetId: saved.assetId,
            }
          : item
      )
    );
    onPreviewSlide(promoId, false);
  };

  const startEdit = (item: PromotionItem) => {
    setEditingId(item.id);
    setDraft({
      ...item,
      schedule: item.schedule ? { ...item.schedule } : { ...DEFAULT_SCHEDULE },
    });
  };

  const updateDraftSchedule = (patch: Partial<PromotionSchedule>) => {
    setDraft((prev) => ({
      ...prev,
      schedule: {
        ...(prev.schedule ?? DEFAULT_SCHEDULE),
        ...patch,
      },
    }));
  };

  const saveEdit = () => {
    if (!editingId) return;
    const rawSched = draft.schedule;
    const hasAnyBounds =
      rawSched?.mode === 'scheduled' &&
      Boolean(
        rawSched.startDate || rawSched.endDate || rawSched.startTime || rawSched.endTime
      );

    const normalizedSchedule: PromotionSchedule = hasAnyBounds
      ? {
          mode: 'scheduled',
          startDate: rawSched?.startDate || undefined,
          endDate: rawSched?.endDate || undefined,
          startTime: rawSched?.startTime || undefined,
          endTime: rawSched?.endTime || undefined,
        }
      : { mode: 'always' };

    onChange(
      promotions.map((item) =>
        item.id === editingId
          ? {
              ...item,
              title: draft.title?.trim() ?? '',
              subtitle: draft.subtitle?.trim() ?? '',
              scheduleLabel: draft.scheduleLabel?.trim() ?? '',
              durationSec: Math.max(3, Math.min(60, Number(draft.durationSec) || 8)),
              ctaLabel: draft.ctaLabel?.trim() ?? '',
              schedule: normalizedSchedule,
            }
          : item
      )
    );
    setEditingId(null);
    setDraft({});
  };

  const moveItem = (index: number, delta: -1 | 1) => {
    const target = index + delta;
    if (target < 0 || target >= promotions.length) return;
    const copy = [...promotions];
    const [removed] = copy.splice(index, 1);
    copy.splice(target, 0, removed);
    onChange(copy);
  };

  const toggleActive = (id: string) => {
    onChange(
      promotions.map((item) => (item.id === id ? { ...item, active: !item.active } : item))
    );
  };

  const removeItem = (id: string) => {
    onChange(promotions.filter((item) => item.id !== id));
    if (editingId === id) {
      setEditingId(null);
    }
  };

  const now = new Date();
  const liveNowCount = promotions.filter(
    (p) => evaluatePromotionSchedule(p, now).isEligible
  ).length;
  const scheduledUpcomingCount = promotions.filter(
    (p) => p.active && !evaluatePromotionSchedule(p, now).isEligible
  ).length;

  
return (
  <div className="space-y-6">
    <div className="flex flex-wrap items-baseline justify-between gap-4">
      <div className="flex items-center gap-2 relative">
        <h2 className="text-lg font-semibold text-slate-900">
          Promotions & Attract Loop
        </h2>

        <button
          type="button"
          onClick={() => setShowPromotionsInfo(!showPromotionsInfo)}
          className="text-slate-400 hover:text-sky-600 transition-colors"
          aria-label="More information about Promotions & Attract Loop"
          aria-expanded={showPromotionsInfo}
        >
          <Info size={17} />
        </button>

        {showPromotionsInfo && (
          <div className="absolute top-full left-0 mt-3 z-50 w-80 max-w-[calc(100vw-3rem)] bg-white border border-slate-200 rounded-xl shadow-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-semibold text-slate-900">
                Promotions & Attract Loop
              </h3>

              <button
                type="button"
                onClick={() => setShowPromotionsInfo(false)}
                className="text-slate-400 hover:text-slate-700"
                aria-label="Close information"
              >
                <X size={16} />
              </button>
            </div>

            <p className="text-sm text-slate-600 leading-relaxed">
              Upload venue photos or looping videos and schedule specific
              date ranges or hours for playback.
            </p>
          </div>
        )}
      </div>

      <div className="text-xs text-slate-500 tabular-nums">
        <span>{liveNowCount} playing now</span>

        {scheduledUpcomingCount > 0 && (
          <>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{scheduledUpcomingCount} scheduled</span>
          </>
        )}

        <span className="mx-1.5" aria-hidden="true">·</span>
        <span>{promotions.length} total slides</span>
      </div>
    </div>


      <MediaDropzone
        onUpload={handleBulkUpload}
        acceptVideo
        multiple
        title="Browse Files"
        subtitle="Supports JPG, PNG, WebP, MP4, WebM"
      />

      {promotions.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-10 text-center">
          <p className="text-sm font-medium text-slate-900">No promotion slides yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            Drop an image or short promotional video above to build your tabletop attract loop.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {promotions.map((promo, idx) => {
            const isEditing = editingId === promo.id;
            const isDragTarget = dragTargetId === promo.id;
            const evalResult = evaluatePromotionSchedule(promo, now);

            const statusColorClass =
              evalResult.status === 'live'
                ? 'text-emerald-700'
                : evalResult.status === 'scheduled' || evalResult.status === 'off-hours'
                  ? 'text-amber-700'
                  : 'text-slate-400';

            const draftSchedule = draft.schedule ?? DEFAULT_SCHEDULE;
            const draftEval = isEditing
              ? evaluatePromotionSchedule(
                  {
                    ...promo,
                    active: draft.active ?? promo.active,
                    schedule: draftSchedule,
                  },
                  now
                )
              : null;

            return (
              <div
                key={promo.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragTargetId(promo.id);
                }}
                onDragLeave={() => setDragTargetId(null)}
                onDrop={(e) => void handleReplaceMediaDrop(e, promo.id)}
                className={`p-4 transition-colors ${
                  isDragTarget ? 'bg-amber-50/70' : promo.active ? 'bg-white' : 'bg-slate-50/70'
                }`}
              >
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="relative w-full sm:w-44 aspect-video rounded-lg overflow-hidden bg-slate-950 shrink-0 border border-slate-200 flex items-center justify-center">
                    <MediaAsset
                      src={promo.mediaUrl}
                      kind={promo.mediaKind}
                      alt={promo.title}
                      fit="contain"
                    />
                    {!evalResult.isEligible && (
                      <div className="absolute inset-0 bg-slate-950/60 flex items-center justify-center px-2 text-center">
                        <span className="text-xs font-medium text-white">
                          {evalResult.status === 'paused'
                            ? 'Paused'
                            : evalResult.status === 'scheduled'
                              ? 'Scheduled'
                              : evalResult.status === 'off-hours'
                                ? 'Off-Hours'
                                : 'Ended'}
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    {isEditing ? (
                      <div className="space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Slide Headline
                            </label>
                            <input
                              type="text"
                              value={draft.title ?? ''}
                              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
                              placeholder="Optional — leave blank for no screen text"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Display Caption
                            </label>
                            <input
                              type="text"
                              value={draft.scheduleLabel ?? ''}
                              onChange={(e) => setDraft({ ...draft, scheduleLabel: e.target.value })}
                              placeholder="Optional — e.g. Happy Hour · 4–7 PM"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Offer Description
                          </label>
                          <input
                            type="text"
                            value={draft.subtitle ?? ''}
                            onChange={(e) => setDraft({ ...draft, subtitle: e.target.value })}
                            placeholder="Optional — leave blank for image only"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Button Label
                            </label>
                            <input
                              type="text"
                              value={draft.ctaLabel ?? ''}
                              onChange={(e) => setDraft({ ...draft, ctaLabel: e.target.value })}
                              placeholder="Optional — leave blank to hide button"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Duration (sec)
                            </label>
                            <input
                              type="number"
                              min={3}
                              max={60}
                              value={draft.durationSec ?? 8}
                              onChange={(e) =>
                                setDraft({ ...draft, durationSec: Number(e.target.value) })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-900 font-mono tabular-nums focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        {/* Playback Schedule Section */}
                        <div className="pt-2 border-t border-slate-200 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800">
                              Playback Schedule
                            </span>
                            <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-100">
                              <button
                                type="button"
                                onClick={() => updateDraftSchedule({ mode: 'always' })}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                  draftSchedule.mode !== 'scheduled'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Always Active
                              </button>
                              <button
                                type="button"
                                onClick={() => updateDraftSchedule({ mode: 'scheduled' })}
                                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                  draftSchedule.mode === 'scheduled'
                                    ? 'bg-white text-slate-900 shadow-sm'
                                    : 'text-slate-600 hover:text-slate-900'
                                }`}
                              >
                                Date / Time Window
                              </button>
                            </div>
                          </div>

                          {draftSchedule.mode === 'scheduled' && (
                            <div className="space-y-3 rounded-lg bg-slate-50 border border-slate-200 p-3">
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Start Date (optional)
                                  </label>
                                  <input
                                    type="date"
                                    value={draftSchedule.startDate ?? ''}
                                    onChange={(e) =>
                                      updateDraftSchedule({ startDate: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    End Date (optional)
                                  </label>
                                  <input
                                    type="date"
                                    value={draftSchedule.endDate ?? ''}
                                    min={draftSchedule.startDate || undefined}
                                    onChange={(e) =>
                                      updateDraftSchedule({ endDate: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Daily Start Time (optional)
                                  </label>
                                  <input
                                    type="time"
                                    value={draftSchedule.startTime ?? ''}
                                    onChange={(e) =>
                                      updateDraftSchedule({ startTime: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                                  />
                                </div>
                                <div>
                                  <label className="block text-[11px] font-medium text-slate-600 mb-1">
                                    Daily End Time (optional)
                                  </label>
                                  <input
                                    type="time"
                                    value={draftSchedule.endTime ?? ''}
                                    onChange={(e) =>
                                      updateDraftSchedule({ endTime: e.target.value })
                                    }
                                    className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                                  />
                                </div>
                              </div>

                              {draftEval && (
                                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-600">
                                  <span>
                                    Status:{' '}
                                    <span className="font-medium text-slate-900">
                                      {draftEval.statusLabel}
                                    </span>
                                    <span className="mx-1.5" aria-hidden="true">·</span>
                                    <span>{draftEval.windowSummary}</span>
                                  </span>
                                  {(draftSchedule.startDate ||
                                    draftSchedule.endDate ||
                                    draftSchedule.startTime ||
                                    draftSchedule.endTime) && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        updateDraftSchedule({
                                          startDate: '',
                                          endDate: '',
                                          startTime: '',
                                          endTime: '',
                                        })
                                      }
                                      className="text-slate-500 hover:text-slate-900 underline whitespace-nowrap"
                                    >
                                      Clear dates/times
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
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
                            Save Slide
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex flex-col justify-between h-full gap-2">
                        <div>
                          <div className="flex items-start justify-between gap-3">
                            <h3 className="text-sm font-semibold text-slate-900 leading-snug">
                              {promo.title || (
                                <span className="font-normal text-slate-400">
                                  No overlay text
                                </span>
                              )}
                            </h3>
                            <span className={`text-xs font-medium shrink-0 ${statusColorClass}`}>
                              {evalResult.statusLabel}
                            </span>
                          </div>
                          {promo.subtitle && (
                            <p className="text-xs text-slate-600 mt-1 line-clamp-2">
                              {promo.subtitle}
                            </p>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                          <div className="text-xs text-slate-500 tabular-nums">
                            <span>{promo.mediaKind === 'video' ? 'Video' : 'Image'}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>{promo.durationSec}s hold</span>
                            {(promo.schedule?.mode === 'scheduled' || promo.scheduleLabel) && (
                              <>
                                <span className="mx-1.5" aria-hidden="true">·</span>
                                <span>
                                  {promo.schedule?.mode === 'scheduled'
                                    ? evalResult.windowSummary
                                    : promo.scheduleLabel}
                                </span>
                              </>
                            )}
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => onPreviewSlide(promo.id)}
                              title="Preview slide in emulator"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-amber-700 hover:bg-amber-50 whitespace-nowrap shrink-0"
                            >
                              <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
                              Preview
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setEditingId(promo.id);
                                setDraft({
                                  ...promo,
                                  schedule:
                                    promo.schedule?.mode === 'scheduled'
                                      ? { ...promo.schedule }
                                      : { ...DEFAULT_SCHEDULE, mode: 'scheduled' },
                                });
                              }}
                              title="Schedule date or time window"
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0"
                            >
                              <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                              Schedule
                            </button>
                            <button
                              type="button"
                              onClick={() => moveItem(idx, -1)}
                              disabled={idx === 0}
                              title="Move slide up"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <ArrowUp className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveItem(idx, 1)}
                              disabled={idx === promotions.length - 1}
                              title="Move slide down"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100 disabled:opacity-30"
                            >
                              <ArrowDown className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleActive(promo.id)}
                              title={promo.active ? 'Pause slide' : 'Activate slide'}
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            >
                              {promo.active ? (
                                <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                              ) : (
                                <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => startEdit(promo)}
                              title="Edit slide details"
                              className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                            <button
                              type="button"
                              onClick={() => removeItem(promo.id)}
                              title="Remove slide"
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
