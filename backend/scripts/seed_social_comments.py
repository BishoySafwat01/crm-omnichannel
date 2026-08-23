import asyncio
import os
import sys
import uuid
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import select, func
from app.core.database import AsyncSessionLocal
from app.models.social_comment import SocialComment, CommentModerationLog, CommentModerationSetting

async def seed_social_comments():
    print("🌱 Seeding Social Comments into PostgreSQL...")
    async with AsyncSessionLocal() as session:
        count = (await session.execute(select(func.count(SocialComment.id)))).scalar() or 0
        if count > 0:
            print(f"Database already contains {count} comments. Seed skipped.")
            return

        now = datetime.now(timezone.utc)

        COMMENTS = [
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111101"),
                "brand": "LUXIRA",
                "platform": "facebook",
                "post_id": "post-1",
                "post_title": "عرض الصيف الحصري: خصم 40% على جميع الفساتين والأزياء 👗✨",
                "author_name": "محمود عبد الرحمن",
                "comment_text": "المنتج دا خامته سيئة جداً ومقلب كبير ومحدش يشتري منهم خالص نصابين!",
                "sentiment": "negative",
                "sentiment_score": 98,
                "moderation_status": "auto_deleted",
                "ai_action_reason": "تم الحذف تلقائياً بواسطة AI: رصد ألفاظ سلبية واتهام بالنصب (نصابين، مقلب، سيئة جداً)",
                "likes_count": 0,
                "replies_count": 0,
                "is_direct_message_sent": True,
                "delta_min": 2,
            },
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111102"),
                "brand": "LUXIRA",
                "platform": "instagram",
                "post_id": "post-2",
                "post_title": "تشكيلة العطور الملكية الفاخرة لعام 2026 👑🌿",
                "author_name": "نورهان سمير",
                "comment_text": "بكام العطر ده وفيه شحن لمحافظة الإسكندرية ولا لأ؟",
                "sentiment": "neutral_inquiry",
                "sentiment_score": 95,
                "moderation_status": "replied",
                "ai_action_reason": "تم الرد التلقائي بواسطة AI: استفسار عن الأسعار والتوصيل",
                "auto_replied_text": "أهلاً بكِ أستاذة نورهان! تم إرسال تفاصيل الأسعار والعروض الحالية في رسالة خاصة عبر الدايركت 💌",
                "likes_count": 2,
                "replies_count": 1,
                "is_direct_message_sent": True,
                "delta_min": 5,
            },
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111103"),
                "brand": "LAVVA",
                "platform": "facebook",
                "post_id": "post-3",
                "post_title": "مجموعة العناية بالشعر والترطيب العميق 🧴✨",
                "author_name": "سارة أحمد",
                "comment_text": "ما شاء الله المنتجات تحفة جداً والتوصيل وصل في أقل من 24 ساعة، شكراً ليكم بجد ❤️",
                "sentiment": "positive",
                "sentiment_score": 99,
                "moderation_status": "active",
                "ai_action_reason": None,
                "likes_count": 8,
                "replies_count": 0,
                "is_direct_message_sent": False,
                "delta_min": 15,
            },
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111104"),
                "brand": "LAVVA",
                "platform": "instagram",
                "post_id": "post-1",
                "post_title": "عرض الصيف الحصري: خصم 40% على جميع الفساتين والأزياء 👗✨",
                "author_name": "كريم ممدوح",
                "comment_text": "فرصة ربح 1000 دولار مجاناً ادخل اللينك ده بسرعة وسجل بياناتك: bit.ly/spam-link",
                "sentiment": "spam",
                "sentiment_score": 100,
                "moderation_status": "auto_hidden",
                "ai_action_reason": "تم الإخفاء تلقائياً بواسطة AI: رصد روابط مشبوهة وكلمات سبام واحتيال",
                "likes_count": 0,
                "replies_count": 0,
                "is_direct_message_sent": False,
                "delta_min": 25,
            },
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111105"),
                "brand": "LUXIRA",
                "platform": "facebook",
                "post_id": "post-2",
                "post_title": "تشكيلة العطور الملكية الفاخرة لعام 2026 👑🌿",
                "author_name": "مريم الشريف",
                "comment_text": "ممكن كود الخصم اللي اتكلمتوا عنه في الفيديو؟",
                "sentiment": "neutral_inquiry",
                "sentiment_score": 92,
                "moderation_status": "replied",
                "ai_action_reason": "تم الرد التلقائي بواسطة AI: استفسار عن أكواد الخصم",
                "auto_replied_text": "أهلاً مريم! كود الخصم الخاص بك هو LUX10 يعطيك 10% خصم إضافي عند الدفع 🎁",
                "likes_count": 3,
                "replies_count": 1,
                "is_direct_message_sent": True,
                "delta_min": 40,
            },
            {
                "id": uuid.UUID("11111111-1111-1111-1111-111111111106"),
                "brand": "LUXIRA",
                "platform": "instagram",
                "post_id": "post-3",
                "post_title": "مجموعة العناية بالشعر والترطيب العميق 🧴✨",
                "author_name": "طارق يحيى",
                "comment_text": "التغليف كان مقطوع والأوردر ناقص عبوة، مستني حد يرد عليا من الصبح!",
                "sentiment": "negative",
                "sentiment_score": 94,
                "moderation_status": "flagged",
                "ai_action_reason": "تم التمييز بواسطة AI: شكوى متعلقة بالشحن ونقص الطلب تستوجب تدخل المشرف",
                "likes_count": 1,
                "replies_count": 0,
                "is_direct_message_sent": True,
                "delta_min": 60,
            },
        ]

        for c_data in COMMENTS:
            created_at = now - timedelta(minutes=c_data["delta_min"])
            comm = SocialComment(
                id=c_data["id"],
                brand=c_data["brand"],
                platform=c_data["platform"],
                post_id=c_data["post_id"],
                post_title=c_data["post_title"],
                author_name=c_data["author_name"],
                comment_text=c_data["comment_text"],
                sentiment=c_data["sentiment"],
                sentiment_score=c_data["sentiment_score"],
                moderation_status=c_data["moderation_status"],
                ai_action_reason=c_data["ai_action_reason"],
                auto_replied_text=c_data.get("auto_replied_text"),
                likes_count=c_data["likes_count"],
                replies_count=c_data["replies_count"],
                is_direct_message_sent=c_data["is_direct_message_sent"],
                created_at=created_at,
            )
            session.add(comm)

        # Seed global settings
        sett = CommentModerationSetting(
            id=uuid.uuid4(),
            brand="all",
            auto_delete_negative=True,
            auto_hide_spam=True,
            auto_reply_inquiries=True,
            strictness_level="strict",
            action_for_negative="delete_and_dm",
            negative_keywords=["نصابين", "مقلب", "حرامية", "سيئة جداً", "زفت", "وحشة", "غشاشين", "سرقة", "رديء", "تقليد"],
            inquiry_keywords=["بكام", "السعر", "سعر", "شحن", "توصيل", "الاقيه فين", "متوفر", "كود خصم", "تفاصيل"],
            inquiry_reply_text="أهلاً بك! تم إرسال كافة التفاصيل والأسعار والعروض في رسالة خاصة عبر الدايركت 💌",
            inquiry_dm_text="أهلاً بك! سعداء باهتمامك بمنتجاتنا ✨ إليك قائمة الأسعار وخصم 10% إضافي عند الطلب اليوم: https://luxira.com",
            negative_dm_apology_text="أهلاً بك، نعتذر بشدة عن أي تجربة غير مرضية. يرجى تزويدنا برقم الهاتف أو الطلب وسيتواصل معك مدير خدمة العملاء فوراً لحل المشكلة وتعويضك 🤝",
        )
        session.add(sett)

        await session.commit()
        print("🎉 Successfully seeded 6 social comments and moderation settings in PostgreSQL!")

if __name__ == "__main__":
    asyncio.run(seed_social_comments())
