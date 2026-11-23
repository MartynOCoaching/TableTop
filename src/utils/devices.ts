import type { ScreenOrientation, TabletopDevice } from '../types.ts';

export function generatePairingCode(seedIndex?: number): string {
  if (typeof seedIndex === 'number') {
    const num = 1000 + ((seedIndex * 137 + 42) % 9000);
    return `TT-${num}`;
  }
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `TT-${rand}`;
}

export function buildDefaultDevices(
  count: number,
  options?: {
    startIndex?: number;
    prefix?: string;
    locationZone?: string;
    orientation?: ScreenOrientation;
  }
): TabletopDevice[] {
  const safeCount = Math.max(0, Math.min(500, Math.round(count)));
  const startIndex = options?.startIndex ?? 1;
  const prefix = options?.prefix?.trim() || 'Table';
  const orientation: ScreenOrientation = options?.orientation ?? 'portrait-9-16';

  return Array.from({ length: safeCount }, (_, idx) => {
    const num = startIndex + idx;
    const isDefaultBarSlot = !options?.prefix && safeCount >= 12 && idx >= safeCount - 4;
    const label = isDefaultBarSlot
      ? `Bar Top ${idx - (safeCount - 4) + 1}`
      : `${prefix} ${num}`;
    const zone =
      options?.locationZone?.trim() ||
      (isDefaultBarSlot ? 'Bar Counter' : 'Main Dining');

    return {
      id: `dev_${Date.now().toString(36)}_${num}_${Math.random().toString(36).slice(2, 6)}`,
      name: label,
      locationZone: zone,
      orientation,
      pairingCode: generatePairingCode(num),
      status: 'active',
    };
  });
}

export function countActiveDevices(devices: TabletopDevice[]): number {
  return devices.filter((d) => d.status === 'active').length;
}

/**
 * Keeps `devices` synchronized when an integer `unitCount` is edited from
 * Venue Settings or Ad Monetization controls.
 */
export function reconcileDevicesWithUnitCount(
  existingDevices: TabletopDevice[],
  targetActiveCount: number
): TabletopDevice[] {
  const target = Math.max(0, Math.min(500, Math.round(targetActiveCount)));
  const next = existingDevices.map((d) => ({ ...d }));
  const activeIndices = next
    .map((d, i) => (d.status === 'active' ? i : -1))
    .filter((i) => i >= 0);

  if (activeIndices.length === target) {
    return next;
  }

  if (activeIndices.length < target) {
    let needed = target - activeIndices.length;
    // First re-activate any paused screens before creating new ones
    for (let i = 0; i < next.length && needed > 0; i++) {
      if (next[i].status !== 'active') {
        next[i].status = 'active';
        needed -= 1;
      }
    }
    if (needed > 0) {
      const created = buildDefaultDevices(needed, {
        startIndex: next.length + 1,
        prefix: 'Screen',
        locationZone: 'Main Dining',
      });
      next.push(...created);
    }
    return next;
  }

  // activeIndices.length > target -> remove trailing active devices so screen list matches unitCount
  let toRemove = activeIndices.length - target;
  for (let i = next.length - 1; i >= 0 && toRemove > 0; i--) {
    if (next[i].status === 'active') {
      next.splice(i, 1);
      toRemove -= 1;
    }
  }
  return next;
}
