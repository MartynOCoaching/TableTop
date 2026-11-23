import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpRight,
  Building2,
  CalendarClock,
  Check,
  ChevronDown,
  ExternalLink,
  Film,
  Flame,
  Image as ImageIcon,
  Layers,
  Maximize2,
  RefreshCw,
  Star,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import {
  ClientPortalTablesBundle,
  MediaKind,
  PromotionItem,
} from '../types';
import { evaluatePromotionSchedule } from '../utils/schedule';

type TableInspectorTab = 'promotions' | 'media' | 'menu' | 'specials' | 'profile';

interface PreviewMediaItem {
  url: string;
  kind: MediaKind;
  title: string;
  subtitle?: string;
  scheduleSummary?: string;
}

interface ClientTablesModalProps {
  bundle: ClientPortalTablesBundle | null;
  loading: boolean;
  error: string | null;
  clientNameFallback?: string;
  canSyncFromPortal?: boolean;
  syncingFromPortal?: boolean;
  localPortalCounts?: {
    promotions: number;
    menuItems: number;
    specials: number;
  };
  onSyncFromPortal?: () => void;
  onClose: () => void;
  onLoadIntoPortal?: (bundle: ClientPortalTablesBundle) => void;
}

export const ClientTablesModal: React.FC<ClientTablesModalProps> = ({
  bundle,
  loading,
  error,
  clientNameFallback,
  canSyncFromPortal = false,
  syncingFromPortal = false,
  localPortalCounts,
  onSyncFromPortal,
  onClose,
  onLoadIntoPortal,
}) => {
  const [activeTab, setActiveTab] = useState<TableInspectorTab>('promotions');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const [lightboxMedia, setLightboxMedia] = useState<PreviewMediaItem | null>(null);

  const businessName = bundle?.account.businessName || clientNameFallback || 'Client Account';

  const now = new Date();
  const promotionEvaluations = useMemo(() => {
    if (!bundle) return [];
    return bundle.promotions.map((promo) => {
      const asItem: PromotionItem = {
        id: promo.id,
        title: promo.title,
        subtitle: promo.subtitle,
        scheduleLabel: promo.scheduleLabel,
        durationSec: promo.durationSec,
        mediaUrl: promo.mediaUrl,
        mediaKind: promo.mediaKind,
        mediaAssetId: promo.mediaAssetId,
        active: promo.active,
        ctaLabel: promo.ctaLabel,
        schedule: {
          mode: promo.scheduleMode,
          startDate: promo.startDate || undefined,
          endDate: promo.endDate || undefined,
          startTime: promo.startTime || undefined,
          endTime: promo.endTime || undefined,
        },
      };
      return {
        record: promo,
        evalResult: evaluatePromotionSchedule(asItem, now),
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bundle]);

  const livePromoCount = promotionEvaluations.filter((p) => p.evalResult.isEligible).length;
  const scheduledPromoCount = promotionEvaluations.filter(
    (p) => p.record.active && !p.evalResult.isEligible
  ).length;

  const tabs: { id: TableInspectorTab; label: string; count?: number }[] = [
    { id: 'promotions', label: 'Images & Promotions', count: bundle?.promotions.length ?? 0 },
    { id: 'media', label: 'All Stored Media', count: bundle?.mediaAssets.length ?? 0 },
    { id: 'menu', label: 'Menu', count: bundle?.menuItems.length ?? 0 },
    { id: 'specials', label: 'Daily Specials', count: bundle?.specials.length ?? 0 },
    { id: 'profile', label: 'Business Profile & Billing' },
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (lightboxMedia) {
          setLightboxMedia(null);
        } else if (mobileMenuOpen) {
          setMobileMenuOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [lightboxMedia, mobileMenuOpen, onClose]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (mobileMenuRef.current && !mobileMenuRef.current.contains(e.target as Node)) {
        setMobileMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [mobileMenuOpen]);

  const activeTabMeta = tabs.find((t) => t.id === activeTab) ?? tabs[0];

  const formatDateTime = (raw?: string) => {
    if (!raw) return 'Not published yet';
    try {
      return new Date(raw).toLocaleString();
    } catch {
      return raw;
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-tables-modal-title"
      onClick={onClose}
    >
      <div
        className="w-full max-w-5xl max-h-[92vh] rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4 bg-white">
          <div className="min-w-0 flex-1 space-y-2.5">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
                <h2
                  id="client-tables-modal-title"
                  className="text-base font-semibold text-slate-900 truncate"
                >
                  {businessName}
                </h2>
                {bundle && (
                  <span
                    className={`text-xs font-medium capitalize shrink-0 ${
                      bundle.account.status === 'active'
                        ? 'text-emerald-700'
                        : bundle.account.status === 'onboarding'
                          ? 'text-amber-700'
                          : 'text-slate-400'
                    }`}
                  >
                    · {bundle.account.status}
                  </span>
                )}
              </div>
              {bundle && (
                <p className="text-xs text-slate-500 mt-0.5 tabular-nums truncate">
                  {bundle.account.contactEmail || 'No contact email'} · {bundle.promotions.length} promos ({livePromoCount} live, {scheduledPromoCount} scheduled) · {bundle.mediaAssets.length} uploaded images/videos · {bundle.menuItems.length} menu items · {bundle.specials.length} specials
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {canSyncFromPortal && onSyncFromPortal && (
                <button
                  type="button"
                  onClick={onSyncFromPortal}
                  disabled={syncingFromPortal}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100 whitespace-nowrap disabled:opacity-60"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${syncingFromPortal ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                  {syncingFromPortal ? 'Syncing Portal...' : 'Sync Latest Uploads'}
                </button>
              )}

              {bundle && onLoadIntoPortal && (
                <button
                  type="button"
                  onClick={() => onLoadIntoPortal(bundle)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                >
                  <ArrowUpRight className="w-3.5 h-3.5" aria-hidden="true" />
                  Load into Client Portal
                </button>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors shrink-0"
            aria-label="Exit selected client"
            title="Exit selected client (Esc)"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        {/* Always-Visible Client Billing & Units Strip */}
        {bundle && (
          <div className="border-b border-slate-200 bg-slate-50/60 px-5 py-2.5 grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
            <div>
              <span className="text-slate-500">Active Table Top Units</span>
              <div className="font-mono font-semibold text-slate-900 tabular-nums mt-0.5">
                {bundle.account.activeUnits} units
              </div>
            </div>
            <div>
              <span className="text-slate-500">Monthly Subscription</span>
              <div className="font-mono font-medium text-slate-900 tabular-nums mt-0.5">
                ${bundle.account.monthlySubscriptionFee.toFixed(2)}/mo
              </div>
            </div>
            <div>
              <span className="text-slate-500">Monthly Credit (Ad Spend)</span>
              <div
                className={`font-mono font-medium tabular-nums mt-0.5 ${
                  bundle.account.adProgramOptedIn && bundle.account.monthlyCredit > 0
                    ? 'text-emerald-700'
                    : 'text-slate-500'
                }`}
              >
                {bundle.account.adProgramOptedIn && bundle.account.monthlyCredit > 0
                  ? `−$${bundle.account.monthlyCredit.toFixed(2)}/mo`
                  : '$0.00/mo'}
              </div>
            </div>
            <div>
              <span className="text-slate-500">Total Monthly Bill</span>
              <div className="font-mono font-bold text-slate-900 tabular-nums mt-0.5">
                ${bundle.account.totalMonthlyBill.toFixed(2)}/mo
              </div>
            </div>
            <div>
              <span className="text-slate-500">Ad Network</span>
              <div
                className={`font-medium mt-0.5 ${
                  bundle.account.adProgramOptedIn ? 'text-emerald-700' : 'text-slate-600'
                }`}
              >
                {bundle.account.adProgramOptedIn ? 'Opted In' : 'Opted Out'}
              </div>
            </div>
          </div>
        )}

        {/* Subcollection Navigation: Dropdown on small screens (< md), Tabs on md+ */}
        <div className="md:hidden px-4 py-2.5 border-b border-slate-200 bg-slate-50 relative z-20" ref={mobileMenuRef}>
          <button
            type="button"
            onClick={() => setMobileMenuOpen((prev) => !prev)}
            aria-expanded={mobileMenuOpen}
            aria-haspopup="listbox"
            className="w-full flex items-center justify-between gap-3 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-medium text-slate-900 shadow-sm hover:border-slate-400 focus:outline-none focus:ring-2 focus:ring-amber-600"
          >
            <span className="flex items-center gap-1.5 truncate">
              <span className="truncate">{activeTabMeta.label}</span>
              {typeof activeTabMeta.count === 'number' && (
                <span className="font-mono text-[11px] text-slate-500 tabular-nums">
                  ({activeTabMeta.count})
                </span>
              )}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-500 shrink-0 transition-transform ${
                mobileMenuOpen ? 'rotate-180' : ''
              }`}
              aria-hidden="true"
            />
          </button>

          {mobileMenuOpen && (
            <div
              role="listbox"
              aria-label="Client sections"
              className="absolute left-4 right-4 top-full mt-1.5 rounded-xl border border-slate-200 bg-white shadow-xl py-1 divide-y divide-slate-100 overflow-hidden"
            >
              {tabs.map((tab) => {
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    role="option"
                    aria-selected={isActive}
                    onClick={() => {
                      setActiveTab(tab.id);
                      setMobileMenuOpen(false);
                    }}
                    className={`w-full px-3.5 py-2.5 text-left text-xs flex items-center justify-between gap-2 transition-colors ${
                      isActive
                        ? 'bg-amber-50/80 font-semibold text-slate-900'
                        : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      <span>{tab.label}</span>
                      {typeof tab.count === 'number' && (
                        <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                          ({tab.count})
                        </span>
                      )}
                    </span>
                    {isActive && (
                      <Check className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <div className="hidden md:flex px-5 border-b border-slate-200 bg-slate-50 items-center gap-5 overflow-x-auto">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`py-3 text-xs font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 ${
                  isActive
                    ? 'border-slate-900 text-slate-900'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {typeof tab.count === 'number' && (
                  <span className="font-mono text-[11px] text-slate-400 tabular-nums">
                    ({tab.count})
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Content Body */}
        <div className="flex-1 overflow-y-auto p-5 bg-white">
          {loading ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Loading client images, promotions, and tables...
            </div>
          ) : error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
              {error}
            </div>
          ) : !bundle ? (
            <div className="py-16 text-center text-sm text-slate-500">
              No records found for this client yet.
            </div>
          ) : (
            <>
              {/* 1. Images & Promotions (Default Tab) */}
              {activeTab === 'promotions' && (
                <div className="space-y-6">
                  {canSyncFromPortal &&
                    localPortalCounts &&
                    (localPortalCounts.promotions !== bundle.promotions.length ||
                      bundle.promotions.length === 0) &&
                    onSyncFromPortal && (
                      <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <span className="text-slate-700">
                          Client Portal workspace for <strong>{businessName}</strong> currently holds{' '}
                          <span className="font-mono font-medium">{localPortalCounts.promotions}</span>{' '}
                          promotions,{' '}
                          <span className="font-mono font-medium">{localPortalCounts.menuItems}</span>{' '}
                          menu items, and{' '}
                          <span className="font-mono font-medium">{localPortalCounts.specials}</span>{' '}
                          specials.
                        </span>
                        <button
                          type="button"
                          onClick={onSyncFromPortal}
                          disabled={syncingFromPortal}
                          className="rounded-md bg-amber-700 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-800 whitespace-nowrap disabled:opacity-60"
                        >
                          {syncingFromPortal ? 'Syncing...' : 'Pull Latest from Portal'}
                        </button>
                      </div>
                    )}

                  {/* Promotions & Scheduled Device Playback */}
                  <section className="space-y-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Device Promotions & Scheduled Playback ({bundle.promotions.length})
                      </h3>
                      <div className="text-xs text-slate-500 tabular-nums">
                        <span>{livePromoCount} playing now</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{scheduledPromoCount} scheduled / off-hours</span>
                      </div>
                    </div>

                    {bundle.promotions.length === 0 ? (
                      <div className="py-10 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg space-y-2">
                        <p>No promotions uploaded for {businessName} yet.</p>
                        {canSyncFromPortal && onSyncFromPortal && (
                          <button
                            type="button"
                            onClick={onSyncFromPortal}
                            disabled={syncingFromPortal}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800"
                          >
                            <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                            Import Client Portal Uploads
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                        {promotionEvaluations.map(({ record: promo, evalResult }) => {
                          const statusColor =
                            evalResult.status === 'live'
                              ? 'text-emerald-700'
                              : evalResult.status === 'scheduled' || evalResult.status === 'off-hours'
                                ? 'text-amber-700'
                                : 'text-slate-400';

                          return (
                            <div
                              key={promo.id}
                              className="rounded-xl border border-slate-200 bg-white p-3.5 flex gap-3.5 items-start"
                            >
                              <button
                                type="button"
                                onClick={() =>
                                  promo.mediaUrl &&
                                  setLightboxMedia({
                                    url: promo.mediaUrl,
                                    kind: promo.mediaKind,
                                    title: promo.title || promo.scheduleLabel || 'Promotion Slide',
                                    subtitle: promo.subtitle,
                                    scheduleSummary: `${evalResult.statusLabel} · ${evalResult.windowSummary}`,
                                  })
                                }
                                disabled={!promo.mediaUrl}
                                title={promo.mediaUrl ? 'Click to preview full media' : 'No media'}
                                className="group relative w-24 h-36 rounded-lg border border-slate-200 bg-slate-950 overflow-hidden shrink-0 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-amber-600"
                              >
                                {promo.mediaUrl ? (
                                  <>
                                    {promo.mediaKind === 'video' ? (
                                      <video
                                        src={promo.mediaUrl}
                                        className="w-full h-full object-contain"
                                        muted
                                        loop
                                        playsInline
                                      />
                                    ) : (
                                      <img
                                        src={promo.mediaUrl}
                                        alt={promo.title || 'Promotion slide'}
                                        className="w-full h-full object-contain"
                                      />
                                    )}
                                    <span className="absolute bottom-1.5 right-1.5 p-1 rounded bg-slate-950/75 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                      <Maximize2 className="w-3 h-3" aria-hidden="true" />
                                    </span>
                                  </>
                                ) : (
                                  <ImageIcon className="w-5 h-5 text-slate-500" aria-hidden="true" />
                                )}
                              </button>

                              <div className="flex-1 min-w-0 space-y-1.5 text-xs">
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-semibold text-slate-900 leading-snug">
                                    {promo.title || (
                                      <span className="font-normal text-slate-400">
                                        Image Only (No overlay text)
                                      </span>
                                    )}
                                  </div>
                                  <span className={`font-medium shrink-0 ${statusColor}`}>
                                    {evalResult.statusLabel}
                                  </span>
                                </div>

                                {promo.scheduleLabel && (
                                  <div className="text-slate-600 font-medium">
                                    {promo.scheduleLabel}
                                  </div>
                                )}

                                {promo.subtitle && (
                                  <p className="text-slate-600 line-clamp-2 leading-relaxed">
                                    {promo.subtitle}
                                  </p>
                                )}

                                <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                                  <span className="inline-flex items-center gap-1">
                                    {promo.mediaKind === 'video' ? (
                                      <Film className="w-3 h-3" aria-hidden="true" />
                                    ) : (
                                      <ImageIcon className="w-3 h-3" aria-hidden="true" />
                                    )}
                                    {promo.mediaKind === 'video' ? 'Video' : 'Image'}
                                  </span>
                                  <span aria-hidden="true">·</span>
                                  <span>{promo.durationSec}s hold</span>
                                  {promo.ctaLabel && (
                                    <>
                                      <span aria-hidden="true">·</span>
                                      <span>CTA: {promo.ctaLabel}</span>
                                    </>
                                  )}
                                </div>

                                <div className="pt-1 flex items-center gap-1.5 text-[11px] text-slate-700">
                                  <CalendarClock
                                    className="w-3.5 h-3.5 text-amber-700 shrink-0"
                                    aria-hidden="true"
                                  />
                                  <span className="font-mono">
                                    {promo.scheduleMode === 'scheduled'
                                      ? evalResult.windowSummary
                                      : 'Always in device rotation'}
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>

                  {/* Visual Uploaded Images & Videos Gallery */}
                  <section className="space-y-3 pt-2 border-t border-slate-200">
                    <div className="flex items-baseline justify-between gap-2">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Uploaded Client Media ({bundle.mediaAssets.length})
                      </h3>
                      <span className="text-xs text-slate-500">
                        Click any image or video to inspect full size
                      </span>
                    </div>

                    {bundle.mediaAssets.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                        No uploaded images or videos stored for this client yet.
                      </div>
                    ) : (
                      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {bundle.mediaAssets.map((asset) => (
                          <div
                            key={asset.id}
                            className="rounded-lg border border-slate-200 bg-white overflow-hidden flex flex-col"
                          >
                            <button
                              type="button"
                              onClick={() =>
                                setLightboxMedia({
                                  url: asset.url,
                                  kind: asset.kind,
                                  title: asset.label,
                                  subtitle: `Source: ${asset.sourceType}`,
                                })
                              }
                              className="group relative aspect-square bg-slate-950 overflow-hidden flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-inset focus:ring-amber-600"
                            >
                              {asset.kind === 'video' ? (
                                <video
                                  src={asset.url}
                                  className="w-full h-full object-contain"
                                  muted
                                  loop
                                  playsInline
                                />
                              ) : (
                                <img
                                  src={asset.url}
                                  alt={asset.label}
                                  className="w-full h-full object-contain"
                                />
                              )}
                              <span className="absolute bottom-2 right-2 p-1.5 rounded-md bg-slate-950/75 text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                <Maximize2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </span>
                            </button>
                            <div className="p-2.5 text-xs space-y-0.5">
                              <div className="font-medium text-slate-900 truncate">
                                {asset.label}
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center justify-between gap-2">
                                <span className="capitalize">{asset.sourceType}</span>
                                <span className="uppercase font-mono">{asset.kind}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* 2. Stored Media Assets Registry (Full Table + Links) */}
              {activeTab === 'media' && (
                <div className="space-y-3">
                  {bundle.mediaAssets.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                      No images or videos stored in <code className="font-mono">mediaAssets</code> table yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2.5 px-3 font-medium">Preview</th>
                            <th className="py-2.5 px-3 font-medium">Asset Label</th>
                            <th className="py-2.5 px-3 font-medium">Media Kind</th>
                            <th className="py-2.5 px-3 font-medium">Source Table</th>
                            <th className="py-2.5 px-3 font-medium">Stored URL</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {bundle.mediaAssets.map((asset) => (
                            <tr key={asset.id} className="align-middle hover:bg-slate-50/70">
                              <td className="py-2.5 px-3 w-16">
                                <button
                                  type="button"
                                  onClick={() =>
                                    setLightboxMedia({
                                      url: asset.url,
                                      kind: asset.kind,
                                      title: asset.label,
                                      subtitle: `Source: ${asset.sourceType}`,
                                    })
                                  }
                                  className="w-12 h-12 rounded border border-slate-200 bg-slate-950 overflow-hidden block"
                                >
                                  {asset.kind === 'video' ? (
                                    <video
                                      src={asset.url}
                                      className="w-full h-full object-contain"
                                      muted
                                    />
                                  ) : (
                                    <img
                                      src={asset.url}
                                      alt={asset.label}
                                      className="w-full h-full object-contain"
                                    />
                                  )}
                                </button>
                              </td>
                              <td className="py-2.5 px-3 font-medium text-slate-900">
                                {asset.label}
                              </td>
                              <td className="py-2.5 px-3 uppercase font-mono text-[11px] text-slate-600">
                                {asset.kind}
                              </td>
                              <td className="py-2.5 px-3 capitalize text-slate-700">
                                {asset.sourceType}
                              </td>
                              <td className="py-2.5 px-3 max-w-[280px]">
                                <a
                                  href={asset.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1 font-mono text-[11px] text-amber-700 hover:underline truncate max-w-full"
                                >
                                  <span className="truncate">{asset.url}</span>
                                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                                </a>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 3. Menu Categories & Menu Items Table */}
              {activeTab === 'menu' && (
                <div className="space-y-5">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                      Menu Categories ({bundle.categories.length})
                    </h3>
                    {bundle.categories.length === 0 ? (
                      <p className="text-xs text-slate-500">No menu categories stored.</p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {bundle.categories.map((cat) => (
                          <div
                            key={cat.id}
                            className="rounded-md border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-800"
                          >
                            {cat.name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-2 flex items-center gap-1.5">
                      <UtensilsCrossed className="w-3.5 h-3.5" aria-hidden="true" />
                      Menu Items ({bundle.menuItems.length})
                    </h3>
                    {bundle.menuItems.length === 0 ? (
                      <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                        No items stored in <code className="font-mono">menuItems</code> table yet.
                      </div>
                    ) : (
                      <div className="overflow-x-auto border border-slate-200 rounded-lg">
                        <table className="w-full text-left border-collapse text-xs">
                          <thead>
                            <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                              <th className="py-2.5 px-3 font-medium">Image</th>
                              <th className="py-2.5 px-3 font-medium">Item Name</th>
                              <th className="py-2.5 px-3 font-medium">Category</th>
                              <th className="py-2.5 px-3 font-medium">Price</th>
                              <th className="py-2.5 px-3 font-medium">Dietary & Description</th>
                              <th className="py-2.5 px-3 font-medium">Available to Order</th>
                              <th className="py-2.5 px-3 font-medium">House Favorite</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200">
                            {bundle.menuItems.map((item) => (
                              <tr key={item.id} className="align-top hover:bg-slate-50/70">
                                <td className="py-3 px-3 w-16">
                                  {item.mediaUrl ? (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setLightboxMedia({
                                          url: item.mediaUrl,
                                          kind: 'image',
                                          title: item.name,
                                          subtitle: item.description,
                                        })
                                      }
                                      className="w-12 h-12 rounded border border-slate-200 overflow-hidden block"
                                    >
                                      <img
                                        src={item.mediaUrl}
                                        alt={item.name}
                                        className="w-full h-full object-cover"
                                      />
                                    </button>
                                  ) : (
                                    <div className="w-12 h-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                                      <ImageIcon className="w-4 h-4" />
                                    </div>
                                  )}
                                </td>
                                <td className="py-3 px-3 font-medium text-slate-900 min-w-[140px]">
                                  {item.name}
                                </td>
                                <td className="py-3 px-3 text-slate-700">
                                  {item.categoryNames && item.categoryNames.length > 0
                                    ? item.categoryNames.join(', ')
                                    : item.categoryName || item.categoryId}
                                </td>
                                <td className="py-3 px-3 font-mono font-medium text-slate-900 tabular-nums whitespace-nowrap">
                                  ${item.price.toFixed(2)}
                                </td>
                                <td className="py-3 px-3 max-w-[260px]">
                                  {item.dietaryNotes && (
                                    <div className="font-medium text-amber-700 mb-0.5">
                                      {item.dietaryNotes}
                                    </div>
                                  )}
                                  <div className="text-slate-600">
                                    {item.description || <span className="text-slate-400">—</span>}
                                  </div>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  <span
                                    className={`inline-flex items-center gap-1 font-medium ${
                                      item.available ? 'text-emerald-700' : 'text-slate-400'
                                    }`}
                                  >
                                    {item.available && <Check className="w-3 h-3" />}
                                    {item.available ? 'Available' : 'Sold Out'}
                                  </span>
                                </td>
                                <td className="py-3 px-3 whitespace-nowrap">
                                  {item.featured ? (
                                    <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                                      <Star className="w-3 h-3 fill-amber-500 text-amber-600" />
                                      House Favorite
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Standard</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 4. Daily Specials Table */}
              {activeTab === 'specials' && (
                <div className="space-y-3">
                  {bundle.specials.length === 0 ? (
                    <div className="py-12 text-center text-xs text-slate-500 border border-dashed border-slate-200 rounded-lg">
                      No specials stored in <code className="font-mono">specials</code> table yet.
                    </div>
                  ) : (
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-slate-500">
                            <th className="py-2.5 px-3 font-medium">Preview</th>
                            <th className="py-2.5 px-3 font-medium">Special Name</th>
                            <th className="py-2.5 px-3 font-medium">Availability Window</th>
                            <th className="py-2.5 px-3 font-medium">Description</th>
                            <th className="py-2.5 px-3 font-medium">Special Price</th>
                            <th className="py-2.5 px-3 font-medium">Regular Price</th>
                            <th className="py-2.5 px-3 font-medium">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-200">
                          {bundle.specials.map((special) => (
                            <tr key={special.id} className="align-top hover:bg-slate-50/70">
                              <td className="py-3 px-3 w-16">
                                {special.mediaUrl ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setLightboxMedia({
                                        url: special.mediaUrl,
                                        kind: special.mediaKind,
                                        title: special.title,
                                        subtitle: special.description,
                                        scheduleSummary: special.windowLabel,
                                      })
                                    }
                                    className="w-12 h-12 rounded border border-slate-200 overflow-hidden block"
                                  >
                                    <img
                                      src={special.mediaUrl}
                                      alt={special.title}
                                      className="w-full h-full object-cover"
                                    />
                                  </button>
                                ) : (
                                  <div className="w-12 h-12 rounded border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-400">
                                    <Flame className="w-4 h-4" />
                                  </div>
                                )}
                              </td>
                              <td className="py-3 px-3 font-medium text-slate-900 min-w-[150px]">
                                {special.title}
                              </td>
                              <td className="py-3 px-3 text-slate-700 min-w-[140px]">
                                {special.windowLabel || <span className="text-slate-400">—</span>}
                              </td>
                              <td className="py-3 px-3 text-slate-600 max-w-[260px]">
                                {special.description || <span className="text-slate-400">—</span>}
                              </td>
                              <td className="py-3 px-3 font-mono font-semibold text-slate-900 tabular-nums whitespace-nowrap">
                                ${special.specialPrice.toFixed(2)}
                              </td>
                              <td className="py-3 px-3 font-mono text-slate-500 tabular-nums whitespace-nowrap">
                                {special.regularPrice > 0
                                  ? `$${special.regularPrice.toFixed(2)}`
                                  : '—'}
                              </td>
                              <td className="py-3 px-3 whitespace-nowrap">
                                <span
                                  className={`font-medium ${
                                    special.active ? 'text-emerald-700' : 'text-slate-400'
                                  }`}
                                >
                                  {special.active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* 5. Business Profile & Billing Details */}
              {activeTab === 'profile' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Business Profile
                    </h3>
                    <dl className="space-y-2 text-xs">
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Business Name</dt>
                        <dd className="font-medium text-slate-900 text-right">
                          {bundle.account.businessName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Tagline</dt>
                        <dd className="text-slate-800 text-right">
                          {bundle.account.tagline || '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Contact Email</dt>
                        <dd className="font-mono text-slate-800 text-right">
                          {bundle.account.contactEmail || '—'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Account Status</dt>
                        <dd className="font-medium capitalize text-slate-900">
                          {bundle.account.status}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Display Theme</dt>
                        <dd className="font-medium capitalize text-slate-900">
                          {bundle.account.accentTheme || 'amber'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1">
                        <dt className="text-slate-500">Last Published</dt>
                        <dd className="font-mono text-slate-700 text-right">
                          {formatDateTime(bundle.account.lastPublishedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-lg border border-slate-200 p-4 space-y-3">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Units, Billing & Ad Network
                    </h3>
                    <dl className="space-y-2 text-xs">
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Active Table Top Units</dt>
                        <dd className="font-mono font-semibold text-slate-900 tabular-nums">
                          {bundle.account.activeUnits} units
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Ad Network Opt-In Status</dt>
                        <dd
                          className={`font-medium ${
                            bundle.account.adProgramOptedIn
                              ? 'text-emerald-700'
                              : 'text-slate-600'
                          }`}
                        >
                          {bundle.account.adProgramOptedIn ? 'Opted In' : 'Opted Out'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Rotation Ratio</dt>
                        <dd className="text-slate-800 text-right">
                          {bundle.account.rotationRatioLabel ||
                            '1 partner slot per 3 venue promos'}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Monthly Subscription Fee</dt>
                        <dd className="font-mono text-slate-900 tabular-nums">
                          ${bundle.account.monthlySubscriptionFee.toFixed(2)}/mo
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1 border-b border-slate-100">
                        <dt className="text-slate-500">Monthly Credit (Ad Spend)</dt>
                        <dd className="font-mono text-emerald-700 tabular-nums">
                          −${bundle.account.monthlyCredit.toFixed(2)}/mo
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4 py-1">
                        <dt className="font-semibold text-slate-800">Total Monthly Bill</dt>
                        <dd className="font-mono font-bold text-slate-900 tabular-nums">
                          ${bundle.account.totalMonthlyBill.toFixed(2)}/mo
                        </dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Full-Size Media Preview Lightbox */}
      {lightboxMedia && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/85 p-4"
          onClick={() => setLightboxMedia(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 text-white overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold truncate">{lightboxMedia.title}</h3>
                {lightboxMedia.scheduleSummary && (
                  <p className="text-xs text-amber-400 mt-0.5 truncate">
                    {lightboxMedia.scheduleSummary}
                  </p>
                )}
              </div>
              <button
                type="button"
                onClick={() => setLightboxMedia(null)}
                className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-slate-800"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="bg-black flex items-center justify-center max-h-[70vh] p-4">
              {lightboxMedia.kind === 'video' ? (
                <video
                  src={lightboxMedia.url}
                  controls
                  autoPlay
                  loop
                  className="max-h-[64vh] w-auto max-w-full rounded"
                />
              ) : (
                <img
                  src={lightboxMedia.url}
                  alt={lightboxMedia.title}
                  className="max-h-[64vh] w-auto max-w-full object-contain rounded"
                />
              )}
            </div>
            {lightboxMedia.subtitle && (
              <div className="px-4 py-3 border-t border-slate-800 text-xs text-slate-300">
                {lightboxMedia.subtitle}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
