import enum


class ProviderEnum(str, enum.Enum):
    META = "meta"
    RESPOND_IO = "respond_io"


class ChannelEnum(str, enum.Enum):
    MESSENGER = "messenger"
    INSTAGRAM = "instagram"
    WHATSAPP = "whatsapp"
    TIKTOK = "tiktok"


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
