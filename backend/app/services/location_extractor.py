"""
Real-Time Message Location Extraction Engine.
Extracts country/city entities from chat messages and conversation transcripts.
"""

import re
from typing import Optional

KNOWN_LOCATIONS = {
    "الصين": "الصين",
    "مصر": "مصر",
    "السعودية": "السعودية",
    "المملكة العربية السعودية": "السعودية",
    "الإمارات": "الإمارات",
    "امارات": "الإمارات",
    "دبي": "الإمارات",
    "أبوظبي": "الإمارات",
    "الشارقة": "الإمارات",
    "الكويت": "الكويت",
    "قطر": "قطر",
    "عمان": "عمان",
    "سلطنة عمان": "عمان",
    "البحرين": "البحرين",
    "الأردن": "الأردن",
    "العراق": "العراق",
    "لبنان": "لبنان",
    "تركيا": "تركيا",
    "إسطنبول": "تركيا",
    "اسطنبول": "تركيا",
    "المغرب": "المغرب",
    "الجزائر": "الجزائر",
    "تونس": "تونس",
    "ليبيا": "ليبيا",
    "السودان": "السودان",
    "أمريكا": "أمريكا",
    "امريكا": "أمريكا",
    "ألمانيا": "ألمانيا",
    "المانيا": "ألمانيا",
    "فرنسا": "فرنسا",
    "إنجلترا": "إنجلترا",
    "انجلترا": "إنجلترا",
    "بريطانيا": "إنجلترا",
    "القاهرة": "مصر",
    "الإسكندرية": "مصر",
    "الرياض": "السعودية",
    "جدة": "السعودية",
    "مكة": "السعودية",
    "المدينة": "السعودية",
    "الدمام": "السعودية",
}

# Regex patterns for Arabic conversational phrases
PATTERNS = [
    r"فرع\s+([\w\s]+)",
    r"من\s+([\w\s]+)",
    r"في\s+([\w\s]+)",
    r"دولة\s+([\w\s]+)",
    r"بلد\s+([\w\s]+)",
]


def extract_location_from_text(text: Optional[str]) -> Optional[str]:
    """
    Extracts a normalized country/location name from message text.
    Returns normalized country string or None if no location is found.
    """
    if not text or not text.strip():
        return None

    cleaned = text.strip()

    # 1. Direct dictionary match against known locations
    for loc_key, canonical_name in KNOWN_LOCATIONS.items():
        if loc_key in cleaned:
            return canonical_name

    # 2. Regex phrase extraction
    for pattern in PATTERNS:
        match = re.search(pattern, cleaned)
        if match:
            captured = match.group(1).strip()
            for loc_key, canonical_name in KNOWN_LOCATIONS.items():
                if loc_key in captured:
                    return canonical_name

    return None
