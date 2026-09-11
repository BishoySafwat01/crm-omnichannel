import { API_BASE } from '../../../services/api';

export interface ResolvedMedia {
  isAudio: boolean;
  isImage: boolean;
  isVideo: boolean;
  isDoc: boolean;
  isShare: boolean;
  shareUrl?: string | null;
  shareType?: 'reel' | 'post' | 'story' | null;
  url: string | null;
  fileName: string;
}

export const isSocialWebLink = (url: string | undefined | null): boolean => {
  if (!url) return false;
  const clean = url.trim();

  // Immediately return false if the URL ends with or contains binary media extensions before query params (?oe=...)
  const pathBeforeQuery = clean.split('?')[0].split('#')[0];
  if (/\.(png|jpe?g|gif|webp|mp4|mov|webm|ogg|mp3|wav|m4a|aac)$/i.test(pathBeforeQuery)) {
    return false;
  }
  if (/\.(png|jpe?g|gif|webp|mp4|mov|webm|ogg|mp3|wav|m4a|aac)($|\?)/i.test(clean)) {
    return false;
  }

  // Immediately return false if the URL is on a CDN domain
  const cleanLower = clean.toLowerCase();
  if (
    cleanLower.includes('fbcdn.net') ||
    cleanLower.includes('fbsbx.com') ||
    cleanLower.includes('cdninstagram.com')
  ) {
    return false;
  }

  // Match ONLY genuine social web pages
  return (
    /(?:^|https?:\/\/(?:www\.)?)instagram\.com\/(?:reel|reels|p|stories)\//i.test(clean) ||
    /(?:^|https?:\/\/(?:www\.)?)facebook\.com\/(?:watch|story|reel)\//i.test(clean) ||
    /(?:^|https?:\/\/(?:www\.)?)fb\.watch\//i.test(clean)
  );
};

export const getProxiedMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }
  // External social web pages must NEVER be routed through the binary media proxy
  if (isSocialWebLink(url)) {
    return url;
  }
  if (url.startsWith('/uploads/http://') || url.startsWith('/uploads/https://')) {
    url = url.substring('/uploads/'.length);
  }
  const rootBase = (API_BASE || '').replace(/\/api\/v1\/?$/, '');
  if (url.startsWith('/uploads/')) {
    return `${rootBase}${url}`;
  }
  if (url.startsWith('/api/')) {
    return `${rootBase}${url}`;
  }
  if (
    url.includes('fbcdn.net') ||
    url.includes('fbsbx.com') ||
    url.includes('facebook.com') ||
    url.includes('cdninstagram.com') ||
    url.includes('instagram.com')
  ) {
    return `${API_BASE}/media/proxy?url=${encodeURIComponent(url)}`;
  }
  return url;
};

