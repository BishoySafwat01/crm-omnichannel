import re
from typing import Optional, Dict

COUNTRY_FLAG_MAP: Dict[str, str] = {
    "🇮🇶": "العراق 🇮🇶",
    "🇪🇬": "مصر 🇪🇬",
    "🇸🇦": "السعودية 🇸🇦",
    "🇦🇪": "الإمارات 🇦🇪",
    "🇹🇷": "تركيا 🇹🇷",
    "🇰🇼": "الكويت 🇰🇼",
    "🇶🇦": "قطر 🇶🇦",
    "🇧🇭": "البحرين 🇧🇭",
    "🇴🇲": "عُمان 🇴🇲",
    "🇯🇴": "الأردن 🇯🇴",
    "🇱🇧": "لبنان 🇱🇧",
    "🇸🇾": "سوريا 🇸🇾",
    "🇵🇸": "فلسطين 🇵🇸",
    "🇾🇪": "اليمن 🇾🇪",
    "🇱🇾": "ليبيا 🇱🇾",
    "🇸🇩": "السودان 🇸🇩",
    "🇩🇿": "الجزائر 🇩🇿",
    "🇲🇦": "المغرب 🇲🇦",
    "🇹🇳": "تونس 🇹🇳",
}

KEYWORD_COUNTRY_MAP: Dict[str, str] = {
    # Egypt
    "مصر": "مصر 🇪🇬",
    "مصري": "مصر 🇪🇬",
    "مصرية": "مصر 🇪🇬",
    "القاهرة": "مصر 🇪🇬",
    "القاهره": "مصر 🇪🇬",
    "اسكندرية": "مصر 🇪🇬",
    "إسكندرية": "مصر 🇪🇬",
    "اسكندريه": "مصر 🇪🇬",
    "إسكندريه": "مصر 🇪🇬",
    # Iraq
    "العراق": "العراق 🇮🇶",
    "عراق": "العراق 🇮🇶",
    "عراقي": "العراق 🇮🇶",
    "عراقية": "العراق 🇮🇶",
    "بغداد": "العراق 🇮🇶",
    "البصرة": "العراق 🇮🇶",
    "البصره": "العراق 🇮🇶",
    "اربيل": "العراق 🇮🇶",
    "أربيل": "العراق 🇮🇶",
    # Saudi Arabia
    "السعودية": "السعودية 🇸🇦",
    "السعوديه": "السعودية 🇸🇦",
    "سعودية": "السعودية 🇸🇦",
    "سعوديه": "السعودية 🇸🇦",
    "سعودي": "السعودية 🇸🇦",
    "الرياض": "السعودية 🇸🇦",
    "رياض": "السعودية 🇸🇦",
    "جدة": "السعودية 🇸🇦",
    "جده": "السعودية 🇸🇦",
    # UAE
    "الإمارات": "الإمارات 🇦🇪",
    "الامارات": "الإمارات 🇦🇪",
    "امارات": "الإمارات 🇦🇪",
    "إماراتي": "الإمارات 🇦🇪",
    "اماراتي": "الإمارات 🇦🇪",
    "دبي": "الإمارات 🇦🇪",
    "ابوظبي": "الإمارات 🇦🇪",
    # Kuwait
    "الكويت": "الكويت 🇰🇼",
    "كويت": "الكويت 🇰🇼",
    "كويتي": "الكويت 🇰🇼",
    # Qatar
    "قطر": "قطر 🇶🇦",
    "قطري": "قطر 🇶🇦",
    # Bahrain
    "البحرين": "البحرين 🇧🇭",
    "بحريني": "البحرين 🇧🇭",
    # Oman
    "عمان": "عُمان 🇴🇲",
    "عُمان": "عُمان 🇴🇲",
    "عماني": "عُمان 🇴🇲",
    # Jordan
    "الأردن": "الأردن 🇯🇴",
    "الاردن": "الأردن 🇯🇴",
    "اردن": "الأردن 🇯🇴",
    "اردني": "الأردن 🇯🇴",
    # Turkey
    "تركيا": "تركيا 🇹🇷",
    "تركي": "تركيا 🇹🇷",
    "تركية": "تركيا 🇹🇷",
}

FLAG_REGEX = re.compile(r"[\U0001F1E6-\U0001F1FF]{2}")


class CountryDetector:
    @classmethod
    def normalize_arabic(cls, text: str) -> str:
        if not text:
            return ""
        # Normalize Alef variations
        text = re.sub(r"[إأآا]", "ا", text)
        # Normalize Teh Marbuta
        text = re.sub(r"ة", "ه", text)
        # Normalize Yaa
        text = re.sub(r"ى", "ي", text)
        return text.strip()

    @classmethod
    def extract_country(cls, text: Optional[str]) -> Optional[str]:
        if not text or not text.strip():
            return None

        # 1. Inspect Unicode Flag Emojis (Highest Precision)
        flags = FLAG_REGEX.findall(text)
        if flags:
            last_flag = flags[-1]
            return COUNTRY_FLAG_MAP.get(last_flag, f"دولة {last_flag}")

        # 2. Inspect Demonyms & Keywords (with normalization & prefix fallback)
        words = re.findall(r"[\w\u0600-\u06FF]+", text)
        for word in words:
            if word in KEYWORD_COUNTRY_MAP:
                return KEYWORD_COUNTRY_MAP[word]

            clean_word = re.sub(r"^(?:لل|بال|فال|كال|ب|ل|ف)", "", word)
            if clean_word in KEYWORD_COUNTRY_MAP:
                return KEYWORD_COUNTRY_MAP[clean_word]

            norm_word = cls.normalize_arabic(word)
            norm_clean = cls.normalize_arabic(clean_word)
            for k, v in KEYWORD_COUNTRY_MAP.items():
                norm_k = cls.normalize_arabic(k)
                if norm_k == norm_word or norm_k == norm_clean:
                    return v

        return None

    @classmethod
    def resolve_location(cls, text: Optional[str]) -> str:
        detected = cls.extract_country(text)
        return detected if detected else "غير ذلك"
