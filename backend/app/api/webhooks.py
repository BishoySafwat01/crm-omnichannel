from fastapi import APIRouter
from app.api.v1.meta import receive_meta_webhook, verify_meta_webhook

router = APIRouter(prefix="/api/webhooks", tags=["webhooks"])

router.add_api_route(
    "/meta",
    verify_meta_webhook,
    methods=["GET"],
    summary="Canonical Meta Webhook Hub Verification Challenge",
)
router.add_api_route(
    "/meta",
    receive_meta_webhook,
    methods=["POST"],
    summary="Canonical Receive Inbound Meta Messenger Webhook Event",
)