export const resolveMedia = (msg: any): ResolvedMedia => {
  let url: string | null = null;
  let mime = '';
  let type = '';
  let fileName = '';

  if (msg.attachments && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    url =
      first.url ||
      first.payload?.url ||
      first.payload?.reel_video_url ||
      first.share?.link ||
      first.image_data?.url ||
      first.image_data?.preview_url ||
      first.file_url;
    mime = first.mime_type || '';
    type = first.type || (first.image_data ? 'image' : first.file_type || '');
    fileName = first.filename || first.name || first.title || '';
  }

  if (!url && msg.media_url) {
    url = msg.media_url;
    type = msg.media_type || type || '';
  }
  if (!url && (msg.metadata_?.attachments?.[0] || msg.metadata?.attachments?.[0])) {
    const att = msg.metadata_?.attachments?.[0] || msg.metadata?.attachments?.[0];
    url =
      att.url ||
      att.payload?.url ||
      att.payload?.reel_video_url ||
      att.share?.link ||
      att.image_data?.url ||
      att.image_data?.preview_url ||
      att.file_url;
    mime = att.mime_type || '';
    type = att.type || (att.image_data ? 'image' : '');
    fileName = att.filename || att.name || att.title || '';
  }

  // Check metadata for direct share_url
  if (!url && (msg.metadata_?.share_url || msg.metadata?.share_url)) {
    url = msg.metadata_?.share_url || msg.metadata?.share_url;
  }

  const textVal = (msg.text || '').trim();

  // Extract share links from text if present (e.g. [Instagram Reel/Share: https://...])
  let extractedShareFromText: string | null = null;
  if (textVal) {
    const bracketMatch = textVal.match(/\[(?:Instagram Reel\/Share|Reel\/Share|Share):\s*(https?:\/\/[^\]\s]+)\]/i);
    if (bracketMatch && bracketMatch[1] && isSocialWebLink(bracketMatch[1])) {
      extractedShareFromText = bracketMatch[1];
    } else if (isSocialWebLink(textVal)) {
      extractedShareFromText = textVal;
    }
  }

  if (!url && extractedShareFromText) {
    url = extractedShareFromText;
  }

  if (!url && textVal) {
    const msgTypeLower = (msg.message_type || msg.media_type || type || '').toLowerCase();
    if (textVal.startsWith('http://') || textVal.startsWith('https://')) {
      if (
        msgTypeLower === 'audio' ||
        msgTypeLower === 'image' ||
        msgTypeLower === 'video' ||
        /\.(ogg|aac|opus|mp4|m4a|webm|mp3|wav|jpg|jpeg|png|webp|gif)($|\?)/i.test(textVal)
      ) {
        url = textVal;
        fileName = textVal.split('?')[0].split('/').pop() || 'media';
      }
    } else if (
      textVal.startsWith('voice_') ||
      textVal.startsWith('img_') ||
      textVal.startsWith('vid_') ||
      textVal.startsWith('image-') ||
      textVal.startsWith('/uploads/') ||
      /\.(ogg|aac|opus|mp4|m4a|webm|mp3|wav|jpg|jpeg|png|webp|gif)$/i.test(textVal)
    ) {
      url = textVal.startsWith('/uploads/')
        ? textVal
        : `/uploads/${textVal.replace(/^\(+|\)+$/g, '')}`;
      fileName = textVal;
    }
  }

  if (!url && !extractedShareFromText) {
    return {
      isAudio: false,
      isImage: false,
      isVideo: false,
      isDoc: false,
      isShare: false,
      shareUrl: null,
      shareType: null,
      url: null,
      fileName: '',
    };
  }

  const rawUrl = url || extractedShareFromText || '';
  const rawLower = rawUrl.toLowerCase();
  const isSocial = isSocialWebLink(rawUrl);
  const msgType = (msg.message_type || type || '').toLowerCase();

  // Explicit media identification
  const hasImageExt = /\.(jpg|jpeg|png|webp|gif|svg)($|\?)/i.test(rawLower);
  const hasVideoExt = /\.(mp4|mov|avi|mkv|ogv)($|\?)/i.test(rawLower);
  const hasAudioExt = /\.(ogg|m4a|mp3|wav|aac|opus)($|\?)/i.test(rawLower);
  const isCdn =
    rawLower.includes('fbcdn.net') ||
    rawLower.includes('fbsbx.com') ||
    rawLower.includes('cdninstagram.com');

  const isExplicitImage =
    msgType === 'image' ||
    type === 'image' ||
    mime.startsWith('image/') ||
    hasImageExt ||
    (isCdn && !hasVideoExt && !hasAudioExt && msgType !== 'video' && msgType !== 'audio');

  const isExplicitVideo =
    msgType === 'video' ||
    type === 'video' ||
    mime.startsWith('video/') ||
    hasVideoExt;

  const isExplicitAudio =
    msgType === 'audio' ||
    type === 'audio' ||
    mime.startsWith('audio/') ||
    hasAudioExt ||
    rawLower.includes('voice_');

  // isShare is strictly for verified social links, never for explicit media
  const isShare =
    !isExplicitImage &&
    !isExplicitVideo &&
    !isExplicitAudio &&
    (isSocial ||
      (Boolean(extractedShareFromText) && isSocialWebLink(extractedShareFromText)) ||
      msgType === 'share_reel' ||
      msgType === 'share_post' ||
      msgType === 'share');

  let shareType: 'reel' | 'post' | 'story' | null = null;
  if (isShare) {
    if (msgType === 'share_reel' || rawLower.includes('/reel')) {
      shareType = 'reel';
    } else if (rawLower.includes('/stories/')) {
      shareType = 'story';
    } else {
      shareType = 'post';
    }
  }

  // Proxied URL for binary assets only, NEVER proxy social web links
  const finalUrl = isShare ? rawUrl : getProxiedMediaUrl(rawUrl);
  const lower = finalUrl.toLowerCase();

  const isAudio =
    !isShare &&
    !isSocial &&
    (isExplicitAudio ||
      msgType === 'audio' ||
      type === 'audio' ||
      mime.startsWith('audio/') ||
      lower.includes('voice_') ||
      lower.includes('voice') ||
      lower.includes('audio') ||
      /\.(ogg|m4a|mp3|wav|aac|opus)/i.test(lower) ||
      (lower.includes('.webm') &&
        (lower.includes('voice') || mime.startsWith('audio/') || msgType === 'audio')));

  const isVideo =
    !isShare &&
    !isSocial &&
    !isAudio &&
    (isExplicitVideo ||
      msgType === 'video' ||
      type === 'video' ||
      mime.startsWith('video/') ||
      lower.includes('vid_') ||
      /\.(mp4|mov|avi|mkv|ogv)/i.test(lower) ||
      (lower.includes('.webm') && !lower.includes('voice')));

  const isImage =
    !isShare &&
    !isSocial &&
    !isAudio &&
    !isVideo &&
    (isExplicitImage ||
      msgType === 'image' ||
      type === 'image' ||
      mime.startsWith('image/') ||
      lower.includes('image-') ||
      lower.includes('img_') ||
      lower.includes('img-') ||
      /\.(jpg|jpeg|png|webp|gif|svg)/i.test(lower) ||
      ((lower.includes('fbsbx.com') ||
        lower.includes('fbcdn.net') ||
        lower.includes('cdninstagram.com')) &&
        !/\.(ogg|m4a|mp3|webm|wav|aac|mp4|mov)/i.test(lower)));

  const isDoc = !isImage && !isAudio && !isVideo && !isShare;

  return {
    isAudio,
    isImage,
    isVideo,
    isDoc,
    isShare,
    shareUrl: isShare ? rawUrl : null,
    shareType,
    url: finalUrl,
    fileName: fileName || finalUrl.split('?')[0].split('/').pop() || (isShare ? 'share' : 'file'),
  };
};
