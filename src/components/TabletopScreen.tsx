import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Sparkles, Utensils, X } from 'lucide-react';
import {
  AccentTheme,
  AdminNetworkAd,
  EmulatorMode,
  MenuItem,
  PortalState,
  PromotionItem,
} from '../types';
import { evaluatePromotionSchedule } from '../utils/schedule';
import { MediaAsset } from './MediaAsset';

export type AttractSlide =
  | { kind: 'promo'; data: PromotionItem }
  | { kind: 'ad'; data: AdminNetworkAd };

const THEME_TOKENS: Record<
  AccentTheme,
  { buttonBg: string; buttonText: string; highlightText: string; activeTabBg: string }
> = {
  amber: {
    buttonBg: 'bg-amber-500 hover:bg-amber-400',
    buttonText: 'text-stone-950',
    highlightText: 'text-amber-400',
    activeTabBg: 'bg-amber-500 text-stone-950',
  },
  emerald: {
    buttonBg: 'bg-emerald-500 hover:bg-emerald-400',
    buttonText: 'text-stone-950',
    highlightText: 'text-emerald-400',
    activeTabBg: 'bg-emerald-500 text-stone-950',
  },
  crimson: {
    buttonBg: 'bg-rose-500 hover:bg-rose-400',
    buttonText: 'text-white',
    highlightText: 'text-rose-400',
    activeTabBg: 'bg-rose-600 text-white',
  },
  slate: {
    buttonBg: 'bg-stone-100 hover:bg-white',
    buttonText: 'text-stone-950',
    highlightText: 'text-stone-200',
    activeTabBg: 'bg-stone-100 text-stone-950',
  },
};

export function buildAttractSlides(
  state: PortalState,
  networkAds: AdminNetworkAd[],
  now: Date = new Date()
): AttractSlide[] {
  const activePromos = state.promotions.filter(
    (p) => evaluatePromotionSchedule(p, now).isEligible
  );
  const list: AttractSlide[] = [];

  if (activePromos.length === 0) {
    if (state.adMonetization.optedIn && networkAds.length > 0) {
      networkAds.forEach((ad) => list.push({ kind: 'ad', data: ad }));
    }
    return list;
  }

  let adCursor = 0;
  activePromos.forEach((promo, idx) => {
    list.push({ kind: 'promo', data: promo });
    if (
      state.adMonetization.optedIn &&
      networkAds.length > 0 &&
      ((idx + 1) % 2 === 0 || idx === activePromos.length - 1)
    ) {
      list.push({ kind: 'ad', data: networkAds[adCursor % networkAds.length] });
      adCursor += 1;
    }
  });

  return list;
}

interface TabletopScreenProps {
  state: PortalState;
  networkAds: AdminNetworkAd[];
  mode: EmulatorMode;
  onModeChange: (mode: EmulatorMode) => void;
  slideIndex: number;
  onSlideIndexChange: (index: number) => void;
  isPlaying?: boolean;
  focusedCategoryId?: string | null;
  adIndex?: number;
  onAdIndexChange?: (index: number) => void;
  nativeDevice?: boolean;
  nowOverride?: Date | null;
}

