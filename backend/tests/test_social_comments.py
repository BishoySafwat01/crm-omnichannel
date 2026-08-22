import pytest
from app.core.database import AsyncSessionLocal
from app.models.comment import SocialComment
from app.services.meta_import_service import MetaImportService


@pytest.mark.asyncio
async def test_social_comment_webhook_ingestion():
    async with AsyncSessionLocal() as session:
        item = {
            "field": "feed",
            "value": {
                "comment_id": "comment_fb_12345",
                "post_id": "post_fb_9999",
                "message": "منتج ممتاز ورائع جداً!",
                "from": {"id": "user_789", "name": "أحمد علي"},
            },
        }

        comment = await MetaImportService.handle_comment_webhook(session, item)
        assert comment is not None
        assert comment.comment_id == "comment_fb_12345"
        assert comment.author_name == "أحمد علي"
        assert comment.sentiment in ["neutral", "positive"]
        assert comment.is_hidden is False


@pytest.mark.asyncio
async def test_social_comment_auto_moderation_toxic():
    async with AsyncSessionLocal() as session:
        item = {
            "field": "feed",
            "value": {
                "comment_id": "comment_fb_toxic_99",
                "post_id": "post_fb_9999",
                "message": "هذا احتيال و شتيمة ونصب لعين scam",
                "from": {"id": "user_bad", "name": "مستخدم متطفل"},
            },
        }

        comment = await MetaImportService.handle_comment_webhook(session, item)
        assert comment is not None
        assert comment.sentiment == "toxic"
        assert comment.is_hidden is True
