import React, { useMemo, useState } from 'react';
import {
  Check,
  Eye,
  Link2,
  Megaphone,
  Pencil,
  Power,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import {
  createNetworkAd,
  deleteNetworkAd,
  filterNetworkAdsForClient,
  NetworkAdInput,
  updateNetworkAd,
} from '../services/networkAdsService';
import { AdTargetScope, AdminNetworkAd, ClientAccount } from '../types';
import { MediaAsset } from './MediaAsset';
import { MediaDropzone, UploadedMediaResult } from './MediaDropzone';

interface SuperAdminAdNetworkPanelProps {
  uid: string;
  ads: AdminNetworkAd[];
  loading: boolean;
  clients: ClientAccount[];
  onToggleClientJoin: (client: ClientAccount, nextJoined: boolean) => Promise<void>;
}

const EMPTY_DRAFT: NetworkAdInput = {
  sponsorName: '',
  headline: '',
  bodyCopy: '',
  mediaUrl: '',
  mediaKind: 'image',
  durationSec: 10,
  categoryTag: 'Sponsored Partner',
  active: true,
  targetScope: 'all',
  targetClientIds: [],
};

export const SuperAdminAdNetworkPanel: React.FC<SuperAdminAdNetworkPanelProps> = ({
  uid,
  ads,
  loading,
  clients,
  onToggleClientJoin,
}) => {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<NetworkAdInput>(EMPTY_DRAFT);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [previewAd, setPreviewAd] = useState<AdminNetworkAd | null>(null);
  const [togglingClientId, setTogglingClientId] = useState<string | null>(null);
  const [panelError, setPanelError] = useState<string | null>(null);

  const clientNameMap = useMemo(() => {
    const map = new Map<string, string>();
    clients.forEach((c) => map.set(c.id, c.businessName));
    return map;
  }, [clients]);

  const metrics = useMemo(() => {
    const activeAds = ads.filter((a) => a.active !== false).length;
    const joinedClients = clients.filter((c) => c.adProgramOptedIn).length;
    const adEnabledUnits = clients.reduce(
      (sum, c) => sum + (c.adProgramOptedIn ? c.activeUnits || 0 : 0),
      0
    );
    const totalCredits = clients.reduce(
      (sum, c) => sum + (c.adProgramOptedIn ? c.monthlyCredit || 0 : 0),
      0
    );
    return { activeAds, totalAds: ads.length, joinedClients, totalClients: clients.length, adEnabledUnits, totalCredits };
  }, [ads, clients]);

  const startEdit = (ad: AdminNetworkAd) => {
    setPanelError(null);
    setConfirmDeleteId(null);
    setEditingId(ad.id);
    setDraft({
      sponsorName: ad.sponsorName ?? '',
      headline: ad.headline ?? '',
      bodyCopy: ad.bodyCopy ?? '',
      mediaUrl: ad.mediaUrl,
      mediaKind: ad.mediaKind ?? 'image',
      durationSec: ad.durationSec || 10,
      categoryTag: ad.categoryTag ?? '',
      active: ad.active !== false,
      targetScope: ad.targetScope === 'selected' ? 'selected' : 'all',
      targetClientIds: Array.isArray(ad.targetClientIds) ? [...ad.targetClientIds] : [],
    });
  };

  const handleUploadNew = async (results: UploadedMediaResult[]) => {
    if (results.length === 0) return;
    setPanelError(null);
    setUploading(true);
    try {
      let singleCreated: { id: string; input: NetworkAdInput } | null = null;
      for (const res of results) {
        const cleanLabel = res.fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim();
        const input: NetworkAdInput = {
          sponsorName: cleanLabel.slice(0, 120),
          headline: '',
          bodyCopy: '',
          mediaUrl: res.mediaUrl,
          mediaKind: res.mediaKind,
          durationSec: 10,
          categoryTag: '9:16 Sponsored Ad',
          active: true,
          targetScope: 'all',
          targetClientIds: [],
          mediaAssetId: res.mediaAssetId,
        };
        const createdId = await createNetworkAd(uid, input);
        if (results.length === 1) {
          singleCreated = { id: createdId, input };
        }
      }

      if (singleCreated) {
        setEditingId(singleCreated.id);
        setDraft({
          ...singleCreated.input,
          mediaUrl: singleCreated.input.mediaUrl,
        });
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to upload sponsored ad media.');
    } finally {
      setUploading(false);
    }
  };

  const handleSaveEdit = async (ad: AdminNetworkAd) => {
    setPanelError(null);
    setSavingId(ad.id);
    try {
      await updateNetworkAd(ad.id, {
        ...draft,
        mediaUrl: draft.mediaUrl || ad.mediaUrl,
        mediaKind: draft.mediaKind || ad.mediaKind,
      });
      setEditingId(null);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to save sponsored ad changes.');
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleAdActive = async (ad: AdminNetworkAd) => {
    setPanelError(null);
    setSavingId(ad.id);
    try {
      await updateNetworkAd(ad.id, {
        sponsorName: ad.sponsorName ?? '',
        headline: ad.headline ?? '',
        bodyCopy: ad.bodyCopy ?? '',
        mediaUrl: ad.mediaUrl,
        mediaKind: ad.mediaKind ?? 'image',
        durationSec: ad.durationSec || 10,
        categoryTag: ad.categoryTag ?? '',
        active: ad.active === false,
        targetScope: ad.targetScope === 'selected' ? 'selected' : 'all',
        targetClientIds: Array.isArray(ad.targetClientIds) ? ad.targetClientIds : [],
      });
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Unable to update ad status.');
    } finally {
      setSavingId(null);
    }
  };

  const handleDelete = async (adId: string) => {
    setPanelError(null);
    setSavingId(adId);
    try {
      await deleteNetworkAd(adId);
      setConfirmDeleteId(null);
      if (editingId === adId) {
        setEditingId(null);
      }
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to delete sponsored ad.');
    } finally {
      setSavingId(null);
    }
  };

  const handleClientJoinToggle = async (client: ClientAccount, nextJoined: boolean) => {
    if (client.adProgramOptedIn === nextJoined) return;
    setPanelError(null);
    setTogglingClientId(client.id);
    try {
      await onToggleClientJoin(client, nextJoined);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : 'Failed to update client participation.');
    } finally {
      setTogglingClientId(null);
    }
  };

  const toggleTargetClient = (clientId: string) => {
    setDraft((prev) => {
      const current = prev.targetClientIds ?? [];
      const exists = current.includes(clientId);
      return {
        ...prev,
        targetClientIds: exists
          ? current.filter((id) => id !== clientId)
          : [...current, clientId],
      };
    });
  };

  const describeTargetSummary = (ad: AdminNetworkAd): string => {
    if (ad.targetScope !== 'selected') {
      return 'All joined clients';
    }
    const ids = ad.targetClientIds ?? [];
    if (ids.length === 0) {
      return 'No clients linked yet';
    }
    if (ids.length === 1) {
      return `Linked to ${clientNameMap.get(ids[0]) ?? '1 client'}`;
    }
    const first = clientNameMap.get(ids[0]);
    return first
      ? `Linked to ${first} + ${ids.length - 1} more`
      : `Linked to ${ids.length} clients`;
  };

  return (
    <div className="space-y-6">
      {/* Network Quantitative Strip */}
      <section
        aria-label="Ad Network Summary"
        className="rounded-xl border border-slate-200 bg-white grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 overflow-hidden"
      >
        <div className="p-4">
          <span className="text-xs text-slate-500">9:16 Sponsored Ads</span>
          <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
            {metrics.activeAds} active
          </div>
          <p className="text-xs text-slate-400 mt-0.5 tabular-nums">
            {metrics.totalAds} total creatives in network
          </p>
        </div>

        <div className="p-4">
          <span className="text-xs text-slate-500">Joined Client Venues</span>
          <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
            {metrics.joinedClients} / {metrics.totalClients}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Enrolled in Ad Network</p>
        </div>

        <div className="p-4">
          <span className="text-xs text-slate-500">Ad-Enabled Units</span>
          <div className="mt-1 text-xl font-semibold font-mono text-slate-900 tabular-nums">
            {metrics.adEnabledUnits} units
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Receiving network rotation</p>
        </div>

        <div className="p-4">
          <span className="text-xs text-slate-500">Monthly Ad Spend Credits</span>
          <div className="mt-1 text-xl font-semibold font-mono text-emerald-700 tabular-nums">
            −${metrics.totalCredits.toFixed(2)}
          </div>
          <p className="text-xs text-slate-400 mt-0.5">Credited across joined venues</p>
        </div>
      </section>

      {panelError && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{panelError}</span>
          <button
            type="button"
            onClick={() => setPanelError(null)}
            className="text-red-700 hover:text-red-900 shrink-0"
            aria-label="Dismiss error"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Upload 9:16 Sponsored Creative */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              9:16 Sponsored Ad Creative Library
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Upload vertical 9:16 images or videos for tabletop screens and link them to all joined clients or specific accounts.
            </p>
          </div>
          {uploading && (
            <span className="text-xs font-medium text-amber-700">
              Uploading 9:16 creative to server...
            </span>
          )}
        </div>

        <MediaDropzone
          acceptVideo
          multiple
          title="Upload 9:16 Sponsored Ad Creative"
          subtitle="Vertical 9:16 recommended (1080×1920 JPG, PNG, WebP, MP4, WebM)"
          onUpload={(results) => void handleUploadNew(results)}
        />
      </section>

      {/* Main Split: Sponsored Ad Inventory + Client Join Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Uploaded 9:16 Ads */}
        <section className="lg:col-span-7 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-slate-900">
              Network Ad Placements ({ads.length})
            </h3>
          </div>

          {loading ? (
            <div className="rounded-xl border border-slate-200 bg-white px-5 py-12 text-center text-sm text-slate-500">
              Loading Ad Network creatives...
            </div>
          ) : ads.length === 0 ? (
            <div className="rounded-xl border border-slate-200 bg-white px-6 py-12 text-center space-y-2.5">
              <Megaphone className="w-7 h-7 mx-auto text-slate-400" aria-hidden="true" />
              <p className="text-sm font-semibold text-slate-900">No network ads uploaded yet</p>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Drop a 9:16 image or video above to push sponsored partner creatives to opted-in client tabletop screens.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {ads.map((ad) => {
                const isEditing = editingId === ad.id;
                const isActive = ad.active !== false;
                const isBusy = savingId === ad.id;
                const isDeleting = confirmDeleteId === ad.id;
                const displayTitle =
                  ad.headline?.trim() || ad.sponsorName?.trim() || '9:16 Sponsored Placement';

                return (
                  <article
                    key={ad.id}
                    className={`rounded-xl border bg-white overflow-hidden transition-colors ${
                      isEditing ? 'border-amber-500' : 'border-slate-200'
                    }`}
                  >
                    <div className="p-4 flex gap-4 items-start">
                      {/* 9:16 Portrait Preview Frame */}
                      <button
                        type="button"
                        onClick={() => setPreviewAd(ad)}
                        title="Expand 9:16 preview"
                        className="group relative w-20 sm:w-24 aspect-[9/16] rounded-lg overflow-hidden bg-slate-950 border border-slate-200 shrink-0 flex items-center justify-center"
                      >
                        <MediaAsset
                          src={isEditing ? draft.mediaUrl || ad.mediaUrl : ad.mediaUrl}
                          kind={isEditing ? draft.mediaKind : ad.mediaKind}
                          alt={displayTitle}
                          fit="smart"
                        />
                        <span className="absolute inset-0 bg-black/0 group-hover:bg-black/35 transition-colors flex items-center justify-center">
                          <Eye
                            className="w-4 h-4 text-white opacity-0 group-hover:opacity-100 transition-opacity"
                            aria-hidden="true"
                          />
                        </span>
                      </button>

                      {/* Metadata & Actions */}
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <h4 className="text-sm font-semibold text-slate-900 truncate">
                              {displayTitle}
                            </h4>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 tabular-nums">
                              {ad.sponsorName?.trim() && <span>{ad.sponsorName}</span>}
                              {ad.sponsorName?.trim() && ad.categoryTag?.trim() && (
                                <span aria-hidden="true">·</span>
                              )}
                              {ad.categoryTag?.trim() && <span>{ad.categoryTag}</span>}
                              {(ad.sponsorName?.trim() || ad.categoryTag?.trim()) && (
                                <span aria-hidden="true">·</span>
                              )}
                              <span>{ad.durationSec}s slot</span>
                              <span aria-hidden="true">·</span>
                              <span className={isActive ? 'text-emerald-700 font-medium' : 'text-slate-400'}>
                                {isActive ? 'Active' : 'Paused'}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => void handleToggleAdActive(ad)}
                              disabled={isBusy}
                              title={isActive ? 'Pause sponsored ad' : 'Activate sponsored ad'}
                              className={`p-1.5 rounded-md transition-colors ${
                                isActive
                                  ? 'text-emerald-700 hover:bg-emerald-50'
                                  : 'text-slate-400 hover:bg-slate-100'
                              }`}
                            >
                              <Power className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            <button
                              type="button"
                              onClick={() => (isEditing ? setEditingId(null) : startEdit(ad))}
                              title="Edit details and linked clients"
                              className={`p-1.5 rounded-md transition-colors ${
                                isEditing
                                  ? 'bg-amber-50 text-amber-800'
                                  : 'text-slate-500 hover:text-slate-900 hover:bg-slate-100'
                              }`}
                            >
                              <Pencil className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>

                            {isDeleting ? (
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={isBusy}
                                  onClick={() => void handleDelete(ad.id)}
                                  className="rounded-md bg-red-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-red-700"
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteId(null)}
                                  className="rounded-md px-1.5 py-1 text-[11px] text-slate-500 hover:text-slate-800"
                                >
                                  Cancel
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteId(ad.id)}
                                title="Delete sponsored ad"
                                className="p-1.5 rounded-md text-slate-400 hover:text-red-600 hover:bg-red-50"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            )}
                          </div>
                        </div>

                        {ad.bodyCopy?.trim() && (
                          <p className="text-xs text-slate-600 line-clamp-2">{ad.bodyCopy}</p>
                        )}

                        <div className="pt-1 flex items-center gap-1.5 text-xs text-slate-600">
                          <Link2 className="w-3.5 h-3.5 text-amber-700 shrink-0" aria-hidden="true" />
                          <span className="font-medium text-slate-800">
                            {describeTargetSummary(ad)}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Inline Editor */}
                    {isEditing && (
                      <div className="border-t border-slate-200 bg-slate-50/70 p-4 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Sponsor Name (optional)
                            </label>
                            <input
                              type="text"
                              maxLength={120}
                              value={draft.sponsorName}
                              onChange={(e) => setDraft({ ...draft, sponsorName: e.target.value })}
                              placeholder="e.g. Local Craft Roasters"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Category Tag (optional)
                            </label>
                            <input
                              type="text"
                              maxLength={80}
                              value={draft.categoryTag}
                              onChange={(e) => setDraft({ ...draft, categoryTag: e.target.value })}
                              placeholder="e.g. Beverage Partner"
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Headline (optional — leave blank for full-bleed 9:16 artwork)
                          </label>
                          <input
                            type="text"
                            maxLength={140}
                            value={draft.headline}
                            onChange={(e) => setDraft({ ...draft, headline: e.target.value })}
                            placeholder="Leave blank if headline is already in your 9:16 graphic"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1">
                            Supporting Copy (optional)
                          </label>
                          <textarea
                            rows={2}
                            maxLength={400}
                            value={draft.bodyCopy}
                            onChange={(e) => setDraft({ ...draft, bodyCopy: e.target.value })}
                            placeholder="Optional caption below headline"
                            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-amber-600 focus:outline-none"
                          />
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-end">
                          <div>
                            <label className="block text-xs font-medium text-slate-600 mb-1">
                              Slot Duration (seconds)
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={120}
                              value={draft.durationSec}
                              onChange={(e) =>
                                setDraft({
                                  ...draft,
                                  durationSec: Math.max(
                                    1,
                                    Math.min(120, Number(e.target.value) || 10)
                                  ),
                                })
                              }
                              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-mono tabular-nums text-slate-900 focus:border-amber-600 focus:outline-none"
                            />
                          </div>

                          <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer pb-2">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(e) => setDraft({ ...draft, active: e.target.checked })}
                              className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                            />
                            Ad active in rotation
                          </label>
                        </div>

                        {/* Replace 9:16 Media */}
                        <div>
                          <label className="block text-xs font-medium text-slate-600 mb-1.5">
                            Replace 9:16 Creative
                          </label>
                          <MediaDropzone
                            compact
                            acceptVideo
                            title="Drop replacement 9:16 image or video"
                            onUpload={(results) => {
                              const first = results[0];
                              if (first) {
                                setDraft((prev) => ({
                                  ...prev,
                                  mediaUrl: first.mediaUrl,
                                  mediaKind: first.mediaKind,
                                  mediaAssetId: first.mediaAssetId,
                                }));
                              }
                            }}
                          />
                        </div>

                        {/* Link to Clients */}
                        <div className="rounded-lg border border-slate-200 bg-white p-3 space-y-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-xs font-semibold text-slate-800">
                              Link Ad to Client Accounts
                            </span>
                            <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100">
                              {(['all', 'selected'] as AdTargetScope[]).map((scope) => (
                                <button
                                  key={scope}
                                  type="button"
                                  onClick={() => setDraft({ ...draft, targetScope: scope })}
                                  className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                                    draft.targetScope === scope
                                      ? 'bg-white text-slate-900 shadow-sm'
                                      : 'text-slate-600 hover:text-slate-900'
                                  }`}
                                >
                                  {scope === 'all' ? 'All Joined Clients' : 'Specific Clients'}
                                </button>
                              ))}
                            </div>
                          </div>

                          {draft.targetScope === 'selected' && (
                            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                              {clients.length === 0 ? (
                                <p className="text-xs text-slate-500">
                                  No client accounts created yet.
                                </p>
                              ) : (
                                clients.map((client) => {
                                  const checked = (draft.targetClientIds ?? []).includes(client.id);
                                  return (
                                    <label
                                      key={client.id}
                                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs cursor-pointer hover:bg-slate-50"
                                    >
                                      <span className="flex items-center gap-2 min-w-0">
                                        <input
                                          type="checkbox"
                                          checked={checked}
                                          onChange={() => toggleTargetClient(client.id)}
                                          className="rounded border-slate-300 text-amber-700 focus:ring-amber-600"
                                        />
                                        <span className="font-medium text-slate-900 truncate">
                                          {client.businessName}
                                        </span>
                                      </span>
                                      <span
                                        className={`shrink-0 font-medium ${
                                          client.adProgramOptedIn
                                            ? 'text-emerald-700'
                                            : 'text-slate-400'
                                        }`}
                                      >
                                        {client.adProgramOptedIn ? 'Joined' : 'Opted Out'}
                                      </span>
                                    </label>
                                  );
                                })
                              )}
                            </div>
                          )}
                        </div>

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setEditingId(null)}
                            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => void handleSaveEdit(ad)}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-slate-800 disabled:opacity-60"
                          >
                            <Check className="w-3.5 h-3.5" aria-hidden="true" />
                            {isBusy ? 'Saving...' : 'Save Ad'}
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Right: Client Ad Network Join / Do Not Join Controls */}
        <section className="lg:col-span-5 space-y-3">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Client Ad Network Enrollment ({clients.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Choose whether each client joins or opts out of the Ad Network. Only joined clients display sponsored 9:16 ads and receive monthly ad spend credits.
            </p>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-200 overflow-hidden">
            {clients.length === 0 ? (
              <div className="px-5 py-10 text-center space-y-2">
                <Users className="w-6 h-6 mx-auto text-slate-400" aria-hidden="true" />
                <p className="text-xs text-slate-500">
                  No client accounts yet. Add or sync a venue under Client Accounts to link ads here.
                </p>
              </div>
            ) : (
              clients.map((client) => {
                const linkedCount = filterNetworkAdsForClient(
                  ads,
                  client.id,
                  client.businessName
                ).length;
                const isToggling = togglingClientId === client.id;

                return (
                  <div key={client.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900 truncate">
                        {client.businessName}
                      </div>
                      <div className="text-xs text-slate-500 mt-0.5 tabular-nums">
                        <span>{client.activeUnits} units</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span>{linkedCount} linked ads</span>
                        <span className="mx-1.5" aria-hidden="true">·</span>
                        <span
                          className={
                            client.adProgramOptedIn && client.monthlyCredit > 0
                              ? 'text-emerald-700 font-medium'
                              : 'text-slate-400'
                          }
                        >
                          {client.adProgramOptedIn
                            ? `−$${(client.monthlyCredit || 0).toFixed(2)}/mo credit`
                            : '$0.00/mo credit'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 p-1 rounded-lg bg-slate-100 shrink-0 self-start sm:self-center">
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => void handleClientJoinToggle(client, true)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                          client.adProgramOptedIn
                            ? 'bg-emerald-700 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Joined
                      </button>
                      <button
                        type="button"
                        disabled={isToggling}
                        onClick={() => void handleClientJoinToggle(client, false)}
                        className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
                          !client.adProgramOptedIn
                            ? 'bg-slate-900 text-white shadow-sm'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Opted Out
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>
      </div>

      {/* Full 9:16 Lightbox Preview */}
      {previewAd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setPreviewAd(null)}
        >
          <div
            className="relative w-full max-w-xs space-y-3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between text-white">
              <span className="text-xs font-medium truncate pr-3">
                {previewAd.headline || previewAd.sponsorName || '9:16 Sponsored Ad'}
              </span>
              <button
                type="button"
                onClick={() => setPreviewAd(null)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white"
                aria-label="Close preview"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <div className="aspect-[9/16] w-full rounded-2xl overflow-hidden bg-black border border-white/15 shadow-2xl">
              <MediaAsset
                src={previewAd.mediaUrl}
                kind={previewAd.mediaKind}
                alt={previewAd.headline || previewAd.sponsorName || '9:16 Sponsored Ad'}
                fit="smart"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
