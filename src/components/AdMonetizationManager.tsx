import React from 'react';
import { Lock, MonitorPlay, CheckCircle2, MinusCircle } from 'lucide-react';
import { AdMonetizationConfig, AdminNetworkAd, VenueProfile } from '../types';
import { MediaAsset } from './MediaAsset';

interface AdMonetizationManagerProps {
  venue: VenueProfile;
  config: AdMonetizationConfig;
  networkAds: AdminNetworkAd[];
  onToggleOptIn: (optedIn: boolean) => void;
  onUpdateUnitCount: (count: number) => void;
  onPreviewAdSlot: () => void;
}

export const AdMonetizationManager: React.FC<AdMonetizationManagerProps> = ({
  venue,
  config,
  networkAds,
  onToggleOptIn,
  onUpdateUnitCount,
  onPreviewAdSlot,
}) => {
  const grossMonthly = venue.unitCount * venue.monthlyBaseFeePerUnit;
  const monthlyCredit = config.optedIn ? venue.unitCount * config.creditPerUnitMonthly : 0;
  const netMonthly = Math.max(0, grossMonthly - monthlyCredit);
  const annualSavings = monthlyCredit * 12;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Partner Ad Monetization</h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Offset your monthly hardware fee by $1.00 per tabletop unit when participating in the vetted partner network.
          </p>
        </div>
        <button
          type="button"
          onClick={onPreviewAdSlot}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap shrink-0"
        >
          <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
          Preview Ad Slot in Emulator
        </button>
      </div>

      {/* Participation Toggle & Real-Time Credit Breakdown */}
      <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
        <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {config.optedIn ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" aria-hidden="true" />
              ) : (
                <MinusCircle className="w-4 h-4 text-slate-400 shrink-0" aria-hidden="true" />
              )}
              <h3 className="text-sm font-semibold text-slate-900">
                {config.optedIn
                  ? 'Ad Network Participation Active'
                  : 'Ad Network Participation Paused'}
              </h3>
            </div>
            <p className="text-xs text-slate-500 max-w-lg">
              {config.optedIn
                ? `Receiving $${config.creditPerUnitMonthly.toFixed(2)}/unit/month off your invoice. Partner slots appear automatically in the idle screen rotation (${config.rotationRatioLabel}).`
                : 'Your tabletop displays show only your venue promotions, menu, and daily specials. Opt in anytime to earn $1.00/unit monthly hardware credits.'}
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg shrink-0 self-start sm:self-center">
            <button
              type="button"
              onClick={() => onToggleOptIn(true)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                config.optedIn
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Opted In
            </button>
            <button
              type="button"
              onClick={() => onToggleOptIn(false)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                !config.optedIn
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Opted Out
            </button>
          </div>
        </div>

        {/* Quantitative Credit Ledger */}
        <div className="grid grid-cols-1 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200">
          <div className="p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">Active Fleet Units</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => onUpdateUnitCount(Math.max(1, venue.unitCount - 1))}
                  className="w-6 h-6 rounded border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  aria-label="Decrease unit count"
                >
                  −
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateUnitCount(Math.min(250, venue.unitCount + 1))}
                  className="w-6 h-6 rounded border border-slate-200 text-xs font-medium text-slate-600 hover:bg-slate-50"
                  aria-label="Increase unit count"
                >
                  +
                </button>
              </div>
            </div>
            <div className="mt-1.5 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              {venue.unitCount} units
            </div>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              ${venue.monthlyBaseFeePerUnit.toFixed(2)}/unit base plan
            </p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Monthly Ad Credit</span>
            <div
              className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${
                config.optedIn ? 'text-emerald-700' : 'text-slate-400'
              }`}
            >
              −${monthlyCredit.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              $1.00 × {venue.unitCount} active units
            </p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Net Monthly Bill</span>
            <div className="mt-1.5 text-xl font-semibold font-mono text-slate-900 tabular-nums">
              ${netMonthly.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
              Gross ${grossMonthly.toFixed(2)}/mo
            </p>
          </div>

          <div className="p-4">
            <span className="text-xs text-slate-500">Projected 12-Mo Savings</span>
            <div
              className={`mt-1.5 text-xl font-semibold font-mono tabular-nums ${
                config.optedIn ? 'text-slate-900' : 'text-slate-400'
              }`}
            >
              ${annualSavings.toFixed(2)}
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {config.optedIn ? 'Applied automatically' : 'If opted in'}
            </p>
          </div>
        </div>
      </div>

      {/* Admin-Only Ad Source Policy */}
      <div className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-3.5 flex items-start gap-3">
        <Lock className="w-4 h-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
        <div className="text-xs text-slate-600 leading-relaxed">
          <span className="font-semibold text-slate-900">Admin-Managed Ad Inventory: </span>
          All external partner advertisements are scheduled and vetted exclusively from the central Admin Dashboard. Client venues cannot upload or inject custom third-party ads directly into the monetization module — use the{' '}
          <span className="font-medium text-slate-900">Promotions</span> tab for your own house offers and events.
        </div>
      </div>

      {/* Read-Only Preview of Admin-Supplied Campaigns */}
      <div className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-900">
            Scheduled Network Campaigns
          </h3>
          <span className="text-xs text-slate-500">
            Admin-Managed · Read-Only
          </span>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {networkAds.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              No active Super Admin 9:16 network ads are currently linked to your venue.
            </div>
          ) : (
            networkAds.map((ad) => {
              const displayTitle =
                ad.headline?.trim() || ad.sponsorName?.trim() || '9:16 Sponsored Placement';
              return (
                <div
                  key={ad.id}
                  className={`p-4 flex gap-4 items-start ${
                    !config.optedIn ? 'opacity-55' : ''
                  }`}
                >
                  <div className="w-16 sm:w-20 aspect-[9/16] rounded-lg overflow-hidden bg-slate-950 border border-slate-200 shrink-0 flex items-center justify-center">
                    <MediaAsset
                      src={ad.mediaUrl}
                      kind={ad.mediaKind}
                      alt={displayTitle}
                      fit="contain"
                    />
                  </div>

                  <div className="flex-1 min-w-0 flex flex-col justify-between gap-2">
                    <div>
                      <div className="flex items-center justify-between gap-3">
                        <h4 className="text-sm font-semibold text-slate-900 truncate">
                          {displayTitle}
                        </h4>
                        <span
                          className={`text-xs font-medium shrink-0 ${
                            config.optedIn ? 'text-emerald-700' : 'text-slate-400'
                          }`}
                        >
                          {config.optedIn ? 'In Rotation' : 'Disabled'}
                        </span>
                      </div>
                      {ad.bodyCopy?.trim() && (
                        <p className="text-xs text-slate-600 mt-1">{ad.bodyCopy}</p>
                      )}
                    </div>

                    <div className="text-xs text-slate-500 tabular-nums flex flex-wrap items-center gap-x-1.5">
                      {ad.sponsorName?.trim() && (
                        <>
                          <span>{ad.sponsorName}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      {ad.categoryTag?.trim() && (
                        <>
                          <span>{ad.categoryTag}</span>
                          <span aria-hidden="true">·</span>
                        </>
                      )}
                      <span>{ad.durationSec}s slot</span>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
