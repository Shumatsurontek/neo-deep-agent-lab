"""Clerk JWT verification for FastAPI.

When CLERK_ENABLED is True, protected routes verify Clerk JWTs.
When disabled (default), falls back to the existing bearer-token session system.

Clerk JWTs are verified using the JWKS endpoint at:
https://{CLERK_DOMAIN}/.well-known/jwks.json
"""

from __future__ import annotations

from fastapi import Header

from src.common import get_logger
from src.config import settings

logger = get_logger("server.auth")

_jwks_client = None


def _get_jwks_client():
    """Lazy-init the JWKS client for Clerk JWT verification."""
    global _jwks_client
    if _jwks_client is None and settings.CLERK_ENABLED:
        try:
            import jwt
            from jwt import PyJWKClient

            jwks_url = f"https://{settings.CLERK_DOMAIN}/.well-known/jwks.json"
            _jwks_client = PyJWKClient(jwks_url)
            logger.info(
                "Clerk JWKS client initialized (domain=%s)", settings.CLERK_DOMAIN
            )
        except ImportError:
            logger.warning("PyJWT not installed, Clerk verification disabled")
    return _jwks_client


async def get_clerk_user(
    authorization: str | None = Header(None),
) -> dict | None:
    """Extract and verify Clerk JWT claims.

    Returns the decoded token payload (with 'sub' field) or None if Clerk is disabled.
    """
    if not settings.CLERK_ENABLED:
        return None

    client = _get_jwks_client()
    if client is None:
        return None

    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization[7:]
    try:
        import jwt

        signing_key = client.get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
        logger.debug("Clerk user verified: sub=%s", payload.get("sub"))
        return payload
    except Exception as exc:
        logger.warning("Clerk JWT verification failed: %s", exc)
        return None
