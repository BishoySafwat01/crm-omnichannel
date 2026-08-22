import pytest
from app.core.database import AsyncSessionLocal
from app.models.automation import AutomationRule
from app.models.conversation import Conversation
from app.models.customer import Customer
from app.models.enums import ChannelEnum, ConversationStatusEnum, ProviderEnum
from app.services.automation_service import AutomationService


@pytest.mark.asyncio
async def test_automation_unmatched_escalation():
    async with AsyncSessionLocal() as session:
        customer = Customer(
            display_name="عميل تجريبي",
        )
        session.add(customer)
        await session.commit()
        await session.refresh(customer)

        conversation = Conversation(
            customer_id=customer.id,
            provider=ProviderEnum.META,
            channel=ChannelEnum.MESSENGER,
            external_conversation_id="conv_ext_123",
            status=ConversationStatusEnum.OPEN,
            priority="normal",
            brand="LUXIRA",
        )
        session.add(conversation)
        await session.commit()
        await session.refresh(conversation)

        result = await AutomationService.evaluate_inbound_message(
            session=session,
            conversation=conversation,
            customer=customer,
            text="استفسار عشوائي غير معرف بالكلمات المفتاحية",
        )

        assert result is None
        await session.refresh(conversation)
        assert conversation.priority == "urgent"


@pytest.mark.asyncio
async def test_automation_actions_rule_creation():
    async with AsyncSessionLocal() as session:
        rule = AutomationRule(
            name="سلسلة ترحيبية متسلسلة",
            keywords=["سلسلة", "عرض_مخصص"],
            response_text="أهلاً بك في العرض!",
            actions=[
              {"type": "SEND_MESSAGE", "payload": {"text": "رسالة تذكير بعد دقيقتين"}, "delay_seconds": 0},
              {"type": "SET_PRIORITY", "payload": {"priority": "urgent"}, "delay_seconds": 0}
            ],
            is_active=True
        )
        session.add(rule)
        await session.commit()
        await session.refresh(rule)

        assert rule.id is not None
        assert len(rule.actions) == 2
        assert rule.actions[0]["type"] == "SEND_MESSAGE"
