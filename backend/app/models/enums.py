import enum


class ProviderEnum(str, enum.Enum):
    META = "meta"
    BEON = "beon"


class ChannelEnum(str, enum.Enum):
    MESSENGER = "messenger"
    INSTAGRAM = "instagram"
    WHATSAPP = "whatsapp"
    TIKTOK = "tiktok"
    SMS = "sms"


class SenderTypeEnum(str, enum.Enum):
    CUSTOMER = "customer"
    AGENT = "agent"
    SYSTEM = "system"


class ConversationStatusEnum(str, enum.Enum):
    OPEN = "open"
    CLOSED = "closed"
    PENDING = "pending"


class MessageTypeEnum(str, enum.Enum):
    TEXT = "text"
    IMAGE = "image"
    VIDEO = "video"
    AUDIO = "audio"
    FILE = "file"
    SHARE_REEL = "share_reel"
    SHARE_POST = "share_post"
    SYSTEM = "system"
    UNKNOWN = "unknown"


class MigrationStatusEnum(str, enum.Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"


class RawEventStatusEnum(str, enum.Enum):
    RECEIVED = "received"
    PROCESSED = "processed"
    FAILED = "failed"


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    AGENT = "agent"
    SUPERVISOR = "supervisor"

