import { Brand } from '../types/crm';
import aerobicsImg from '../imports/images/aerobics.jpeg';
import finestImg from '../imports/images/finest.jpeg';
import flareImg from '../imports/images/flare.jpeg';
import hayatImg from '../imports/images/hayat.jpeg';
import lavaImg from '../imports/images/lava.jpeg';
import lioraImg from '../imports/images/liora.jpeg';
import lotusblueImg from '../imports/images/lotusblue.jpeg';
import loxxkingImg from '../imports/images/loxxking.png';
import noraImg from '../imports/images/nora.jpeg';

export const BRAND_IMAGES: Record<string, string> = {
  'lavva': lavaImg,
  'lava': lavaImg,
  'luxira': lioraImg,
  'liora': lioraImg,
  'lotus blue': lotusblueImg,
  'lotusblue': lotusblueImg,
  'lotus': lotusblueImg,
  'flare': flareImg,
  'loxx king': loxxkingImg,
  'loxxking': loxxkingImg,
  'loxx': loxxkingImg,
  'hayat': hayatImg,
  'beauty center': hayatImg,
  'nora': noraImg,
  'moon light': noraImg,
  'moonlight': noraImg,
  'finest': finestImg,
  'aerobics': aerobicsImg,
};

export const MOCK_BRANDS: Brand[] = [
  { id: 'all', name: 'كل الماركات', avatar: 'ALL', color: 'from-slate-700 to-slate-800', page_id: '' },
  { id: 'LAVVA', name: 'LAVVA', avatar: 'LV', logo_url: lavaImg, color: 'from-teal-600 to-teal-700', page_id: '1302055352987458' },
  { id: 'LUXIRA', name: 'LUXIRA', avatar: 'LX', logo_url: lioraImg, color: 'from-[#1A73E8] to-blue-600', page_id: '1302055352987459' },
  { id: 'LOTUS BLUE', name: 'LOTUS BLUE', avatar: 'LB', logo_url: lotusblueImg, color: 'from-cyan-600 to-cyan-700', page_id: '100099887766555' },
  { id: 'FLARE', name: 'FLARE', avatar: 'FL', logo_url: flareImg, color: 'from-orange-600 to-orange-700', page_id: '100099887766558' },
  { id: 'LOXX KING', name: 'LOXX KING', avatar: 'LK', logo_url: loxxkingImg, color: 'from-amber-600 to-amber-700', page_id: '100099887766557' },
  { id: 'MOON LIGHT', name: 'MOON LIGHT', avatar: 'ML', logo_url: noraImg, color: 'from-indigo-600 to-indigo-700', page_id: '100099887766554' },
  { id: 'BEAUTY CENTER', name: 'BEAUTY CENTER', avatar: 'BC', logo_url: hayatImg, color: 'from-rose-600 to-rose-700', page_id: '100099887766556' },
  { id: 'HAYAT', name: 'HAYAT', avatar: 'HY', logo_url: hayatImg, color: 'from-emerald-600 to-emerald-700', page_id: '100099887766559' },
  { id: 'NORA', name: 'NORA', avatar: 'NR', logo_url: noraImg, color: 'from-purple-600 to-purple-700', page_id: '100099887766560' },
  { id: 'LIORA', name: 'LIORA', avatar: 'LR', logo_url: lioraImg, color: 'from-pink-600 to-pink-700', page_id: '100099887766561' },
  { id: 'FINEST', name: 'FINEST', avatar: 'FN', logo_url: finestImg, color: 'from-amber-700 to-amber-800', page_id: '100099887766562' },
  { id: 'AEROBICS', name: 'AEROBICS', avatar: 'AR', logo_url: aerobicsImg, color: 'from-sky-600 to-sky-700', page_id: '100099887766563' },
];
