import React, { useEffect, useState } from 'react';
import { Film, Image as ImageIcon } from 'lucide-react';
import { MediaKind } from '../types';

export type MediaFitMode = 'cover' | 'contain' | 'smart';

export function isNineSixteenRatio(width: number, height: number): boolean {
  if (!width || !height) return false;
  const ratio = width / height;
  // 9:16 is 0.5625; match portrait 9:16 assets with slight tolerance (0.50–0.62)
  return ratio >= 0.5 && ratio <= 0.62;
}

interface MediaAssetProps {
  src?: string;
  kind?: MediaKind;
  alt: string;
  className?: string;
  fit?: MediaFitMode;
  onAspectChange?: (isNineSixteen: boolean) => void;
  autoPlay?: boolean;
  muted?: boolean;
  loop?: boolean;
  controls?: boolean;
}

export const MediaAsset: React.FC<MediaAssetProps> = ({
  src,
  kind = 'image',
  alt,
  className,
  fit = 'cover',
  onAspectChange,
  autoPlay = true,
  muted = true,
  loop = true,
  controls = false,
}) => {
  const [hasError, setHasError] = useState(false);
  const [detectedNineSixteen, setDetectedNineSixteen] = useState<boolean | null>(null);

  useEffect(() => {
    setHasError(false);
    setDetectedNineSixteen(null);
  }, [src, kind]);

  const resolvedClassName = (() => {
    if (className) return className;
    if (fit === 'contain') {
      return 'max-w-full max-h-full w-full h-full object-contain';
    }
    if (fit === 'smart') {
      return detectedNineSixteen
        ? 'w-full h-full object-cover'
        : 'max-w-full max-h-full w-full h-full object-contain';
    }
    return 'w-full h-full object-cover';
  })();

  const reportDimensions = (width: number, height: number) => {
    const match = isNineSixteenRatio(width, height);
    setDetectedNineSixteen(match);
    onAspectChange?.(match);
  };

  if (!src || hasError) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-slate-800 via-slate-900 to-stone-900 text-slate-300 p-4 text-center w-full h-full ${className ?? ''}`}
        role="img"
        aria-label={alt}
      >
        {kind === 'video' ? (
          <Film className="w-6 h-6 mb-2 text-amber-400/80" aria-hidden="true" />
        ) : (
          <ImageIcon className="w-6 h-6 mb-2 text-amber-400/80" aria-hidden="true" />
        )}
        <span className="text-xs font-medium text-slate-200 line-clamp-2 max-w-[180px]">{alt}</span>
      </div>
    );
  }

  if (kind === 'video') {
    return (
      <video
        src={src}
        className={resolvedClassName}
        autoPlay={autoPlay}
        muted={muted}
        loop={loop}
        controls={controls}
        playsInline
        onLoadedMetadata={(e) =>
          reportDimensions(e.currentTarget.videoWidth, e.currentTarget.videoHeight)
        }
        onError={() => setHasError(true)}
        aria-label={alt}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      className={resolvedClassName}
      onLoad={(e) =>
        reportDimensions(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)
      }
      onError={() => setHasError(true)}
    />
  );
};
