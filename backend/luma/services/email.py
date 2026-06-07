import base64
import logging
from email.message import EmailMessage

import httpx

from luma.config import settings

logger = logging.getLogger(__name__)


async def _acquire_oauth_token() -> str:
    """
    Client-credentials token fetch for SASL XOAUTH2 SMTP.
    Works with any OAuth 2.0 provider (M365, Google Workspace, etc.).
    Requires smtp_oauth_token_url, smtp_oauth_client_id, smtp_oauth_client_secret,
    and smtp_oauth_scope to be set.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(settings.smtp_oauth_token_url, data={
            "grant_type": "client_credentials",
            "client_id": settings.smtp_oauth_client_id,
            "client_secret": settings.smtp_oauth_client_secret,
            "scope": settings.smtp_oauth_scope,
        })
        resp.raise_for_status()
        data = resp.json()

    if "access_token" not in data:
        raise RuntimeError(
            f"OAuth token error: {data.get('error_description', data.get('error', data))}"
        )
    return data["access_token"]


def _xoauth2_string(user: str, access_token: str) -> bytes:
    """
    Build the base64-encoded SASL XOAUTH2 initial client response.
    Format: base64("user={email}\\x01auth=Bearer {token}\\x01\\x01")
    """
    payload = f"user={user}\x01auth=Bearer {access_token}\x01\x01"
    return base64.b64encode(payload.encode())


async def _send_oauth(msg: EmailMessage) -> None:
    """Send via SMTP using SASL XOAUTH2 with any OAuth 2.0 provider."""
    import aiosmtplib  # type: ignore[import]

    access_token = await _acquire_oauth_token()
    xoauth2 = _xoauth2_string(settings.smtp_from, access_token)

    smtp = aiosmtplib.SMTP(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        start_tls=True,
        timeout=30,
    )
    await smtp.connect()

    # AUTH XOAUTH2 <base64-initial-response>
    code, response = await smtp.execute_command(b"AUTH", b"XOAUTH2 " + xoauth2)
    if code != 235:
        # On failure some providers return a base64-encoded JSON error as the continuation
        try:
            detail = base64.b64decode(response).decode()
        except Exception:
            detail = response.decode(errors="replace")
        await smtp.quit()
        raise RuntimeError(f"XOAUTH2 auth rejected ({code}): {detail}")

    await smtp.send_message(msg)
    await smtp.quit()


async def _send_basic_auth(msg: EmailMessage) -> None:
    """Send via standard SMTP with username/password (Mailgun, Postmark, Gmail, etc.)."""
    import aiosmtplib  # type: ignore[import]

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        use_tls=settings.smtp_use_tls,
    )


async def send_family_invite(
    to_email: str,
    inviter_name: str,
    group_name: str,
    accept_url: str,
) -> None:
    if not settings.smtp_host:
        logger.info(
            "SMTP not configured — invitation email skipped for %s (accept URL: %s)",
            to_email, accept_url,
        )
        return

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = f"{inviter_name} invited you to their Luma family group"
    msg.set_content(
        f"{inviter_name} has invited you to join the '{group_name}' group on Luma.\n\n"
        f"Accept your invitation:\n{accept_url}\n\n"
        f"This link expires in 7 days. If you don't have a Luma account yet, "
        f"register first and then click the link.\n\n"
        f"If you didn't expect this invitation, you can safely ignore this email.\n"
    )

    try:
        if settings.smtp_oauth_token_url:
            await _send_oauth(msg)
        else:
            await _send_basic_auth(msg)
        logger.info("Invitation email sent to %s", to_email)
    except Exception:
        # Don't raise — invite token is in DB; caller can share the link manually.
        logger.exception("Failed to send invitation email to %s", to_email)
