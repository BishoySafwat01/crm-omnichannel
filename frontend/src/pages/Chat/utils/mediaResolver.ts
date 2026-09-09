import { API_BASE } from '../../../services/api';

export interface ResolvedMedia {
  isAudio: boolean;
  isImage: boolean;
  isVideo: boolean;
  isDoc: boolean;
  url: string | null;
  fileName: string;
}

export const getProxiedMediaUrl = (url: string | null | undefined): string => {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
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

export const isSocialWebLink = (url: string | undefined | null): boolean => {
  if (!url) return false;
  return (
    url.includes('instagram.com/reel/') ||
    url.includes('instagram.com/p/') ||
    url.includes('instagram.com/stories/') ||
    url.includes('facebook.com/watch') ||
    url.includes('facebook.com/story')
  );
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
      att.image_data?.url ||
      att.image_data?.preview_url ||
      att.file_url;
    mime = att.mime_type || '';
    type = att.type || (att.image_data ? 'image' : '');
    fileName = att.filename || att.name || att.title || '';
  }

  const textVal = (msg.text || '').trim();
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

  if (!url) {
    return {
      isAudio: false,
      isImage: false,
      isVideo: false,
      isDoc: false,
      url: null,
      fileName: '',
    };
  }

  url = getProxiedMediaUrl(url);

  const lower = url.toLowerCase();
  const isSocial = isSocialWebLink(url);
  const msgType = (msg.message_type || type || '').toLowerCase();

  const isAudio =
    !isSocial &&
    (msgType === 'audio' ||
      type === 'audio' ||
      mime.startsWith('audio/') ||
      lower.includes('voice_') ||
      lower.includes('voice') ||
      lower.includes('audio') ||
      /\.(ogg|m4a|mp3|wav|aac|opus)/i.test(lower) ||
      (lower.includes('.webm') &&
        (lower.includes('voice') || mime.startsWith('audio/') || msgType === 'audio')));

  const isVideo =
    !isSocial &&
    !isAudio &&
    (msgType === 'video' ||
      type === 'video' ||
      mime.startsWith('video/') ||
      lower.includes('vid_') ||
      /\.(mp4|mov|avi|mkv|ogv)/i.test(lower) ||
      (lower.includes('.webm') && !lower.includes('voice')));

  const isImage =
    !isSocial &&
    !isAudio &&
    !isVideo &&
    (msgType === 'image' ||
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

  const isShare =
    isSocial ||
    msg.message_type === 'share_reel' ||
    msg.message_type === 'share_post' ||
    msg.message_type === 'share' ||
    lower.includes('instagram.com');

  const isDoc = !isImage && !isAudio && !isVideo && !isShare;

  return {
    isAudio,
    isImage,
    isVideo,
    isDoc,
    url,
    fileName: fileName || url.split('/').pop() || 'file',
  };
};
