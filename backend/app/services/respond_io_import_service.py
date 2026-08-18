from typing import Any, Optional
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.integrations.respond_io import RespondIoAPIError, RespondIoProvider
from app.models import (
    ChannelEnum,
    Message,
    MigrationJob,
    MigrationStatusEnum,
    ProviderEnum,
)
from app.services.conversation_service import ConversationService
from app.services.customer_service import CustomerService
from app.services.migration_service import MigrationService


class RespondIoImportService:
    @staticmethod
    def _sanitize_error(err_str: str) -> str:
        token = settings.RESPOND_IO_API_TOKEN
        if token and len(token) > 0:
            err_str = err_str.replace(token, "[REDACTED_TOKEN]")
        secret = settings.RESPOND_IO_WEBHOOK_SECRET
        if secret and len(secret) > 0:
            err_str = err_str.replace(secret, "[REDACTED_SECRET]")
        return err_str

    @staticmethod
    async def run_import(
        session: AsyncSession,
        channel: ChannelEnum = ChannelEnum.WHATSAPP,
        provider_adapter: Optional[RespondIoProvider] = None,
    ) -> MigrationJob:
        adapter = provider_adapter or RespondIoProvider()

        # 1. Validate configuration & credentials
        try:
            await adapter.validate_configuration()
        except RespondIoAPIError as exc:
            job = await MigrationService.create_migration_job(
                session=session,
                provider=ProviderEnum.RESPOND_IO,
                channel=channel,
            )
            await MigrationService.update_migration_status(
                session=session,
                job_id=job.id,
                status=MigrationStatusEnum.FAILED,
                error_entry={
                    "stage": "validation",
                    "error": RespondIoImportService._sanitize_error(str(exc.message)),
                    "status_code": exc.status_code,
                },
            )
            return job

        # 2. Create MigrationJob
        job = await MigrationService.create_migration_job(
            session=session,
            provider=ProviderEnum.RESPOND_IO,
            channel=channel,
        )
        await MigrationService.update_migration_status(
            session=session, job_id=job.id, status=MigrationStatusEnum.RUNNING
        )

        has_errors = False

        # 3. Fetch all contacts from Respond.io API
        try:
            norm_contacts = await adapter.get_all_contacts()
            job.total_conversations = len(norm_contacts)
            await session.commit()
        except Exception as exc:
            await MigrationService.update_migration_status(
                session=session,
                job_id=job.id,
                status=MigrationStatusEnum.FAILED,
                error_entry={
                    "stage": "fetch_contacts",
                    "error": RespondIoImportService._sanitize_error(str(exc)),
                },
            )
            return job

        # 4. Import each Contact as Customer, CustomerIdentity, & Conversation
        for norm_c in norm_contacts:
            try:
                target_channel = norm_c.channel or channel
                customer, identity = await CustomerService.get_or_create_customer_with_identity(
                    session=session,
                    provider=ProviderEnum.RESPOND_IO,
                    channel=target_channel,
                    external_user_id=norm_c.external_user_id,
                    display_name=norm_c.display_name,
                    email=norm_c.email,
                    phone=norm_c.phone,
                )
                await ConversationService.get_or_create_conversation_for_identity(
                    session=session,
                    identity=identity,
                )
                job.processed_conversations += 1
                await session.commit()
            except Exception as exc:
                has_errors = True
                job.failed_items += 1
                current_logs = list(job.error_log or [])
                current_logs.append(
                    {
                        "contact_id": norm_c.external_user_id,
                        "error": RespondIoImportService._sanitize_error(str(exc)),
                    }
                )
                job.error_log = current_logs
                await session.commit()

        # 5. Finalize MigrationJob Status
        if not has_errors:
            final_status = MigrationStatusEnum.COMPLETED
        elif job.processed_conversations > 0:
            final_status = MigrationStatusEnum.COMPLETED_WITH_ERRORS
        else:
            final_status = MigrationStatusEnum.FAILED

        await MigrationService.update_migration_status(
            session=session, job_id=job.id, status=final_status
        )

        return job

    @staticmethod
    async def process_inbound_webhook(
        session: AsyncSession,
        raw_payload: dict[str, Any],
        provider_adapter: Optional[RespondIoProvider] = None,
    ) -> dict[str, Any]:
        if not isinstance(raw_payload, dict):
            raise ValueError("Invalid JSON payload structure.")

        adapter = provider_adapter or RespondIoProvider()
        norm_event = adapter.parse_webhook_event(raw_payload)

        if not norm_event.contact_id or not norm_event.contact_id.strip():
            raise ValueError("Missing contact identifier in Respond.io webhook payload.")

        # 1. Resolve/create Customer & CustomerIdentity
        customer, identity = await CustomerService.get_or_create_customer_with_identity(
            session=session,
            provider=ProviderEnum.RESPOND_IO,
            channel=norm_event.channel,
            external_user_id=norm_event.contact_id,
            display_name=norm_event.contact_name,
            email=norm_event.contact_email,
            phone=norm_event.contact_phone,
        )

        # 2. Resolve/create Conversation
        conv = await ConversationService.get_or_create_conversation_for_identity(
            session=session,
            identity=identity,
        )

        # 3. Non-message event handling
        if not norm_event.external_message_id:
            return {
                "status": "processed",
                "message": "Ignored non-message event.",
                "contact_id": norm_event.contact_id,
            }

        # 4. Idempotency Check
        stmt = select(Message).where(
            Message.conversation_id == conv.id,
            Message.external_message_id == norm_event.external_message_id,
        )
        res = await session.execute(stmt)
        existing_msg = res.scalar_one_or_none()

        if existing_msg:
            return {
                "status": "already_processed",
                "message_id": str(existing_msg.id),
                "external_message_id": existing_msg.external_message_id,
            }

        # 5. Create and persist Message
        msg = Message(
            conversation_id=conv.id,
            external_message_id=norm_event.external_message_id,
            sender_type=norm_event.sender_type,
            sender_external_id=norm_event.sender_external_id or norm_event.contact_id,
            message_type=norm_event.message_type,
            text=norm_event.text,
            created_at=norm_event.created_at,
            metadata_={
                "attachments": norm_event.attachments,
                "raw": raw_payload,
            },
        )
        session.add(msg)

        # 6. Update conversation last_message_at safely (prevent moving backwards for out-of-order events)
        if conv.last_message_at is None or norm_event.created_at > conv.last_message_at:
            conv.last_message_at = norm_event.created_at

        await session.commit()
        await session.refresh(msg)

        return {
            "status": "success",
            "message_id": str(msg.id),
            "external_message_id": msg.external_message_id,
        }
