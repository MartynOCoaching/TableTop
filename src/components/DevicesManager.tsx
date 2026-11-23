import React, { useMemo, useState } from 'react';
import {
  Check,
  ExternalLink,
  Monitor,
  MonitorPlay,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Search,
  Smartphone,
  Tablet,
  Trash2,
  X,
} from 'lucide-react';
import { ScreenOrientation, ScreenStatus, TabletopDevice } from '../types';
import { generatePairingCode } from '../utils/devices';

interface DevicesManagerProps {
  venueName: string;
  monthlyBaseFeePerUnit: number;
  devices: TabletopDevice[];
  onChange: (nextDevices: TabletopDevice[]) => void;
  onPreviewDevice?: (orientation: ScreenOrientation) => void;
}

type StatusFilter = 'all' | 'active' | 'paused';

const ZONE_PRESETS = ['Main Dining', 'Bar Counter', 'Patio', 'Booths', 'Private Room'];

export const DevicesManager: React.FC<DevicesManagerProps> = ({
  venueName,
  monthlyBaseFeePerUnit,
  devices,
  onChange,
  onPreviewDevice,
}) => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');

  // Add device form state
  const [newName, setNewName] = useState('');
  const [newZone, setNewZone] = useState('Main Dining');
  const [newOrientation, setNewOrientation] = useState<ScreenOrientation>('portrait-9-16');
  const [newQuantity, setNewQuantity] = useState(1);
  const [newStatus, setNewStatus] = useState<ScreenStatus>('active');

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editZone, setEditZone] = useState('');
  const [editOrientation, setEditOrientation] =
    useState<ScreenOrientation>('portrait-9-16');

  // Inline delete confirmation state
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const activeCount = useMemo(
    () => devices.filter((d) => d.status === 'active').length,
    [devices]
  );
  const pausedCount = devices.length - activeCount;
  const monthlyHardwareTotal = activeCount * monthlyBaseFeePerUnit;

  const filteredDevices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return devices.filter((d) => {
      if (statusFilter === 'active' && d.status !== 'active') return false;
      if (statusFilter === 'paused' && d.status !== 'paused') return false;
      if (!q) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.locationZone.toLowerCase().includes(q) ||
        d.pairingCode.toLowerCase().includes(q)
      );
    });
  }, [devices, searchQuery, statusFilter]);

  const openAddForm = () => {
    const nextNumber = devices.length + 1;
    setNewName(`Table ${nextNumber}`);
    setNewZone('Main Dining');
    setNewOrientation('portrait-9-16');
    setNewQuantity(1);
    setNewStatus('active');
    setShowAddForm(true);
  };

  const handleAddDevices = (e: React.FormEvent) => {
    e.preventDefault();
    const qty = Math.max(1, Math.min(25, Math.round(Number(newQuantity) || 1)));
    const baseName = newName.trim() || `Screen ${devices.length + 1}`;
    const zone = newZone.trim() || 'Main Dining';

    const created: TabletopDevice[] = Array.from({ length: qty }, (_, idx) => {
      const label = qty === 1 ? baseName : `${baseName} ${idx + 1}`;
      return {
        id: `dev_${Date.now().toString(36)}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
        name: label,
        locationZone: zone,
        orientation: newOrientation,
        pairingCode: generatePairingCode(),
        status: newStatus,
      };
    });

    onChange([...created, ...devices]);
    setShowAddForm(false);
  };

  const startEdit = (device: TabletopDevice) => {
    setConfirmDeleteId(null);
    setEditingId(device.id);
    setEditName(device.name);
    setEditZone(device.locationZone);
    setEditOrientation(device.orientation);
  };

  const saveEdit = (deviceId: string) => {
    onChange(
      devices.map((d) =>
        d.id === deviceId
          ? {
              ...d,
              name: editName.trim() || d.name,
              locationZone: editZone.trim() || 'Main Dining',
              orientation: editOrientation,
            }
          : d
      )
    );
    setEditingId(null);
  };

  const toggleStatus = (deviceId: string) => {
    onChange(
      devices.map((d) =>
        d.id === deviceId
          ? { ...d, status: d.status === 'active' ? 'paused' : 'active' }
          : d
      )
    );
  };

  const deleteDevice = (deviceId: string) => {
    onChange(devices.filter((d) => d.id !== deviceId));
    setConfirmDeleteId(null);
    if (editingId === deviceId) {
      setEditingId(null);
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-slate-900">
            Assigned Screens & Devices
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
            <span>{venueName}</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span className="font-medium text-emerald-700">{activeCount} active</span>
            {pausedCount > 0 && (
              <>
                <span className="mx-1.5" aria-hidden="true">·</span>
                <span>{pausedCount} paused</span>
              </>
            )}
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>{devices.length} total assigned</span>
            <span className="mx-1.5" aria-hidden="true">·</span>
            <span>${monthlyHardwareTotal.toFixed(2)}/mo base</span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => (showAddForm ? setShowAddForm(false) : openAddForm())}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
        >
          {showAddForm ? (
            <>
              <X className="w-3.5 h-3.5" aria-hidden="true" />
              Close Form
            </>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add Device
            </>
          )}
        </button>
      </div>

      {/* Add Device / Screen Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddDevices}
          className="rounded-xl border border-slate-200 bg-white p-4 space-y-4"
        >
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Add Screen(s) to {venueName}
            </h3>
            <span className="text-xs text-slate-500">
              Syncs active unit count & billing automatically
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Screen Name / Table Label
              </label>
              <input
                type="text"
                required
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Table 19 or Patio Bar"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Location / Zone
              </label>
              <input
                type="text"
                value={newZone}
                onChange={(e) => setNewZone(e.target.value)}
                placeholder="e.g. Main Dining, Bar Counter"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              />
              <div className="flex flex-wrap gap-1.5 mt-1.5">
                {ZONE_PRESETS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => setNewZone(preset)}
                    className={`px-2 py-0.5 rounded border text-[11px] transition-colors ${
                      newZone === preset
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Screen Orientation
              </label>
              <select
                value={newOrientation}
                onChange={(e) => setNewOrientation(e.target.value as ScreenOrientation)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              >
                <option value="portrait-9-16">Portrait 9:16 (Tabletop)</option>
                <option value="landscape-10">Landscape 10&quot; (Bar / Counter)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Screens to Add
              </label>
              <input
                type="number"
                min={1}
                max={25}
                value={newQuantity}
                onChange={(e) => setNewQuantity(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">
                Initial Status
              </label>
              <select
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as ScreenStatus)}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
              >
                <option value="active">Active (Live & Billed)</option>
                <option value="paused">Paused (Standby)</option>
              </select>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              {newQuantity > 1 ? `Add ${newQuantity} Screens` : 'Add Screen'}
            </button>
          </div>
        </form>
      )}

      {/* Search & Status Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        <div className="relative flex-1">
          <Search
            className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search screen name, zone, or pairing code..."
            className="w-full rounded-lg border border-slate-200 bg-white pl-9 pr-8 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-amber-600 focus:outline-none"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              aria-label="Clear search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-200/70 self-start sm:self-auto">
          {(
            [
              { id: 'all', label: `All (${devices.length})` },
              { id: 'active', label: `Active (${activeCount})` },
              { id: 'paused', label: `Paused (${pausedCount})` },
            ] as { id: StatusFilter; label: string }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors whitespace-nowrap tabular-nums ${
                statusFilter === tab.id
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Assigned Devices List */}
      {filteredDevices.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center">
          <Monitor className="w-8 h-8 text-slate-300 mx-auto mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-slate-900">
            {devices.length === 0
              ? 'No screens assigned to this account yet'
              : 'No screens match your search or filter'}
          </p>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            {devices.length === 0
              ? 'Add a tabletop display screen to pair hardware units and sync your active unit billing.'
              : 'Try clearing your search or switching the status filter.'}
          </p>
          {devices.length === 0 && (
            <button
              type="button"
              onClick={openAddForm}
              className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" aria-hidden="true" />
              Add First Screen
            </button>
          )}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
          {filteredDevices.map((device) => {
            const isEditing = editingId === device.id;
            const isConfirmingDelete = confirmDeleteId === device.id;
            const isActive = device.status === 'active';

            return (
              <div
                key={device.id}
                className={`p-3.5 sm:p-4 transition-colors ${
                  isActive ? 'bg-white' : 'bg-slate-50/70'
                }`}
              >
                {isEditing ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Screen Name
                        </label>
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Location / Zone
                        </label>
                        <input
                          type="text"
                          value={editZone}
                          onChange={(e) => setEditZone(e.target.value)}
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-medium text-slate-600 mb-1">
                          Orientation
                        </label>
                        <select
                          value={editOrientation}
                          onChange={(e) =>
                            setEditOrientation(e.target.value as ScreenOrientation)
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 focus:border-amber-600 focus:outline-none"
                        >
                          <option value="portrait-9-16">Portrait 9:16</option>
                          <option value="landscape-10">Landscape 10&quot;</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 whitespace-nowrap"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => saveEdit(device.id)}
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800 whitespace-nowrap"
                      >
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                        Save Screen
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex items-start sm:items-center gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${
                            isActive
                              ? 'border-slate-200 bg-slate-50 text-slate-700'
                              : 'border-slate-200 bg-slate-100 text-slate-400'
                          }`}
                        >
                          {device.orientation === 'landscape-10' ? (
                            <Tablet className="w-4 h-4" aria-hidden="true" />
                          ) : (
                            <Smartphone className="w-4 h-4" aria-hidden="true" />
                          )}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2.5 flex-wrap">
                            <span className="text-sm font-semibold text-slate-900 truncate">
                              {device.name}
                            </span>
                            <span
                              className={`text-xs font-medium ${
                                isActive ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {isActive ? 'Active' : 'Paused'}
                            </span>
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                            <span>{device.locationZone || 'Main Dining'}</span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span>
                              {device.orientation === 'landscape-10'
                                ? 'Landscape 10"'
                                : 'Portrait 9:16'}
                            </span>
                            <span className="mx-1.5" aria-hidden="true">·</span>
                            <span className="font-mono text-slate-700">
                              {device.pairingCode}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {onPreviewDevice && (
                          <button
                            type="button"
                            onClick={() => onPreviewDevice(device.orientation)}
                            title="Preview in emulator"
                            className="inline-flex items-center gap-1 rounded-md px-2.5 py-1.5 text-xs font-medium text-amber-700 hover:bg-amber-50 whitespace-nowrap shrink-0"
                          >
                            <MonitorPlay className="w-3.5 h-3.5" aria-hidden="true" />
                            Preview
                          </button>
                        )}
                        <a
                          href={`/emulator?device=${encodeURIComponent(device.pairingCode)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="Open standalone display link"
                          className="hidden sm:inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                          Display
                        </a>
                        <button
                          type="button"
                          onClick={() => toggleStatus(device.id)}
                          title={isActive ? 'Pause screen' : 'Activate screen'}
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 whitespace-nowrap shrink-0"
                        >
                          {isActive ? (
                            <>
                              <PauseCircle className="w-3.5 h-3.5" aria-hidden="true" />
                              Pause
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
                              Activate
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => startEdit(device)}
                          title="Edit screen details"
                          className="p-1.5 rounded-md text-slate-500 hover:text-slate-900 hover:bg-slate-100"
                          aria-label={`Edit ${device.name}`}
                        >
                          <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setConfirmDeleteId(isConfirmingDelete ? null : device.id)
                          }
                          title="Delete screen from account"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 hover:text-red-700 hover:bg-red-50 whitespace-nowrap shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          Delete
                        </button>
                      </div>
                    </div>

                    {isConfirmingDelete && (
                      <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                        <p className="text-xs text-red-800">
                          Remove <span className="font-semibold">{device.name}</span> (
                          <span className="font-mono">{device.pairingCode}</span>) from{' '}
                          {venueName}?
                        </p>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(null)}
                            className="flex-1 sm:flex-none rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDevice(device.id)}
                            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 whitespace-nowrap"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            Confirm Delete
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
