import math
import uuid
from typing import Any, List, Optional
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.social_comment import (
    CommentModerationLog,
    CommentModerationSetting,
    SocialComment,
)
from app.schemas.social_comment import (
    AiSimulationResponse,
    CommentStatsResponse,
    ModerationSettingsPayload,
)


class CommentModerationService:
    @staticmethod
    async def get_or_create_settings(
        session: AsyncSession, brand: str = "all"
    ) -> CommentModerationSetting:
        stmt = select(CommentModerationSetting).where(CommentModerationSetting.brand == brand)
        res = await session.execute(stmt)
        settings = res.scalar_one_or_none()

        if not settings:
            default_neg = ["نصابين", "مقلب", "حرامية", "سيئة جداً", "زفت", "وحشة", "غشاشين", "سرقة", "رديء", "تقليد"]
            default_inq = ["بكام", "السعر", "سعر", "شحن", "توصيل", "الاقيه فين", "متوفر", "كود خصم", "تفاصيل"]
            settings = CommentModerationSetting(
                id=uuid.uuid4(),
                brand=brand,
                auto_delete_negative=True,
                auto_hide_spam=True,
                auto_reply_inquiries=True,
                strictness_level="strict",
                action_for_negative="delete_and_dm",
                negative_keywords=default_neg,
                inquiry_keywords=default_inq,
                inquiry_reply_text="أهلاً بك! تم إرسال كافة التفاصيل والأسعار والعروض في رسالة خاصة عبر الدايركت 💌",
                inquiry_dm_text="أهلاً بك! سعداء باهتمامك بمنتجاتنا ✨ إليك قائمة الأسعار وخصم 10% إضافي عند الطلب اليوم: https://luxira.com",
                negative_dm_apology_text="أهلاً بك، نعتذر بشدة عن أي تجربة غير مرضية. يرجى تزويدنا برقم الهاتف أو الطلب وسيتواصل معك مدير خدمة العملاء فوراً لحل المشكلة وتعويضك 🤝",
            )
            session.add(settings)
            await session.commit()
            await session.refresh(settings)

        return settings

    @staticmethod
    async def update_settings(
        session: AsyncSession, brand: str, payload: ModerationSettingsPayload
    ) -> CommentModerationSetting:
        settings = await CommentModerationService.get_or_create_settings(session, brand)

        settings.auto_delete_negative = payload.auto_delete_negative
        settings.auto_hide_spam = payload.auto_hide_spam
        settings.auto_reply_inquiries = payload.auto_reply_inquiries
        settings.strictness_level = payload.strictness_level
        settings.action_for_negative = payload.action_for_negative
        settings.negative_keywords = payload.negative_keywords
        settings.inquiry_keywords = payload.inquiry_keywords
        settings.inquiry_reply_text = payload.inquiry_reply_text
        settings.inquiry_dm_text = payload.inquiry_dm_text
        settings.negative_dm_apology_text = payload.negative_dm_apology_text

        session.add(settings)
        await session.commit()
        await session.refresh(settings)
        return settings

    @staticmethod
    async def list_comments(
        session: AsyncSession,
        brand: Optional[str] = None,
        platform: Optional[str] = None,
        sentiment: Optional[str] = None,
        status: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> tuple[List[SocialComment], int, int]:
        stmt = select(SocialComment)
        count_stmt = select(func.count(SocialComment.id))
        conditions = []

        if brand and brand.strip() and brand.strip().lower() not in ("all", "الكل"):
            conditions.append(SocialComment.brand.ilike(brand.strip()))

        if platform and platform.strip() and platform.strip().lower() not in ("all", "الكل"):
            conditions.append(SocialComment.platform == platform.strip().lower())

        if sentiment and sentiment.strip() and sentiment.strip().lower() not in ("all", "الكل"):
            conditions.append(SocialComment.sentiment == sentiment.strip())

        if status and status.strip() and status.strip().lower() not in ("all", "الكل"):
            conditions.append(SocialComment.moderation_status == status.strip())

        if search and search.strip():
            term = f"%{search.strip()}%"
            conditions.append(
                or_(
                    SocialComment.comment_text.ilike(term),
                    SocialComment.author_name.ilike(term),
                    SocialComment.post_title.ilike(term),
                )
            )

        for cond in conditions:
            stmt = stmt.where(cond)
            count_stmt = count_stmt.where(cond)

        total_res = await session.execute(count_stmt)
        total = total_res.scalar() or 0
        total_pages = math.ceil(total / max(page_size, 1)) if total > 0 else 1

        stmt = (
            stmt.order_by(SocialComment.created_at.desc(), SocialComment.id.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        comments = list(res.scalars().all())
        return comments, total, total_pages

    @staticmethod
    async def get_stats(session: AsyncSession) -> CommentStatsResponse:
        total = (await session.execute(select(func.count(SocialComment.id)))).scalar() or 0

        del_stmt = select(func.count(SocialComment.id)).where(
            SocialComment.moderation_status.in_(["auto_deleted", "auto_hidden", "flagged"])
        )
        deleted_count = (await session.execute(del_stmt)).scalar() or 0

        dm_stmt = select(func.count(SocialComment.id)).where(SocialComment.is_direct_message_sent == True)
        dm_count = (await session.execute(dm_stmt)).scalar() or 0

        pos_stmt = select(func.count(SocialComment.id)).where(
            SocialComment.sentiment.in_(["positive", "neutral_inquiry"])
        )
        pos_count = (await session.execute(pos_stmt)).scalar() or 0

        positive_rate = int((pos_count / total) * 100) if total > 0 else 50

        # Check global settings
        sett = await CommentModerationService.get_or_create_settings(session, "all")

        return CommentStatsResponse(
            total_comments=total,
            auto_deleted_or_hidden=deleted_count,
            auto_replied_dms=dm_count,
            positive_rate=positive_rate,
            active_auto_delete_enabled=sett.auto_delete_negative,
        )

    @staticmethod
    async def update_comment_status(
        session: AsyncSession,
        comment_id: uuid.UUID,
        new_status: str,
        reason: Optional[str] = None,
        performed_by: str = "ADMIN",
    ) -> SocialComment:
        comment = await session.get(SocialComment, comment_id)
        if not comment:
            raise ValueError("التعليق غير موجود")

        old_status = comment.moderation_status
        comment.moderation_status = new_status
        if reason:
            comment.ai_action_reason = reason

        # Log action
        action_map = {
            "active": "RESTORE",
            "auto_deleted": "DELETE",
            "auto_hidden": "HIDE",
            "replied": "REPLY",
            "flagged": "FLAG",
        }
        action_type = action_map.get(new_status, "UPDATE_STATUS")

        log = CommentModerationLog(
            id=uuid.uuid4(),
            comment_id=comment.id,
            comment_author=comment.author_name,
            action_type=action_type,
            performed_by=performed_by,
            details={"old_status": old_status, "new_status": new_status, "reason": reason},
        )
        session.add(log)
        session.add(comment)
        await session.commit()
        await session.refresh(comment)
        return comment

    @staticmethod
    async def reply_to_comment(
        session: AsyncSession,
        comment_id: uuid.UUID,
        reply_text: str,
        send_dm: bool = False,
        dm_text: Optional[str] = None,
        performed_by: str = "ADMIN",
    ) -> SocialComment:
        comment = await session.get(SocialComment, comment_id)
        if not comment:
            raise ValueError("التعليق غير موجود")

        comment.moderation_status = "replied"
        comment.auto_replied_text = reply_text
        if send_dm:
            comment.is_direct_message_sent = True

        log = CommentModerationLog(
            id=uuid.uuid4(),
            comment_id=comment.id,
            comment_author=comment.author_name,
            action_type="REPLY_AND_DM" if send_dm else "REPLY",
            performed_by=performed_by,
            details={"reply_text": reply_text, "send_dm": send_dm, "dm_text": dm_text},
        )
        session.add(log)
        session.add(comment)
        await session.commit()
        await session.refresh(comment)
        return comment

    @staticmethod
    async def list_logs(
        session: AsyncSession, page: int = 1, page_size: int = 50
    ) -> tuple[List[CommentModerationLog], int]:
        count_stmt = select(func.count(CommentModerationLog.id))
        total = (await session.execute(count_stmt)).scalar() or 0

        stmt = (
            select(CommentModerationLog)
            .order_by(CommentModerationLog.created_at.desc())
            .offset((page - 1) * page_size)
            .limit(page_size)
        )
        res = await session.execute(stmt)
        return list(res.scalars().all()), total

    @staticmethod
    async def process_and_moderate_comment(
        session: AsyncSession,
        comment: SocialComment,
        brand: str = "all",
    ) -> SocialComment:
        import httpx
        from app.core.config import settings
        import logging

        logger = logging.getLogger("CommentModerationService")
        sett = await CommentModerationService.get_or_create_settings(session, brand)
        text_lower = (comment.comment_text or "").lower().strip()

        matched_neg = [k for k in (sett.negative_keywords or []) if k.lower() in text_lower]
        matched_inq = [k for k in (sett.inquiry_keywords or []) if k.lower() in text_lower]

        # 1. Negative / Toxic Detection
        if matched_neg:
            comment.sentiment = "negative"
            comment.sentiment_score = min(99, 80 + len(matched_neg) * 10)

            if sett.auto_delete_negative:
                if sett.action_for_negative in ("delete", "delete_and_dm"):
                    comment.moderation_status = "auto_deleted"
                else:
                    comment.moderation_status = "auto_hidden"

                comment.ai_action_reason = f"تم الحذف/الإخفاء التلقائي لرصد ألفاظ مسيئة: ({', '.join(matched_neg)})"

                # Trigger Live Meta Graph API Delete / Hide if token is available
                if settings.META_PAGE_ACCESS_TOKEN and comment.post_id:
                    try:
                        async with httpx.AsyncClient(timeout=10.0) as client:
                            if comment.moderation_status == "auto_deleted":
                                await client.delete(
                                    f"https://graph.facebook.com/v23.0/{comment.post_id}",
                                    params={"access_token": settings.META_PAGE_ACCESS_TOKEN},
                                )
                            else:
                                await client.post(
                                    f"https://graph.facebook.com/v23.0/{comment.post_id}",
                                    params={"is_hidden": "true", "access_token": settings.META_PAGE_ACCESS_TOKEN},
                                )
                    except Exception as e:
                        logger.warning("Meta Graph API comment moderation call failed: %s", e)

                if sett.action_for_negative == "delete_and_dm" and sett.negative_dm_apology_text:
                    comment.is_direct_message_sent = True

                log = CommentModerationLog(
                    id=uuid.uuid4(),
                    comment_id=comment.id,
                    comment_author=comment.author_name,
                    action_type="AUTO_DELETE" if comment.moderation_status == "auto_deleted" else "AUTO_HIDE",
                    performed_by="AI_AUTO_MODERATION",
                    details={"matched_keywords": matched_neg, "status": comment.moderation_status},
                )
                session.add(log)

        # 2. Inquiry / Price detection
        elif matched_inq and sett.auto_reply_inquiries:
            comment.sentiment = "neutral_inquiry"
            comment.sentiment_score = 90
            comment.moderation_status = "replied"
            comment.auto_replied_text = sett.inquiry_reply_text
            comment.is_direct_message_sent = bool(sett.inquiry_dm_text)
            comment.ai_action_reason = f"تم الرد التلقائي وإرسال التفاصيل في الخاص لرصد استفسارات: ({', '.join(matched_inq)})"

            # Trigger Live Meta Graph API Public Reply if token is available
            if settings.META_PAGE_ACCESS_TOKEN and comment.post_id and sett.inquiry_reply_text:
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            f"https://graph.facebook.com/v23.0/{comment.post_id}/comments",
                            params={
                                "message": sett.inquiry_reply_text,
                                "access_token": settings.META_PAGE_ACCESS_TOKEN,
                            },
                        )
                except Exception as e:
                    logger.warning("Meta Graph API auto-reply call failed: %s", e)

            log = CommentModerationLog(
                id=uuid.uuid4(),
                comment_id=comment.id,
                comment_author=comment.author_name,
                action_type="AUTO_REPLY_AND_DM",
                performed_by="AI_AUTO_MODERATION",
                details={"matched_keywords": matched_inq, "reply": sett.inquiry_reply_text},
            )
            session.add(log)

        else:
            comment.sentiment = "positive"
            comment.sentiment_score = 30
            comment.moderation_status = "active"

        session.add(comment)
        return comment

    @staticmethod
    async def simulate_ai(
        session: AsyncSession, comment_text: str, brand: str = "all"
    ) -> AiSimulationResponse:
        sett = await CommentModerationService.get_or_create_settings(session, brand)
        text_lower = comment_text.lower().strip()

        matched_neg = [k for k in (sett.negative_keywords or []) if k.lower() in text_lower]
        matched_inq = [k for k in (sett.inquiry_keywords or []) if k.lower() in text_lower]

        if matched_neg:
            sentiment = "negative"
            sentiment_score = min(99, 80 + len(matched_neg) * 10)
            matched_action = "حذف التعليق تلقائياً وإرسال اعتذار بالخاص" if sett.action_for_negative == "delete_and_dm" else "حذف التعليق تلقائياً"
            reason = f"تم رصد ألفاظ سلبية/هجومية: ({', '.join(matched_neg)})"
            return AiSimulationResponse(
                sentiment=sentiment,
                sentiment_score=sentiment_score,
                matched_action=matched_action,
                matched_keywords=matched_neg,
                generated_reply=None,
                generated_dm=sett.negative_dm_apology_text if sett.action_for_negative == "delete_and_dm" else None,
                decision_reason=reason,
            )

        if matched_inq:
            sentiment = "neutral_inquiry"
            sentiment_score = 90
            matched_action = "رد تلقائي فوري وإرسال التفاصيل بالخاص"
            reason = f"تم رصد كلمات استفسار وطلب أسعار: ({', '.join(matched_inq)})"
            return AiSimulationResponse(
                sentiment=sentiment,
                sentiment_score=sentiment_score,
                matched_action=matched_action,
                matched_keywords=matched_inq,
                generated_reply=sett.inquiry_reply_text,
                generated_dm=sett.inquiry_dm_text,
                decision_reason=reason,
            )

        return AiSimulationResponse(
            sentiment="positive",
            sentiment_score=30,
            matched_action="إبقاء التعليق عاماً ونشطاً",
            matched_keywords=[],
            generated_reply="شكراً جزيلاً لثقتكم وكلماتكم الطيبة! 🌸",
            generated_dm=None,
            decision_reason="التعليق إيجابي ولا يحتوي على مخالفات أو كلمات استفسار مسعرة",
        )