export const TabletopScreen: React.FC<TabletopScreenProps> = ({
  state,
  networkAds,
  mode,
  onModeChange,
  slideIndex,
  onSlideIndexChange,
  isPlaying = true,
  focusedCategoryId,
  adIndex = 0,
  onAdIndexChange,
  nativeDevice = false,
  nowOverride = null,
}) => {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    state.categories[0]?.id ?? ''
  );
  const [inspectedItem, setInspectedItem] = useState<MenuItem | null>(null);
  const [clockNow, setClockNow] = useState<Date>(() => new Date());
  const [nineSixteenMap, setNineSixteenMap] = useState<Record<string, boolean>>({});
  const screenRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<{ x: number; y: number } | null>(null);

  const handleAspectReport = (src: string | undefined, isNineSixteen: boolean) => {
    if (!src) return;
    setNineSixteenMap((prev) => {
      if (prev[src] === isNineSixteen) return prev;
      return { ...prev, [src]: isNineSixteen };
    });
  };

  useEffect(() => {
    if (nowOverride) return;
    const interval = window.setInterval(() => {
      setClockNow(new Date());
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [nowOverride]);

  const effectiveNow = nowOverride ?? clockNow;

  const tokens = THEME_TOKENS[state.venue.accentTheme];
  const attractSlides = useMemo(
    () => buildAttractSlides(state, networkAds, effectiveNow),
    [state, networkAds, effectiveNow]
  );

  useEffect(() => {
    if (mode !== 'menu') {
      setInspectedItem(null);
    }
  }, [mode]);

  useEffect(() => {
    if (focusedCategoryId) {
      setActiveCategoryId(focusedCategoryId);
    }
  }, [focusedCategoryId]);

  useEffect(() => {
    if (!state.categories.some((c) => c.id === activeCategoryId)) {
      setActiveCategoryId(state.categories[0]?.id ?? '');
    }
  }, [state.categories, activeCategoryId]);

  useEffect(() => {
    if (slideIndex >= attractSlides.length && attractSlides.length > 0) {
      onSlideIndexChange(0);
    }
  }, [attractSlides.length, slideIndex, onSlideIndexChange]);

  useEffect(() => {
    if (mode !== 'attract' || !isPlaying || attractSlides.length <= 1) return;
    const current = attractSlides[slideIndex];
    const durationMs = (current?.data.durationSec ?? 8) * 1000;
    const timer = window.setTimeout(() => {
      onSlideIndexChange((slideIndex + 1) % attractSlides.length);
    }, durationMs);
    return () => window.clearTimeout(timer);
  }, [mode, isPlaying, slideIndex, attractSlides, onSlideIndexChange]);

  // Return to Highlights ('attract') after 20 seconds of no interaction with the screen
  useEffect(() => {
    if (mode === 'attract') return;

    const IDLE_TIMEOUT_MS = 20_000;
    const target: Window | HTMLDivElement | null = nativeDevice ? window : screenRef.current;
    if (!target) return;

    const returnToHighlights = () => {
      setInspectedItem(null);
      onSlideIndexChange(0);
      onModeChange('attract');
    };

    let timerId = window.setTimeout(returnToHighlights, IDLE_TIMEOUT_MS);

    const resetTimer = () => {
      window.clearTimeout(timerId);
      timerId = window.setTimeout(returnToHighlights, IDLE_TIMEOUT_MS);
    };

    const events = [
      'pointerdown',
      'mousedown',
      'touchstart',
      'touchmove',
      'touchend',
      'click',
      'wheel',
      'scroll',
      'keydown',
    ];

    events.forEach((evt) => {
      target.addEventListener(evt, resetTimer, { capture: true, passive: true });
    });

    return () => {
      window.clearTimeout(timerId);
      events.forEach((evt) => {
        target.removeEventListener(evt, resetTimer, { capture: true });
      });
    };
  }, [mode, nativeDevice, onModeChange, onSlideIndexChange]);

  const currentSlide = attractSlides[slideIndex] ?? null;
  const isAttractNineSixteen = Boolean(
    currentSlide?.data.mediaUrl && nineSixteenMap[currentSlide.data.mediaUrl]
  );
  const hasAttractAdText =
    currentSlide?.kind === 'ad' &&
    Boolean(
      currentSlide.data.sponsorName.trim() ||
        currentSlide.data.headline.trim() ||
        currentSlide.data.bodyCopy.trim()
    );
  const showAttractOverlay =
    hasAttractAdText ||
    (currentSlide?.kind === 'promo' &&
      Boolean(
        currentSlide.data.scheduleLabel.trim() ||
          currentSlide.data.title.trim() ||
          currentSlide.data.subtitle.trim() ||
          currentSlide.data.ctaLabel?.trim()
      ));
  const currentAd =
    state.adMonetization.optedIn && networkAds.length > 0
      ? networkAds[adIndex % networkAds.length]
      : null;
  const hasCurrentAdText = Boolean(
    currentAd &&
      (currentAd.sponsorName.trim() ||
        currentAd.headline.trim() ||
        currentAd.bodyCopy.trim())
  );
  const isAdNineSixteen = Boolean(currentAd?.mediaUrl && nineSixteenMap[currentAd.mediaUrl]);
  const activeSpecials = state.specials.filter((s) => s.active);
  const categoryItems = state.menuItems.filter((item) => {
    const ids =
      Array.isArray(item.categoryIds) && item.categoryIds.length > 0
        ? item.categoryIds
        : item.categoryId
          ? [item.categoryId]
          : [];
    return ids.includes(activeCategoryId);
  });

  return (
    <div
      ref={screenRef}
      tabIndex={-1}
      className="relative w-full h-full overflow-hidden bg-[#141210] text-stone-100 flex flex-col select-none focus:outline-none"
    >
      {/* In-Device Venue Top Bar */}
      <div
        className={`relative z-20 flex items-center justify-between bg-stone-950/90 border-b border-white/10 ${
          nativeDevice ? 'px-5 py-3.5' : 'px-4 py-2.5'
        }`}
      >
        <div className="min-w-0 pr-2">
          <div
            className={`font-display font-semibold tracking-tight text-white truncate ${
              nativeDevice ? 'text-sm' : 'text-xs'
            }`}
          >
            {state.venue.name}
          </div>
          <div
            className={`text-stone-400 truncate ${
              nativeDevice ? 'text-[11px]' : 'text-[10px]'
            }`}
          >
            {state.venue.tagline}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              setInspectedItem(null);
              onModeChange('attract');
            }}
            className={`rounded font-medium transition-colors whitespace-nowrap ${
              nativeDevice ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'
            } ${
              mode === 'attract'
                ? tokens.activeTabBg
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Highlights
          </button>
          <button
            type="button"
            onClick={() => {
              setInspectedItem(null);
              onModeChange('menu');
            }}
            className={`rounded font-medium transition-colors whitespace-nowrap ${
              nativeDevice ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'
            } ${
              mode === 'menu'
                ? tokens.activeTabBg
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Menu
          </button>
          <button
            type="button"
            onClick={() => {
              setInspectedItem(null);
              onModeChange('specials');
            }}
            className={`rounded font-medium transition-colors whitespace-nowrap ${
              nativeDevice ? 'px-2.5 py-1.5 text-xs' : 'px-2 py-1 text-[11px]'
            } ${
              mode === 'specials'
                ? tokens.activeTabBg
                : 'text-stone-300 hover:text-white hover:bg-white/10'
            }`}
          >
            Specials
          </button>
        </div>
      </div>

      {/* Screen Viewport Content */}
      <div className="relative flex-1 min-h-0 overflow-hidden">
        {/* 1. ATTRACT LOOP VIEW */}
        {mode === 'attract' && (
          <div
            onPointerDown={(e) => {
              swipeStartRef.current = { x: e.clientX, y: e.clientY };
            }}
            onPointerUp={(e) => {
              const start = swipeStartRef.current;
              swipeStartRef.current = null;
              if (!start || attractSlides.length <= 1) return;
              const dx = e.clientX - start.x;
              const dy = e.clientY - start.y;
              if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
                if (dx < 0) {
                  onSlideIndexChange((slideIndex + 1) % attractSlides.length);
                } else {
                  onSlideIndexChange(
                    (slideIndex - 1 + attractSlides.length) % attractSlides.length
                  );
                }
              }
            }}
            className="relative w-full h-full flex flex-col bg-[#141210] overflow-hidden touch-pan-y"
          >
            {currentSlide ? (
              <>
                {/* Slide Progress Strip */}
                {attractSlides.length > 1 && (
                  <div className="absolute top-3 inset-x-4 flex items-center gap-1.5 z-20">
                    {attractSlides.map((s, idx) => (
                      <button
                        key={`${s.kind}-${s.data.id}-${idx}`}
                        type="button"
                        onClick={() => onSlideIndexChange(idx)}
                        aria-label={`Jump to slide ${idx + 1}`}
                        className={`h-1 flex-1 rounded-full transition-colors ${
                          idx === slideIndex ? 'bg-white' : 'bg-white/30 hover:bg-white/50'
                        }`}
                      />
                    ))}
                  </div>
                )}

                {/* Media Stage: 9:16 fills edge-to-edge; other sizes fit inside viewport dimensions */}
                <div
                  className={
                    isAttractNineSixteen
                      ? 'absolute inset-0 w-full h-full overflow-hidden'
                      : `relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden ${
                          attractSlides.length > 1 ? 'pt-6' : 'pt-1'
                        }`
                  }
                >
                  <MediaAsset
                    src={currentSlide.data.mediaUrl}
                    kind={currentSlide.data.mediaKind}
                    alt={
                      currentSlide.kind === 'promo'
                        ? currentSlide.data.title
                        : currentSlide.data.headline ||
                          currentSlide.data.sponsorName ||
                          'Sponsored partner ad'
                    }
                    fit="smart"
                    onAspectChange={(match) =>
                      handleAspectReport(currentSlide.data.mediaUrl, match)
                    }
                  />
                </div>

                {isAttractNineSixteen && showAttractOverlay && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-black/15 pointer-events-none z-10" />
                )}

                {/* Slide Text Overlay (hidden when promo has no text) */}
                {showAttractOverlay && (
                  <div
                    className={`z-10 flex flex-col gap-2.5 ${
                      isAttractNineSixteen
                        ? `absolute inset-x-0 bottom-0 ${nativeDevice ? 'p-6 pb-8' : 'p-4 sm:p-5'}`
                        : `shrink-0 bg-[#141210] border-t border-white/10 ${
                            nativeDevice ? 'px-6 py-5 pb-7' : 'px-4 py-3.5'
                          }`
                    }`}
                  >
                    {currentSlide.kind === 'promo' ? (
                      <>
                        {currentSlide.data.scheduleLabel.trim() && (
                          <div className="text-xs font-medium text-stone-300">
                            {currentSlide.data.scheduleLabel}
                          </div>
                        )}
                        {currentSlide.data.title.trim() && (
                          <h3
                            className={`font-display font-bold text-white leading-tight text-balance ${
                              nativeDevice ? 'text-2xl' : 'text-lg sm:text-2xl'
                            }`}
                          >
                            {currentSlide.data.title}
                          </h3>
                        )}
                        {currentSlide.data.subtitle.trim() && (
                          <p
                            className={`text-stone-200 line-clamp-3 max-w-md ${
                              nativeDevice ? 'text-sm' : 'text-xs sm:text-sm'
                            }`}
                          >
                            {currentSlide.data.subtitle}
                          </p>
                        )}
                        {currentSlide.data.ctaLabel?.trim() && (
                          <div className="flex flex-wrap items-center gap-2.5 pt-1">
                            <button
                              type="button"
                              onClick={() => onModeChange('menu')}
                              className={`rounded-lg font-semibold transition-colors whitespace-nowrap ${
                                nativeDevice ? 'px-4 py-2.5 text-xs' : 'px-3.5 py-1.5 text-xs'
                              } ${tokens.buttonBg} ${tokens.buttonText}`}
                            >
                              {currentSlide.data.ctaLabel}
                            </button>
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        {currentSlide.data.sponsorName.trim() && (
                          <div className="text-xs font-medium text-stone-300">
                            <span>Sponsored Partner</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>{currentSlide.data.sponsorName}</span>
                          </div>
                        )}
                        {currentSlide.data.headline.trim() && (
                          <h3
                            className={`font-display font-bold text-white leading-tight text-balance ${
                              nativeDevice ? 'text-2xl' : 'text-lg sm:text-2xl'
                            }`}
                          >
                            {currentSlide.data.headline}
                          </h3>
                        )}
                        {currentSlide.data.bodyCopy.trim() && (
                          <p
                            className={`text-stone-200 line-clamp-3 max-w-md ${
                              nativeDevice ? 'text-sm' : 'text-xs sm:text-sm'
                            }`}
                          >
                            {currentSlide.data.bodyCopy}
                          </p>
                        )}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => onModeChange('menu')}
                            className={`rounded-lg bg-white/15 hover:bg-white/25 font-medium text-white transition-colors whitespace-nowrap ${
                              nativeDevice ? 'px-4 py-2.5 text-xs' : 'px-3.5 py-1.5 text-xs'
                            }`}
                          >
                            Return to Venue Menu
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center text-stone-400">
                <Sparkles className="w-7 h-7 mb-2 text-stone-500" aria-hidden="true" />
                <p className="text-sm font-medium text-stone-200">No active attract slides</p>
                <p className="text-xs mt-1 max-w-xs">
                  Add or activate a promotion in the dashboard to display it here.
                </p>
              </div>
            )}
          </div>
        )}

        {/* 2. INTERACTIVE MENU VIEW */}
        {mode === 'menu' && (
          <div className="relative h-full flex flex-col bg-[#141210]">
            <div className="flex items-center gap-1.5 px-4 py-3 border-b border-white/10 overflow-x-auto">
              {state.categories.map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => {
                    setActiveCategoryId(cat.id);
                    setInspectedItem(null);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                    activeCategoryId === cat.id
                      ? tokens.activeTabBg
                      : 'bg-white/5 text-stone-300 hover:bg-white/10'
                  }`}
                >
                  {cat.name}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto studio-scroll p-4 space-y-3">
              {categoryItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full py-10 text-center text-stone-400">
                  <Utensils className="w-6 h-6 mb-2 text-stone-600" aria-hidden="true" />
                  <p className="text-xs">No items in this category yet.</p>
                </div>
              ) : (
                categoryItems.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setInspectedItem(item)}
                    className={`w-full text-left flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] p-3 transition-colors ${
                      !item.available ? 'opacity-50' : ''
                    }`}
                  >
                    {item.mediaUrl && (
                      <div className="w-16 h-14 rounded-lg overflow-hidden bg-stone-900 shrink-0">
                        <MediaAsset src={item.mediaUrl} alt={item.name} />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-sm font-medium text-white truncate">
                          {item.name}
                        </span>
                        <span className="text-sm font-mono font-semibold text-white tabular-nums shrink-0">
                          ${item.price.toFixed(2)}
                        </span>
                      </div>
                      <p className="text-xs text-stone-400 line-clamp-1 mt-0.5">
                        {item.description}
                      </p>
                      <div className="text-[11px] text-stone-400 mt-1 flex items-center gap-1.5">
                        {item.featured && (
                          <span className={`font-medium ${tokens.highlightText}`}>
                            House Favorite
                          </span>
                        )}
                        {item.featured && item.dietaryNotes && <span aria-hidden="true">·</span>}
                        {item.dietaryNotes && <span>{item.dietaryNotes}</span>}
                        {!item.available && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="text-rose-400 font-medium">Sold Out Tonight</span>
                          </>
                        )}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>

            {inspectedItem && (
              <div className="absolute inset-0 z-30 bg-stone-950/95 flex flex-col justify-between p-5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="text-base font-display font-semibold text-white">
                      {inspectedItem.name}
                    </h4>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {inspectedItem.dietaryNotes || 'Prepared fresh to order'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInspectedItem(null)}
                    className="p-1.5 rounded-md bg-white/10 text-stone-200 hover:bg-white/20"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                {inspectedItem.mediaUrl && (
                  <div className="my-4 flex-1 min-h-0 rounded-xl overflow-hidden border border-white/10 bg-stone-900 flex items-center justify-center">
                    <MediaAsset
                      src={inspectedItem.mediaUrl}
                      alt={inspectedItem.name}
                      fit="contain"
                    />
                  </div>
                )}

                <div className="flex items-end justify-between gap-4 pt-1">
                  <p className="text-sm text-stone-300 line-clamp-4">{inspectedItem.description}</p>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-mono font-semibold text-white tabular-nums">
                      ${inspectedItem.price.toFixed(2)}
                    </div>
                    <div className="text-xs text-stone-400">
                      {inspectedItem.available ? 'Available' : 'Sold Out'}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* 3. DAILY SPECIALS VIEW */}
        {mode === 'specials' && (
          <div className="h-full overflow-y-auto studio-scroll p-4 space-y-3.5 bg-[#141210]">
            {activeSpecials.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full py-10 text-center text-stone-400">
                <p className="text-sm font-medium text-stone-200">No active daily specials</p>
                <p className="text-xs mt-1">
                  Add or activate a special in the dashboard to feature it here.
                </p>
              </div>
            ) : (
              activeSpecials.map((special) => (
                <div
                  key={special.id}
                  className="rounded-xl overflow-hidden border border-white/10 bg-white/[0.04]"
                >
                  <div
                    className={`relative overflow-hidden bg-stone-950 flex items-center justify-center ${
                      nativeDevice ? 'h-48' : 'h-32 sm:h-36'
                    }`}
                  >
                    <MediaAsset
                      src={special.mediaUrl}
                      kind={special.mediaKind}
                      alt={special.title}
                      fit="contain"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent pointer-events-none" />
                    <div className="absolute bottom-3 inset-x-3.5 flex items-end justify-between gap-2">
                      <div>
                        <div className={`text-[11px] font-medium ${tokens.highlightText}`}>
                          {special.windowLabel}
                        </div>
                        <h4 className="text-sm sm:text-base font-display font-semibold text-white">
                          {special.title}
                        </h4>
                      </div>
                      <div className="text-right font-mono tabular-nums shrink-0">
                        <div className="text-sm sm:text-base font-semibold text-white">
                          ${special.specialPrice.toFixed(2)}
                        </div>
                        {special.regularPrice && special.regularPrice > special.specialPrice && (
                          <div className="text-[11px] text-stone-400 line-through">
                            ${special.regularPrice.toFixed(2)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="px-3.5 py-2.5 text-xs text-stone-300">{special.description}</div>
                </div>
              ))
            )}
          </div>
        )}

        {/* 4. ADMIN AD NETWORK SLOT PREVIEW */}
        {mode === 'ad-slot' && (
          <div className="relative h-full w-full flex flex-col bg-[#141210] overflow-hidden">
            {currentAd ? (
              <>
                {onAdIndexChange && (
                  <div className="absolute top-3 right-3 z-20 flex items-center gap-1">
                    {networkAds.map((ad, idx) => (
                      <button
                        key={ad.id}
                        type="button"
                        onClick={() => onAdIndexChange(idx)}
                        className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                          idx === adIndex % networkAds.length
                            ? 'bg-white text-stone-950'
                            : 'bg-black/50 text-stone-200 hover:bg-black/70'
                        }`}
                      >
                        Ad {idx + 1}
                      </button>
                    ))}
                  </div>
                )}

                <div
                  className={
                    isAdNineSixteen
                      ? 'absolute inset-0 w-full h-full overflow-hidden'
                      : 'relative flex-1 min-h-0 w-full flex items-center justify-center overflow-hidden pt-10'
                  }
                >
                  <MediaAsset
                    src={currentAd.mediaUrl}
                    kind={currentAd.mediaKind}
                    alt={currentAd.headline || currentAd.sponsorName || 'Sponsored ad'}
                    fit="smart"
                    onAspectChange={(match) => handleAspectReport(currentAd.mediaUrl, match)}
                  />
                </div>

                {isAdNineSixteen && hasCurrentAdText && (
                  <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/45 to-black/20 pointer-events-none z-10" />
                )}

                {hasCurrentAdText && (
                  <div
                    className={`z-10 space-y-2 ${
                      isAdNineSixteen
                        ? 'absolute inset-x-0 bottom-0 p-5'
                        : 'shrink-0 bg-[#141210] border-t border-white/10 p-5'
                    }`}
                  >
                    <div className="text-xs font-medium text-emerald-400">
                      <span>
                        {currentAd.sponsorName.trim()
                          ? `${currentAd.sponsorName} · Admin Network`
                          : 'Sponsored Partner · Admin Network'}
                      </span>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums">Earning −$1.00/unit/mo</span>
                    </div>
                    {currentAd.headline.trim() && (
                      <h3 className="text-xl sm:text-2xl font-display font-bold text-white leading-tight">
                        {currentAd.headline}
                      </h3>
                    )}
                    {currentAd.bodyCopy.trim() && (
                      <p className="text-xs sm:text-sm text-stone-200 max-w-md">
                        {currentAd.bodyCopy}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : state.adMonetization.optedIn ? (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-stone-950">
                <p className="text-sm font-semibold text-white">Joined Ad Network</p>
                <p className="text-xs text-stone-400 mt-1.5 max-w-xs leading-relaxed">
                  No active 9:16 network ads are currently linked to {state.venue.name}. Linked campaigns from the Super Admin Ad Network will rotate here automatically.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full p-6 text-center bg-stone-950">
                <p className="text-sm font-semibold text-white">Partner Ad Module Opted Out</p>
                <p className="text-xs text-stone-400 mt-1.5 max-w-xs leading-relaxed">
                  Network ads are currently suppressed on your {state.venue.unitCount} devices. Opt in under Ad Network to reduce your bill by $
                  {(state.venue.unitCount * state.adMonetization.creditPerUnitMonthly).toFixed(2)}/mo.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
