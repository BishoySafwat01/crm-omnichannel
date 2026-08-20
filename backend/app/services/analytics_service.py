import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
from sqlalchemy import func, select, case, extract
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.automation import AutomationExecutionLog
from app.models.conversation import Conversation
from app.models.enums import ChannelEnum, ConversationStatusEnum, SenderTypeEnum
from app.models.message import Message
from app.schemas.analytics import (
    AnalyticsOverviewResponse,
    BrandItem,
    BrandVolumeResponse,
    ChannelDistributionResponse,
    ChannelItem,
    HourItem,
    PeakHoursResponse,
    SlaMetricsResponse,
)

logger = logging.getLogger("AnalyticsService")


class AnalyticsService:
    @staticmethod
    async def get_overview_kpis(
        session: AsyncSession, brand: Optional[str] = None, days: int = 30
    ) -> AnalyticsOverviewResponse:
        since_dt = datetime.now(timezone.utc) - timedelta(days=days)
        clean_brand = brand.strip() if brand and brand.strip().lower() not in ("all", "الكل") else None

        # 1. Total Conversations
        tot_conv_stmt = select(func.count(Conversation.id)).where(Conversation.created_at >= since_dt)
        if clean_brand:
            tot_conv_stmt = tot_conv_stmt.where(Conversation.brand == clean_brand)
        tot_convs = (await session.execute(tot_conv_stmt)).scalar() or 0

        # 2. Unresolved Conversations (status != CLOSED and unread_count > 0)
        unres_stmt = select(func.count(Conversation.id)).where(
            Conversation.status != ConversationStatusEnum.CLOSED,
            Conversation.unread_count > 0,
        )
        if clean_brand:
            unres_stmt = unres_stmt.where(Conversation.brand == clean_brand)
        unres_convs = (await session.execute(unres_stmt)).scalar() or 0

        # 3. Total Inbound Messages
        inbound_stmt = (
            select(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Message.sender_type == SenderTypeEnum.CUSTOMER, Message.created_at >= since_dt)
        )
        if clean_brand:
            inbound_stmt = inbound_stmt.where(Conversation.brand == clean_brand)
        inbound_count = (await session.execute(inbound_stmt)).scalar() or 0

        # 4. Total Outbound Messages
        outbound_stmt = (
            select(func.count(Message.id))
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Message.sender_type == SenderTypeEnum.AGENT, Message.created_at >= since_dt)
        )
        if clean_brand:
            outbound_stmt = outbound_stmt.where(Conversation.brand == clean_brand)
        outbound_count = (await session.execute(outbound_stmt)).scalar() or 0

        # 5. Automation Resolutions Count
        auto_stmt = (
            select(func.count(AutomationExecutionLog.id))
            .join(Conversation, AutomationExecutionLog.conversation_id == Conversation.id)
            .where(AutomationExecutionLog.executed_at >= since_dt)
        )
        if clean_brand:
            auto_stmt = auto_stmt.where(Conversation.brand == clean_brand)
        auto_count = (await session.execute(auto_stmt)).scalar() or 0

        # 6. Automation Resolution Rate %
        rate = round((auto_count / max(tot_convs, 1)) * 100.0, 1) if tot_convs > 0 else 0.0

        return AnalyticsOverviewResponse(
            total_conversations=tot_convs,
            unresolved_conversations=unres_convs,
            total_inbound_messages=inbound_count,
            total_outbound_messages=outbound_count,
            automation_resolutions=auto_count,
            automation_resolution_rate=rate,
        )

    @staticmethod
    async def get_channel_distribution(
        session: AsyncSession, brand: Optional[str] = None
    ) -> ChannelDistributionResponse:
        clean_brand = brand.strip() if brand and brand.strip().lower() not in ("all", "الكل") else None

        stmt = select(Conversation.channel, func.count(Conversation.id)).group_by(Conversation.channel)
        if clean_brand:
            stmt = stmt.where(Conversation.brand == clean_brand)

        rows = (await session.execute(stmt)).all()
        total_convs = sum(r[1] for r in rows)

        channel_map = {
            ChannelEnum.MESSENGER.value if hasattr(ChannelEnum.MESSENGER, "value") else "messenger": 0,
            ChannelEnum.INSTAGRAM.value if hasattr(ChannelEnum.INSTAGRAM, "value") else "instagram": 0,
            ChannelEnum.WHATSAPP.value if hasattr(ChannelEnum.WHATSAPP, "value") else "whatsapp": 0,
        }

        for ch_enum, count in rows:
            ch_str = ch_enum.value.lower() if hasattr(ch_enum, "value") else str(ch_enum).lower()
            channel_map[ch_str] = count

        items = []
        for ch_key, count in channel_map.items():
            pct = round((count / max(total_convs, 1)) * 100.0, 1) if total_convs > 0 else 0.0
            items.append(ChannelItem(channel=ch_key, count=count, percentage=pct))

        return ChannelDistributionResponse(total=total_convs, channels=items)

    @staticmethod
    async def get_brand_volume(session: AsyncSession) -> BrandVolumeResponse:
        conv_stmt = select(
            Conversation.brand,
            func.count(Conversation.id).label("tot_convs"),
            func.sum(case((Conversation.unread_count > 0, 1), else_=0)).label("active_unread"),
        ).group_by(Conversation.brand)

        conv_rows = (await session.execute(conv_stmt)).all()

        msg_stmt = (
            select(Conversation.brand, func.count(Message.id))
            .join(Message, Message.conversation_id == Conversation.id)
            .group_by(Conversation.brand)
        )
        msg_rows = (await session.execute(msg_stmt)).all()
        msg_map = {r[0] or "LAVVA": r[1] for r in msg_rows}

        brand_items = []
        known_brands = ["LAVVA", "FLARE", "MOON LIGHT", "LOTUS BLUE", "BEAUTY CENTER", "LOXX KING"]
        seen_brands = set()

        for b_name, tot_c, unread_c in conv_rows:
            b_key = b_name or "LAVVA"
            seen_brands.add(b_key)
            brand_items.append(
                BrandItem(
                    brand=b_key,
                    total_conversations=tot_c or 0,
                    active_unread=int(unread_c or 0),
                    total_messages=msg_map.get(b_key, 0),
                )
            )

        for kb in known_brands:
            if kb not in seen_brands:
                brand_items.append(
                    BrandItem(
                        brand=kb,
                        total_conversations=0,
                        active_unread=0,
                        total_messages=msg_map.get(kb, 0),
                    )
                )

        return BrandVolumeResponse(brands=brand_items)

    @staticmethod
    async def get_peak_hours_distribution(
        session: AsyncSession, brand: Optional[str] = None, days: int = 30
    ) -> PeakHoursResponse:
        since_dt = datetime.now(timezone.utc) - timedelta(days=days)
        clean_brand = brand.strip() if brand and brand.strip().lower() not in ("all", "الكل") else None

        stmt = (
            select(
                extract("hour", Message.created_at).label("hour_val"),
                func.count(Message.id).label("msg_count"),
            )
            .join(Conversation, Message.conversation_id == Conversation.id)
            .where(Message.created_at >= since_dt)
        )
        if clean_brand:
            stmt = stmt.where(Conversation.brand == clean_brand)

        stmt = stmt.group_by(extract("hour", Message.created_at))
        rows = (await session.execute(stmt)).all()

        hour_counts = {h: 0 for h in range(24)}
        for h_val, count in rows:
            if h_val is not None:
                h_int = int(h_val)
                if 0 <= h_int < 24:
                    hour_counts[h_int] = count

        hours_list = [HourItem(hour=h, message_count=hour_counts[h]) for h in range(24)]
        peak_h = max(hour_counts, key=hour_counts.get) if hour_counts else 0
        peak_c = hour_counts[peak_h] if hour_counts else 0

        return PeakHoursResponse(hours=hours_list, peak_hour=peak_h, peak_count=peak_c)

    @staticmethod
    async def get_sla_response_metrics(
        session: AsyncSession, brand: Optional[str] = None
    ) -> SlaMetricsResponse:
        clean_brand = brand.strip() if brand and brand.strip().lower() not in ("all", "الكل") else None

        cust_sub = (
            select(
                Message.conversation_id,
                func.min(Message.created_at).label("first_cust_time"),
            )
            .where(Message.sender_type == SenderTypeEnum.CUSTOMER)
            .group_by(Message.conversation_id)
            .subquery()
        )

        agent_sub = (
            select(
                Message.conversation_id,
                func.min(Message.created_at).label("first_agent_time"),
            )
            .where(Message.sender_type == SenderTypeEnum.AGENT)
            .group_by(Message.conversation_id)
            .subquery()
        )

        stmt = (
            select(
                Conversation.id,
                cust_sub.c.first_cust_time,
                agent_sub.c.first_agent_time,
            )
            .join(cust_sub, Conversation.id == cust_sub.c.conversation_id)
            .join(agent_sub, Conversation.id == agent_sub.c.conversation_id)
            .where(agent_sub.c.first_agent_time >= cust_sub.c.first_cust_time)
        )

        if clean_brand:
            stmt = stmt.where(Conversation.brand == clean_brand)

        rows = (await session.execute(stmt)).all()

        if not rows:
            return SlaMetricsResponse(
                avg_first_response_minutes=0.0,
                within_sla_count=0,
                total_evaluated=0,
                sla_compliance_rate=0.0,
            )

        diffs_minutes = []
        within_sla = 0

        for c_id, cust_t, agent_t in rows:
            if cust_t and agent_t:
                diff_sec = (agent_t - cust_t).total_seconds()
                diff_min = max(0.0, diff_sec / 60.0)
                diffs_minutes.append(diff_min)
                if diff_min <= 15.0:
                    within_sla += 1

        total_eval = len(diffs_minutes)
        avg_min = round(sum(diffs_minutes) / max(total_eval, 1), 1) if total_eval > 0 else 0.0
        compliance = round((within_sla / max(total_eval, 1)) * 100.0, 1) if total_eval > 0 else 0.0

        return SlaMetricsResponse(
            avg_first_response_minutes=avg_min,
            within_sla_count=within_sla,
            total_evaluated=total_eval,
            sla_compliance_rate=compliance,
        )
