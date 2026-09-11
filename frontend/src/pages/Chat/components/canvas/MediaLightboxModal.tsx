import React, { useState, useEffect } from 'react';
import {
  Image as ImageIcon,
  ZoomIn,
  ZoomOut,
  RotateCw,
  ExternalLink,
  Download,
  X,
} from 'lucide-react';

export interface MediaLightboxModalProps {
  previewImage: string | null;
  onClose: () => void;
  customerDisplayName?: string;
}

export const MediaLightboxModal: React.FC<MediaLightboxModalProps> = ({
  previewImage,
  onClose,
  customerDisplayName = 'محادثة الشات',
}) => {
  const [previewZoom, setPreviewZoom] = useState<number>(1);
  const [previewRotation, setPreviewRotation] = useState<number>(0);

  // Reset zoom & rotation whenever previewImage changes
  useEffect(() => {
    if (previewImage) {
      setPreviewZoom(1);
      setPreviewRotation(0);
    }
  }, [previewImage]);

  // Keyboard Navigation: Escape, +, -, r/R
  useEffect(() => {
    if (!previewImage) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === '+' || e.key === '=') {
        setPreviewZoom((prev) => Math.min(prev + 0.25, 3));
      } else if (e.key === '-' || e.key === '_') {
        setPreviewZoom((prev) => Math.max(prev - 0.25, 0.5));
      } else if (e.key === 'r' || e.key === 'R') {
        setPreviewRotation((prev) => (prev + 90) % 360);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewImage, onClose]);

  if (!previewImage) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex flex-col justify-between p-4 select-none animate-in fade-in zoom-in-95 duration-150"
      onClick={onClose}
    >
      {/* Top Bar with Controls */}
      <div
        className="flex items-center justify-between w-full max-w-5xl mx-auto text-white z-10 shrink-0 py-2"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sender / Title Info */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center border border-white/20">
            <ImageIcon className="w-4 h-4 text-white" />
          </div>
          <div>
            <p className="text-xs font-bold text-white">معاينة الصورة بالحجم الكامل</p>
            <p className="text-[10px] text-slate-300">{customerDisplayName}</p>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-md p-1 rounded-2xl border border-white/10 shadow-lg">
          {/* Zoom Out */}
          <button
            type="button"
            onClick={() => setPreviewZoom((prev) => Math.max(prev - 0.25, 0.5))}
            className="p-2 rounded-xl text-white hover:bg-white/20 transition"
            title="تصغير (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>

          {/* Zoom Reset */}
          <span className="text-xs font-mono px-1.5 font-bold text-white">
            {Math.round(previewZoom * 100)}%
          </span>

          {/* Zoom In */}
          <button
            type="button"
            onClick={() => setPreviewZoom((prev) => Math.min(prev + 0.25, 3))}
            className="p-2 rounded-xl text-white hover:bg-white/20 transition"
            title="تكبير (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          {/* Rotate */}
          <button
            type="button"
            onClick={() => setPreviewRotation((prev) => (prev + 90) % 360)}
            className="p-2 rounded-xl text-white hover:bg-white/20 transition"
            title="تدوير 90 درجة (R)"
          >
            <RotateCw className="w-4 h-4" />
          </button>

          {/* Open External / New Tab */}
          <a
            href={previewImage}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-xl text-white hover:bg-white/20 transition"
            title="فتح في تبويب جديد"
          >
            <ExternalLink className="w-4 h-4" />
          </a>

          {/* Direct Download */}
          <a
            href={previewImage}
            download={`chat-image-${Date.now()}.jpg`}
            target="_blank"
            rel="noreferrer"
            className="p-2 rounded-xl bg-teal-600 hover:bg-teal-700 text-white transition flex items-center gap-1 font-bold text-xs shadow-xs"
            title="تحميل الصورة"
          >
            <Download className="w-4 h-4" />
            <span className="hidden sm:inline">تحميل</span>
          </a>

          {/* Close (X / Esc) */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-rose-600/90 hover:bg-rose-600 text-white transition shadow-xs"
            title="إغلاق (ESC)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Center Image Viewport */}
      <div
        className="flex-1 flex items-center justify-center overflow-hidden my-auto w-full max-w-5xl mx-auto cursor-pointer"
        onClick={onClose}
      >
        <div
          className="transition-transform duration-200 ease-out flex items-center justify-center"
          style={{
            transform: `scale(${previewZoom}) rotate(${previewRotation}deg)`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <img
            src={previewImage}
            alt="معاينة الشات"
            className="max-h-[78vh] max-w-[85vw] object-contain rounded-2xl shadow-2xl border border-white/20 cursor-default"
            onDoubleClick={() => setPreviewZoom((prev) => (prev > 1 ? 1 : 1.75))}
          />
        </div>
      </div>

      {/* Bottom Caption / Controls Note */}
      <div
        className="text-center text-[11px] text-slate-400 font-medium py-1 shrink-0 z-10"
        onClick={(e) => e.stopPropagation()}
      >
        <span>اضغط مرتين للتكبير السريع • يمكنك استخدام أزرار التكبير والتدوير والتحميل أو زر ESC للخروج</span>
      </div>
    </div>
  );
};
