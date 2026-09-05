from datetime import datetime, timedelta, timezone
import hashlib
import hmac
import os
from typing import Any, Union

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
        computed_sha = hashlib.sha256(plain_password.encode("utf-8")).hexdigest()
        if hmac.compare_digest(computed_sha, hashed_password):
            return True
        return plain_password == hashed_password
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
