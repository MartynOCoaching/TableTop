import React, { useEffect, useMemo, useState } from 'react';
import { SEED_PORTAL_STATE } from '../data/seedData';
import { fetchServerNetworkAds, filterNetworkAdsForClient } from '../services/networkAdsService';
import { AdminNetworkAd, EmulatorMode, PortalState } from '../types';
import { fetchPublishedState, SYNC_CHANNEL_NAME } from '../utils/publishSync';
import { TabletopScreen } from './TabletopScreen';

export const StandaloneEmulatorPage: React.FC = () => {
  const [state, setState] = useState<PortalState>(SEED_PORTAL_STATE);
  const [networkAds, setNetworkAds] = useState<AdminNetworkAd[]>([]);
  const [mode, setMode] = useState<EmulatorMode>('attract');
  const [slideIndex, setSlideIndex] = useState(0);

  useEffect(() => {
    let active = true;

    void fetchPublishedState().then((payload) => {
      if (!active) return;
      if (payload?.state) {
        setState(payload.state);
      }
      if (Array.isArray(payload?.networkAds)) {
        setNetworkAds(payload.networkAds);
      }
    });

    void fetchServerNetworkAds().then((ads) => {
      if (active && ads) {
        setNetworkAds(ads);
      }
    });

    const eventSource = new EventSource('/api/emulator/stream');

    eventSource.addEventListener('init', (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          state?: PortalState;
          networkAds?: AdminNetworkAd[];
        };
        if (payload?.state) {
          setState(payload.state);
        }
        if (Array.isArray(payload?.networkAds)) {
          setNetworkAds(payload.networkAds);
        }
      } catch {
        // Ignore malformed event
      }
    });

    eventSource.addEventListener('published', (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          state?: PortalState;
        };
        if (payload?.state) {
          setState(payload.state);
        }
      } catch {
        // Ignore malformed event
      }
    });

    eventSource.addEventListener('network-ads', (event) => {
      if (!active) return;
      try {
        const payload = JSON.parse((event as MessageEvent).data) as {
          ads?: AdminNetworkAd[];
        };
        if (Array.isArray(payload?.ads)) {
          setNetworkAds(payload.ads);
        }
      } catch {
        // Ignore malformed event
      }
    });

    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== 'undefined') {
      channel = new BroadcastChannel(SYNC_CHANNEL_NAME);
      channel.onmessage = (msg) => {
        if (!active) return;
        const payload = msg.data as { type?: string; state?: PortalState };
        if (payload?.type === 'published' && payload.state) {
          setState(payload.state);
        }
      };
    }

    return () => {
      active = false;
      eventSource.close();
      channel?.close();
    };
  }, []);

  const linkedAds = useMemo(
    () => filterNetworkAdsForClient(networkAds, state.venue.clientId, state.venue.name),
    [networkAds, state.venue.clientId, state.venue.name]
  );

  return (
    <main className="h-dvh w-screen overflow-hidden bg-black flex items-center justify-center">
      <div className="h-full w-full max-w-[calc(100dvh*9/16)] overflow-hidden">
        <TabletopScreen
          state={state}
          networkAds={linkedAds}
          mode={mode}
          onModeChange={setMode}
          slideIndex={slideIndex}
          onSlideIndexChange={setSlideIndex}
          isPlaying
          nativeDevice
        />
      </div>
    </main>
  );
};
