import base64
from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from typing import Any, Union

from cryptography.fernet import Fernet
import jwt

from app.core.config import settings

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24  # 24 hours

try:
    import bcrypt

    HAS_BCRYPT = True
except ImportError:
    HAS_BCRYPT = False


def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False
    try:
        if HAS_BCRYPT and hashed_password.startswith(("$2b$", "$2a$", "$2y$")):
            pwd_bytes = plain_password.encode("utf-8")
            if len(pwd_bytes) > 72:
                pwd_bytes = pwd_bytes[:72]
            return bcrypt.checkpw(pwd_bytes, hashed_password.encode("utf-8"))
        elif hashed_password.startswith("pbkdf2:"):
            parts = hashed_password.split("$")
            if len(parts) == 3:
                salt = bytes.fromhex(parts[1])
                target_hash = parts[2]
                computed = hashlib.pbkdf2_hmac(
                    "sha256", plain_password.encode("utf-8"), salt, 100000
                ).hex()
                return hmac.compare_digest(computed, target_hash)
        return False
    except Exception:
        return False


def get_password_hash(password: str) -> str:
    if HAS_BCRYPT:
        pwd_bytes = password.encode("utf-8")
        if len(pwd_bytes) > 72:
            pwd_bytes = pwd_bytes[:72]
        salt = bcrypt.gensalt()
        return bcrypt.hashpw(pwd_bytes, salt).decode("utf-8")
    salt = os.urandom(16)
    h = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100000).hex()
    return f"pbkdf2:${salt.hex()}${h}"


def create_access_token(
    subject: Union[str, Any], expires_delta: Union[timedelta, None] = None
) -> str:
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode = {"exp": expire, "sub": str(subject)}
    encoded_jwt = jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])


def get_fernet() -> Fernet:
    """Derive a URL-safe 32-byte Fernet key from settings.SECRET_KEY."""
    key_material = settings.SECRET_KEY.encode("utf-8")
    derived_key = hashlib.sha256(key_material).digest()
    fernet_key = base64.urlsafe_b64encode(derived_key)
    return Fernet(fernet_key)


def encrypt_token(raw_token: str) -> str:
    """Encrypt plain text token using Fernet symmetric encryption."""
    if not raw_token:
        return ""
    f = get_fernet()
    return f.encrypt(raw_token.encode("utf-8")).decode("utf-8")


def decrypt_token(cipher_token: str) -> str:
    """Decrypt Fernet encrypted token back to plain text."""
    if not cipher_token:
        return ""
    f = get_fernet()
    return f.decrypt(cipher_token.encode("utf-8")).decode("utf-8")

