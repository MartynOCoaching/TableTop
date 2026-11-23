import React, { useRef, useState } from 'react';
import { Upload, Image as ImageIcon, AlertCircle } from 'lucide-react';
import { MediaKind } from '../types';
import { saveMediaFile } from '../utils/storage';

export interface UploadedMediaResult {
  mediaUrl: string;
  mediaKind: MediaKind;
  mediaAssetId: string;
  fileName: string;
}

interface MediaDropzoneProps {
  onUpload: (results: UploadedMediaResult[]) => void;
  acceptVideo?: boolean;
  multiple?: boolean;
  compact?: boolean;
  title?: string;
  subtitle?: string;
}

export const MediaDropzone: React.FC<MediaDropzoneProps> = ({
  onUpload,
  acceptVideo = true,
  multiple = false,
  compact = false,
  title,
  subtitle,
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const acceptAttr = acceptVideo
    ? 'image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm,video/quicktime'
    : 'image/jpeg,image/png,image/webp,image/gif';

  const processFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setErrorMsg(null);
    setIsProcessing(true);

    const files = Array.from(fileList).slice(0, multiple ? 10 : 1);
    const validResults: UploadedMediaResult[] = [];
    const rejectedNames: string[] = [];

    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (!isImage && !(acceptVideo && isVideo)) {
        rejectedNames.push(file.name);
        continue;
      }

      const saved = await saveMediaFile(file);
      validResults.push({
        mediaUrl: saved.objectUrl,
        mediaKind: isVideo ? 'video' : 'image',
        mediaAssetId: saved.assetId,
        fileName: file.name,
      });
    }

    setIsProcessing(false);

    if (rejectedNames.length > 0) {
      setErrorMsg(
        acceptVideo
          ? `Unsupported file format: ${rejectedNames.join(', ')}. Use JPG, PNG, WebP, MP4, or WebM.`
          : `Unsupported image format: ${rejectedNames.join(', ')}. Use JPG, PNG, or WebP.`
      );
    }

    if (validResults.length > 0) {
      onUpload(validResults);
    }

    if (inputRef.current) {
      inputRef.current.value = '';
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragging) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    void processFiles(e.dataTransfer.files);
  };

  return (
    <div className="space-y-2">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            inputRef.current?.click();
          }
        }}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`group relative flex flex-col items-center justify-center rounded-xl border border-dashed transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-600 focus-visible:ring-offset-2 ${
          compact ? 'px-4 py-4' : 'px-6 py-7'
        } ${
          isDragging
            ? 'border-amber-600 bg-amber-50/70'
            : 'border-slate-300 bg-white hover:border-slate-400 hover:bg-slate-50/60'
        }`}
      >
        <input
          ref={inputRef}
          type="file"
          accept={acceptAttr}
          multiple={multiple}
          className="sr-only"
          onChange={(e) => void processFiles(e.target.files)}
        />

        <div className="flex items-center gap-3 text-slate-700">
          <div
            className={`flex items-center justify-center rounded-lg border transition-colors ${
              compact ? 'w-9 h-9' : 'w-11 h-11'
            } ${
              isDragging
                ? 'border-amber-300 bg-amber-100 text-amber-800'
                : 'border-slate-200 bg-slate-50 text-slate-600 group-hover:bg-slate-100'
            }`}
          >
            <Upload className={compact ? 'w-4 h-4' : 'w-5 h-5'} aria-hidden="true" />
          </div>
          <div className="text-left">
            <p className="text-sm font-medium text-slate-900">
              {isProcessing
                ? 'Processing media...'
                : title ?? (acceptVideo ? 'Browse Files' : 'Drag and drop your images')}
            </p>
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span>{subtitle ?? (acceptVideo ? 'JPG, PNG, WebP, MP4, WebM' : 'JPG, PNG, WebP')}</span>
              <span aria-hidden="true">·</span>
              <span className="text-amber-700 font-medium group-hover:underline">Browse files</span>
            </p>
          </div>
        </div>

        {!compact && (
          <div className="mt-3 flex items-center gap-4 text-xs text-slate-400">
            <span className="inline-flex items-center gap-1">
              <ImageIcon className="w-3.5 h-3.5" aria-hidden="true" />
              9:16 Full Screen · 1:1 / 16:9 Auto-Fit
            </span>
          </div>
        )}
      </div>

      {errorMsg && (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
          <span>{errorMsg}</span>
        </div>
      )}
    </div>
  );
};
