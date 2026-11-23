import React, { useState } from 'react';
import { Monitor, RotateCcw, ShieldCheck, X } from 'lucide-react';
import { AccentTheme, VenueProfile } from '../types';

interface VenueSettingsModalProps {
  venue: VenueProfile;
  deviceCount?: number;
  onManageDevices?: () => void;
  onClose: () => void;
  onSave: (next: VenueProfile) => void;
  onResetDemo: () => void;
  onOpenSuperAdmin?: () => void;
}

const ACCENT_OPTIONS: { id: AccentTheme; label: string; swatchClass: string }[] = [
  { id: 'amber', label: 'Warm Brass', swatchClass: 'bg-amber-600' },
  { id: 'emerald', label: 'Forest Sage', swatchClass: 'bg-emerald-600' },
  { id: 'crimson', label: 'Cellar Red', swatchClass: 'bg-rose-700' },
  { id: 'slate', label: 'Monochrome', swatchClass: 'bg-slate-600' },
];

export const VenueSettingsModal: React.FC<VenueSettingsModalProps> = ({
  venue,
  deviceCount,
  onManageDevices,
  onClose,
  onSave,
  onResetDemo,
  onOpenSuperAdmin,
}) => {
  const [name, setName] = useState(venue.name);
  const [tagline, setTagline] = useState(venue.tagline);
  const [unitCount, setUnitCount] = useState(venue.unitCount);
  const [accentTheme, setAccentTheme] = useState<AccentTheme>(venue.accentTheme);
  const [confirmReset, setConfirmReset] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...venue,
      name: name.trim() || venue.name,
      tagline: tagline.trim() || venue.tagline,
      unitCount: Math.max(1, Math.min(500, Number(unitCount) || 1)),
      accentTheme,
    });
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="venue-settings-title"
    >
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 id="venue-settings-title" className="text-base font-semibold text-slate-900">
            Venue & Device Settings
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-slate-700"
            aria-label="Close settings"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Venue Name</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Venue Subtitle
            </label>
            <input
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Active Tabletop Units
            </label>
            <input
              type="number"
              min={1}
              max={500}
              value={unitCount}
              onChange={(e) => setUnitCount(Number(e.target.value))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
            />
            <p className="text-xs text-slate-400 mt-1">
              Used to calculate your $1.00/unit/month partner ad credit.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 mb-2">
              Device Screen Accent Theme
            </label>
            <div className="grid grid-cols-2 gap-2">
              {ACCENT_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setAccentTheme(opt.id)}
                  className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
                    accentTheme === opt.id
                      ? 'border-slate-900 bg-slate-50 text-slate-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <span className={`w-3 h-3 rounded-sm ${opt.swatchClass}`} aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              ))}
            </div>
          </div>

          {onManageDevices && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">Assigned Screens</span>
              <button
                type="button"
                onClick={onManageDevices}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-900 hover:text-amber-700"
              >
                <Monitor className="w-3.5 h-3.5" aria-hidden="true" />
                Add / Manage Screens{typeof deviceCount === 'number' ? ` (${deviceCount})` : ''}
              </button>
            </div>
          )}

          {onOpenSuperAdmin && (
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">Platform Management</span>
              <button
                type="button"
                onClick={onOpenSuperAdmin}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700 hover:text-amber-800"
              >
                <ShieldCheck className="w-3.5 h-3.5" aria-hidden="true" />
                Open Super Admin Dashboard
              </button>
            </div>
          )}

          <div className="pt-3 border-t border-slate-200 flex items-center justify-between gap-3">
            {confirmReset ? (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onResetDemo();
                    onClose();
                  }}
                  className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700"
                >
                  Confirm Reset
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmReset(false)}
                  className="text-xs text-slate-500 hover:text-slate-700"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmReset(true)}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-red-600"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                Clear Draft Data
              </button>
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800"
              >
                Save Settings
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
