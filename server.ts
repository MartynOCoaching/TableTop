import express from 'express';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { Request, Response } from 'express';
import { SEED_PORTAL_STATE, stripLegacyMockPortalState } from './src/data/seedData.ts';
import type { AdminNetworkAd, PortalState } from './src/types.ts';

const PORT = Number(process.env.PORT) || 3000;
const DATA_DIR = path.resolve(process.cwd(), '.data');
const MEDIA_DIR = path.join(DATA_DIR, 'media');
const STATE_FILE = path.join(DATA_DIR, 'published-state.json');
const NETWORK_ADS_FILE = path.join(DATA_DIR, 'network-ads.json');

interface SseClient {
  id: string;
  res: Response;
}

let publishedState: PortalState = structuredClone(SEED_PORTAL_STATE);
let stateVersion = 1;
let networkAdsState: AdminNetworkAd[] = [];
let networkAdsVersion = 1;
const sseClients = new Map<string, SseClient>();

function isStockNetworkAd(ad: Partial<AdminNetworkAd>): boolean {
  const url = (ad.mediaUrl ?? '').trim();
  return ad.id === 'net-ad-1' || ad.id === 'net-ad-2' || url.startsWith('/src/assets/images/');
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

const EXT_TO_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
};

async function ensureStorage(): Promise<void> {
  try {
    await fs.mkdir(MEDIA_DIR, { recursive: true });
    try {
      const raw = await fs.readFile(STATE_FILE, 'utf8');
      const parsed = JSON.parse(raw) as { state?: PortalState; version?: number };
      if (parsed?.state) {
        const cleaned = stripLegacyMockPortalState(parsed.state);
        publishedState = cleaned;
        stateVersion = typeof parsed.version === 'number' ? parsed.version : 1;
        if (
          cleaned.promotions.length !== parsed.state.promotions.length ||
          cleaned.menuItems.length !== parsed.state.menuItems.length ||
          cleaned.specials.length !== parsed.state.specials.length
        ) {
          await persistState();
        }
      }
    } catch {
      await persistState();
    }
    try {
      const rawAds = await fs.readFile(NETWORK_ADS_FILE, 'utf8');
      const parsedAds = JSON.parse(rawAds) as { ads?: AdminNetworkAd[]; version?: number };
      if (Array.isArray(parsedAds?.ads)) {
        const cleaned = parsedAds.ads.filter((ad) => !isStockNetworkAd(ad));
        networkAdsState = cleaned;
        networkAdsVersion = typeof parsedAds.version === 'number' ? parsedAds.version : 1;
        if (cleaned.length !== parsedAds.ads.length) {
          await persistNetworkAds();
        }
      }
    } catch {
      await persistNetworkAds();
    }
  } catch (err) {
    console.warn('Persistent disk storage unavailable, using in-memory state:', err);
  }
}

async function persistState(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      STATE_FILE,
      JSON.stringify({ state: publishedState, version: stateVersion }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to persist published state:', err);
  }
}

async function persistNetworkAds(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      NETWORK_ADS_FILE,
      JSON.stringify({ ads: networkAdsState, version: networkAdsVersion }, null, 2),
      'utf8'
    );
  } catch (err) {
    console.error('Failed to persist network ads:', err);
  }
}

