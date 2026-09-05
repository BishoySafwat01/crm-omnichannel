import uuid
import pytest
from app.core.database import AsyncSessionLocal
from app.models.social_comment import SocialComment, CommentModerationSetting
from app.schemas.social_comment import ModerationSettingsPayload
from app.services.comment_moderation_service import CommentModerationService


@pytest.mark.asyncio
async def test_get_or_create_default_settings():
    """Verify default moderation settings are generated properly in database."""
    async with AsyncSessionLocal() as session:
        brand_name = f"BRAND_{uuid.uuid4().hex[:8]}"
        settings = await CommentModerationService.get_or_create_settings(session, brand=brand_name)
        assert settings.brand == brand_name
        assert settings.auto_delete_negative is True
        assert settings.auto_reply_inquiries is True
        assert "نصابين" in settings.negative_keywords
        assert "السعر" in settings.inquiry_keywords


@pytest.mark.asyncio
async def test_update_moderation_settings():
    """Verify settings update is saved and affects database state."""
    async with AsyncSessionLocal() as session:
        payload = ModerationSettingsPayload(
            auto_delete_negative=False,
            auto_hide_spam=True,
            auto_reply_inquiries=True,
            strictness_level="balanced",
            action_for_negative="hide",
            negative_keywords=["سيء", "رديء"],
            inquiry_keywords=["بكم", "تفاصيل"],
            inquiry_reply_text="مرحباً! تم إرسال الأسعار.",
            inquiry_dm_text="كود الخصم هو SAVE10",
            negative_dm_apology_text="نعتذر عن أي إزعاج.",
        )
        updated = await CommentModerationService.update_settings(session, brand="LUXIRA_TEST", payload=payload)
        assert updated.auto_delete_negative is False
        assert updated.action_for_negative == "hide"
        assert updated.inquiry_reply_text == "مرحباً! تم إرسال الأسعار."

        # Fetch again to ensure persistence
        fetched = await CommentModerationService.get_or_create_settings(session, brand="LUXIRA_TEST")
        assert fetched.auto_delete_negative is False
        assert fetched.action_for_negative == "hide"


@pytest.mark.asyncio
async def test_process_and_moderate_toxic_comment():
    """Verify toxic comment triggers auto_deleted when auto_delete_negative is enabled."""
    async with AsyncSessionLocal() as session:
        payload = ModerationSettingsPayload(
            auto_delete_negative=True,
            auto_hide_spam=True,
            auto_reply_inquiries=True,
            strictness_level="strict",
            action_for_negative="delete",
            negative_keywords=["نصابين", "احتيال"],
            inquiry_keywords=["السعر", "بكم"],
            inquiry_reply_text="أهلاً بك",
            inquiry_dm_text="الأسعار متاحة",
            negative_dm_apology_text="نعتذر",
        )
        await CommentModerationService.update_settings(session, brand="BRAND_TOXIC", payload=payload)

        toxic_comment = SocialComment(
            id=uuid.uuid4(),
            brand="BRAND_TOXIC",
            platform="facebook",
            post_id="post_test_100",
            post_title="Post Title",
            author_name="User Toxic",
            comment_text="أنتم نصابين وحرامية لا تشتروا منهم",
        )
        processed = await CommentModerationService.process_and_moderate_comment(
            session, toxic_comment, brand="BRAND_TOXIC"
        )
        await session.commit()

        assert processed.sentiment == "negative"
        assert processed.moderation_status == "auto_deleted"
        assert "نصابين" in str(processed.ai_action_reason)


@pytest.mark.asyncio
async def test_process_and_moderate_inquiry_comment():
    """Verify inquiry comment triggers auto-reply and direct message flags."""
    async with AsyncSessionLocal() as session:
        inquiry_comment = SocialComment(
            id=uuid.uuid4(),
            brand="BRAND_INQUIRY",
            platform="instagram",
            post_id="post_test_200",
            post_title="Dress Post",
            author_name="Customer Mona",
            comment_text="كم السعر وهل متاح توصيل؟",
        )
        processed = await CommentModerationService.process_and_moderate_comment(
            session, inquiry_comment, brand="BRAND_INQUIRY"
        )
        await session.commit()

        assert processed.sentiment == "neutral_inquiry"
        assert processed.moderation_status == "replied"
        assert processed.is_direct_message_sent is True
        assert processed.auto_replied_text is not None


@pytest.mark.asyncio
async def test_simulate_ai_endpoint():
    """Verify simulate_ai returns correct classification and generated messages."""
    async with AsyncSessionLocal() as session:
        sim_result = await CommentModerationService.simulate_ai(
            session, comment_text="كم سعر هذا المنتج؟", brand="all"
        )
        assert sim_result.sentiment == "neutral_inquiry"
        assert "السعر" in sim_result.matched_keywords or "سعر" in sim_result.matched_keywords
        assert sim_result.generated_reply is not None
