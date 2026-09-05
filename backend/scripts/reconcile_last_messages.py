import asyncio
import logging
from sqlalchemy import select, desc
from app.core.database import AsyncSessionLocal
from app.models.conversation import Conversation
from app.models.message import Message

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("reconcile")


async def reconcile_conversations():
    async with AsyncSessionLocal() as session:
        stmt = select(Conversation)
        conversations = (await session.execute(stmt)).scalars().all()
        logger.info("[Reconciliation] Auditing %d conversations...", len(conversations))

        updated_count = 0
        for conv in conversations:
            msg_stmt = (
                select(Message)
                .where(Message.conversation_id == conv.id)
                .order_by(desc(Message.created_at), desc(Message.id))
                .limit(1)
            )
            latest_msg = (await session.execute(msg_stmt)).scalars().first()

            if latest_msg:
                msg_type_str = str(
                    latest_msg.message_type.value
                    if hasattr(latest_msg.message_type, "value")
                    else latest_msg.message_type
                ).lower()

                if latest_msg.text and latest_msg.text.strip():
                    preview_text = latest_msg.text.strip()
                elif msg_type_str == "share_reel":
                    preview_text = "🎬 مشاركة ريل إنستغرام"
                elif msg_type_str == "share_post":
                    preview_text = "📸 مشاركة منشور إنستغرام"
                elif msg_type_str in ["audio", "voice"]:
                    preview_text = "🎤 تسجيل صوتي"
                elif msg_type_str == "image":
                    preview_text = "📷 صورة"
                elif msg_type_str == "video":
                    preview_text = "🎥 مقطع فيديو"
                else:
                    preview_text = "مرفق وسائط"

                conv.last_message_text = preview_text
                conv.last_message_at = latest_msg.created_at
                session.add(conv)
                updated_count += 1
                logger.info("Conv %s -> '%s' (%s)", conv.id, preview_text, latest_msg.created_at)

        await session.commit()
        logger.info("[Reconciliation] Successfully reconciled %d conversation previews.", updated_count)


if __name__ == "__main__":
    asyncio.run(reconcile_conversations())