function broadcastEvent(eventName: string, payload: unknown): void {
  const data = `event: ${eventName}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const [id, client] of sseClients.entries()) {
    try {
      client.res.write(data);
    } catch {
      sseClients.delete(id);
    }
  }
}

async function startServer(): Promise<void> {
  await ensureStorage();

  const app = express();

  // Raw binary media upload endpoint (supports images and videos up to 50MB)
  app.post(
    '/api/media',
    express.raw({ type: '*/*', limit: '50mb' }),
    async (req: Request, res: Response) => {
      try {
        const buffer = req.body;
        if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
          res.status(400).json({ error: 'Empty media payload' });
          return;
        }

        const contentType = String(req.headers['content-type'] || 'application/octet-stream')
          .split(';')[0]
          .trim()
          .toLowerCase();
        const ext = MIME_TO_EXT[contentType] || 'bin';
        const filename = `media_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const filePath = path.join(MEDIA_DIR, filename);

        await fs.writeFile(filePath, buffer);
        res.json({
          filename,
          url: `/api/media/${filename}`,
          size: buffer.length,
        });
      } catch (err) {
        console.error('Media upload failed:', err);
        res.status(500).json({ error: 'Failed to store uploaded media' });
      }
    }
  );

  // List uploaded media files stored on disk for client media management
  app.get('/api/media', async (_req: Request, res: Response) => {
    try {
      await fs.mkdir(MEDIA_DIR, { recursive: true });
      const entries = await fs.readdir(MEDIA_DIR, { withFileTypes: true });
      const files = await Promise.all(
        entries
          .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
          .map(async (entry) => {
            const filePath = path.join(MEDIA_DIR, entry.name);
            const stat = await fs.stat(filePath);
            const ext = path.extname(entry.name).slice(1).toLowerCase();
            const isVideo = ext === 'mp4' || ext === 'webm' || ext === 'mov';
            return {
              filename: entry.name,
              url: `/api/media/${entry.name}`,
              kind: isVideo ? ('video' as const) : ('image' as const),
              mimeType: EXT_TO_MIME[ext] || 'application/octet-stream',
              size: stat.size,
              createdAt: stat.birthtimeMs || stat.mtimeMs,
              updatedAt: stat.mtimeMs,
            };
          })
      );
      files.sort((a, b) => b.createdAt - a.createdAt);
      res.json({ files });
    } catch (err) {
      console.error('Failed to list stored media:', err);
      res.status(500).json({ error: 'Failed to list stored media' });
    }
  });

  // Serve uploaded media assets cleanly across tabs and devices
  app.get('/api/media/:filename', async (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename);
    const filePath = path.join(MEDIA_DIR, safeName);
    try {
      const data = await fs.readFile(filePath);
      const ext = path.extname(safeName).slice(1).toLowerCase();
      const mime = EXT_TO_MIME[ext] || 'application/octet-stream';
      res.setHeader('Content-Type', mime);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.send(data);
    } catch {
      res.status(404).json({ error: 'Media asset not found' });
    }
  });

  // Delete an uploaded media asset stored on disk
  app.delete('/api/media/:filename', async (req: Request, res: Response) => {
    const safeName = path.basename(req.params.filename || '');
    if (!safeName || safeName === '.' || safeName === '..') {
      res.status(400).json({ error: 'Invalid media filename' });
      return;
    }
    const filePath = path.resolve(MEDIA_DIR, safeName);
    if (!filePath.startsWith(path.resolve(MEDIA_DIR) + path.sep)) {
      res.status(400).json({ error: 'Invalid media path' });
      return;
    }
    try {
      await fs.unlink(filePath);
      res.json({ ok: true, filename: safeName });
    } catch {
      res.status(404).json({ error: 'Media asset not found' });
    }
  });

  app.use(express.json({ limit: '15mb' }));

  // Authoritative published device state
  app.get('/api/emulator/state', (_req: Request, res: Response) => {
    res.json({
      state: publishedState,
      version: stateVersion,
      networkAds: networkAdsState,
      networkAdsVersion,
    });
  });

  // Super Admin sponsored ad network feed
  app.get('/api/network-ads', (_req: Request, res: Response) => {
    res.json({
      ads: networkAdsState,
      version: networkAdsVersion,
    });
  });

  app.post('/api/network-ads', async (req: Request, res: Response) => {
    const incomingAds = req.body?.ads as AdminNetworkAd[] | undefined;
    if (!Array.isArray(incomingAds)) {
      res.status(400).json({ error: 'Invalid network ads payload' });
      return;
    }

    networkAdsState = incomingAds.filter((ad) => !isStockNetworkAd(ad));
    networkAdsVersion += 1;

    await persistNetworkAds();
    broadcastEvent('network-ads', { ads: networkAdsState, version: networkAdsVersion });

    res.json({
      ok: true,
      version: networkAdsVersion,
      count: networkAdsState.length,
    });
  });

  // Real-time Server-Sent Events stream for /emulator displays
  app.get('/api/emulator/stream', (req: Request, res: Response) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const clientId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    sseClients.set(clientId, { id: clientId, res });

    res.write(
      `event: init\ndata: ${JSON.stringify({
        state: publishedState,
        version: stateVersion,
        networkAds: networkAdsState,
        networkAdsVersion,
      })}\n\n`
    );

    const heartbeat = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        clearInterval(heartbeat);
        sseClients.delete(clientId);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      sseClients.delete(clientId);
    });
  });

  // Publish dashboard changes to all connected /emulator screens
  app.post('/api/publish', async (req: Request, res: Response) => {
    const incoming = req.body?.state as PortalState | undefined;
    if (!incoming || !incoming.venue || !Array.isArray(incoming.promotions)) {
      res.status(400).json({ error: 'Invalid portal state payload' });
      return;
    }

    const cleanedIncoming = stripLegacyMockPortalState(incoming);
    const nowIso = new Date().toISOString();
    publishedState = {
      ...cleanedIncoming,
      venue: {
        ...cleanedIncoming.venue,
        lastPublishedAt: nowIso,
      },
    };
    stateVersion += 1;

    await persistState();
    broadcastEvent('published', { state: publishedState, version: stateVersion });

    res.json({
      ok: true,
      version: stateVersion,
      lastPublishedAt: nowIso,
      connectedDisplays: sseClients.size,
    });
  });

  // Reset published state to default seed
  app.post('/api/reset', async (_req: Request, res: Response) => {
    publishedState = structuredClone(SEED_PORTAL_STATE);
    publishedState.venue.lastPublishedAt = new Date().toISOString();
    stateVersion += 1;
    await persistState();
    broadcastEvent('published', { state: publishedState, version: stateVersion });
    res.json({ ok: true, state: publishedState, version: stateVersion });
  });

  const distDir = path.resolve(process.cwd(), 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const hasDistBuild = existsSync(distIndexPath);
  const isDevMode = process.env.npm_lifecycle_event === 'dev';
  const isProduction =
    hasDistBuild &&
    !isDevMode &&
    (process.env.NODE_ENV === 'production' ||
      Boolean(process.env.K_SERVICE) ||
      Boolean(process.env.CLOUD_RUN_JOB) ||
      process.env.npm_lifecycle_event === 'start');

  if (isProduction) {
    app.use(express.static(distDir));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(distIndexPath);
    });
  } else {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Tabletop Studio server listening on http://0.0.0.0:${PORT}`);
  });
}

void startServer();
