import React, { useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RectangleHorizontal,
  RectangleVertical,
  RotateCcw,
} from 'lucide-react';
import { AdminNetworkAd, DeviceFrame, EmulatorMode, PortalState } from '../types';
import {
  evaluatePromotionSchedule,
  getPreviewTimestampForSchedule,
  toLocalDateString,
  toLocalTimeString,
} from '../utils/schedule';
import { buildAttractSlides, TabletopScreen } from './TabletopScreen';

interface DeviceEmulatorProps {
  state: PortalState;
  networkAds: AdminNetworkAd[];
  mode: EmulatorMode;
  onModeChange: (mode: EmulatorMode) => void;
  focusedPromoId?: string | null;
  previewTrigger?: number;
  focusedCategoryId?: string | null;
  headerAction?: React.ReactNode;
}

export const DeviceEmulator: React.FC<DeviceEmulatorProps> = ({
  state,
  networkAds,
  mode,
  onModeChange,
  focusedPromoId,
  previewTrigger = 0,
  focusedCategoryId,
  headerAction,
}) => {
  const [frame, setFrame] = useState<DeviceFrame>('portrait-8');
  const [isPlaying, setIsPlaying] = useState(true);
  const [slideIndex, setSlideIndex] = useState(0);
  const [adIndex, setAdIndex] = useState(0);
  const [showClockTester, setShowClockTester] = useState(false);
  const [simulatedDate, setSimulatedDate] = useState<Date | null>(null);

  const effectiveNow = simulatedDate ?? new Date();

  const attractSlides = useMemo(
    () => buildAttractSlides(state, networkAds, simulatedDate ?? new Date()),
    [state, networkAds, simulatedDate]
  );

  useEffect(() => {
    if (!focusedPromoId) return;
    const promo = state.promotions.find((p) => p.id === focusedPromoId);
    if (!promo) return;

    const now = new Date();
    const evalNow = evaluatePromotionSchedule(promo, now);

    let targetClock: Date | null = null;
    if (!evalNow.isEligible && promo.active && promo.schedule?.mode === 'scheduled') {
      targetClock = getPreviewTimestampForSchedule(promo.schedule, now);
      setSimulatedDate(targetClock);
      setShowClockTester(true);
    } else if (simulatedDate) {
      const evalSim = evaluatePromotionSchedule(promo, simulatedDate);
      if (!evalSim.isEligible && evalNow.isEligible) {
        setSimulatedDate(null);
      } else {
        targetClock = simulatedDate;
      }
    }

    const slidesForTarget = buildAttractSlides(state, networkAds, targetClock ?? now);
    const idx = slidesForTarget.findIndex(
      (s) => s.kind === 'promo' && s.data.id === focusedPromoId
    );
    if (idx !== -1) {
      setSlideIndex(idx);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedPromoId, previewTrigger]);

  const handleSimulatedInput = (dateVal: string, timeVal: string) => {
    const [y, m, d] = dateVal.split('-').map(Number);
    const [hh, mm] = timeVal.split(':').map(Number);
    if ([y, m, d, hh, mm].some(Number.isNaN)) return;
    setSimulatedDate(new Date(y, m - 1, d, hh, mm, 0));
  };

  return (
    <div className="flex flex-col h-full">
      {/* Emulator Control Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70">
          {(
            [
              { id: 'attract', label: 'Attract Loop' },
              { id: 'menu', label: 'Menu' },
              { id: 'specials', label: 'Specials' },
              { id: 'ad-slot', label: 'Ad Slot' },
            ] as { id: EmulatorMode; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => onModeChange(tab.id)}
              className={`px-2.5 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                mode === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {mode === 'attract' && attractSlides.length > 1 && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-1.5 py-1">
              <button
                type="button"
                onClick={() =>
                  setSlideIndex((prev) => (prev - 1 + attractSlides.length) % attractSlides.length)
                }
                title="Previous slide"
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <ChevronLeft className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setIsPlaying((p) => !p)}
                title={isPlaying ? 'Pause loop' : 'Play loop'}
                className="p-1 text-slate-700 hover:text-slate-900"
              >
                {isPlaying ? (
                  <Pause className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Play className="w-3.5 h-3.5" aria-hidden="true" />
                )}
              </button>
              <button
                type="button"
                onClick={() => setSlideIndex((prev) => (prev + 1) % attractSlides.length)}
                title="Next slide"
                className="p-1 text-slate-500 hover:text-slate-900"
              >
                <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
              <span className="px-1.5 text-[11px] font-mono tabular-nums text-slate-500">
                {slideIndex + 1}/{attractSlides.length}
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setShowClockTester((prev) => !prev)}
            title="Test promotion date & time schedule"
            className={`p-1.5 rounded-lg border transition-colors ${
              simulatedDate || showClockTester
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-slate-200 bg-white text-slate-600 hover:text-slate-900'
            }`}
          >
            <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
          </button>

          <div className="flex items-center gap-1 p-1 rounded-lg border border-slate-200 bg-white">
            <button
              type="button"
              onClick={() => setFrame('portrait-8')}
              title='9:16 Portrait Tabletop Display'
              className={`p-1 rounded transition-colors ${
                frame === 'portrait-8'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <RectangleVertical className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setFrame('landscape-10')}
              title='16:10 Landscape Table Display'
              className={`p-1 rounded transition-colors ${
                frame === 'landscape-10'
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <RectangleHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          {headerAction}
        </div>
      </div>

      {/* Optional Schedule Simulator Bar */}
      {(showClockTester || simulatedDate) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-700">
              {simulatedDate ? 'Simulated Schedule Clock:' : 'Testing Schedule Clock:'}
            </span>
            <input
              type="date"
              value={toLocalDateString(effectiveNow)}
              onChange={(e) =>
                handleSimulatedInput(e.target.value, toLocalTimeString(effectiveNow))
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <input
              type="time"
              value={toLocalTimeString(effectiveNow)}
              onChange={(e) =>
                handleSimulatedInput(toLocalDateString(effectiveNow), e.target.value)
              }
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setSimulatedDate(null);
              setShowClockTester(false);
            }}
            className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-slate-900 whitespace-nowrap"
          >
            <RotateCcw className="w-3 h-3" aria-hidden="true" />
            {simulatedDate ? 'Return to Live Clock' : 'Close'}
          </button>
        </div>
      )}

      {/* Physical Hardware Bezel Stage */}
      <div className="flex-1 flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-100/80 p-4 sm:p-6 min-h-[460px]">
        <div
          className={`relative flex flex-col w-full transition-all duration-200 ${
            frame === 'landscape-10' ? 'max-w-[660px]' : 'max-w-[336px]'
          }`}
        >
          <div className="rounded-[24px] bg-stone-900 p-3 sm:p-4 shadow-xl ring-1 ring-black/40">
            <div
              className={`relative w-full overflow-hidden rounded-[14px] ${
                frame === 'landscape-10' ? 'aspect-[16/10]' : 'aspect-[9/16]'
              }`}
            >
              <TabletopScreen
                state={state}
                networkAds={networkAds}
                mode={mode}
                onModeChange={onModeChange}
                slideIndex={slideIndex}
                onSlideIndexChange={setSlideIndex}
                isPlaying={isPlaying}
                focusedCategoryId={focusedCategoryId}
                adIndex={adIndex}
                onAdIndexChange={setAdIndex}
                nowOverride={simulatedDate}
              />
            </div>
          </div>

          <div className="mx-auto w-28 h-2.5 bg-stone-800 rounded-b-lg shadow-sm" />
          <div className="mx-auto w-44 h-1.5 bg-stone-300 rounded-full mt-0.5" />
        </div>

        <div className="mt-4 text-center text-xs text-slate-500 tabular-nums">
          <span>
            {frame === 'landscape-10' ? '10" Tabletop Display' : '9:16 Portrait Display'}
          </span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>{state.venue.unitCount} units provisioned</span>
          <span className="mx-1.5" aria-hidden="true">·</span>
          <span>
            {state.adMonetization.optedIn
              ? `Partner Ads Active (−$${(state.venue.unitCount * state.adMonetization.creditPerUnitMonthly).toFixed(2)}/mo)`
              : 'Client Content Only'}
          </span>
        </div>
      </div>
    </div>
  );
};
