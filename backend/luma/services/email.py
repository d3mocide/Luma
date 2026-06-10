import base64
import logging
from email.message import EmailMessage
from typing import Literal

import httpx

from luma.config import settings

logger = logging.getLogger(__name__)

# ── Path detection ─────────────────────────────────────────────────────────────

SendPath = Literal["graph", "xoauth2", "basic_auth", "disabled"]


def active_send_path() -> SendPath:
    """Return which send path will be used given current configuration.

    Priority order:
      1. Microsoft Graph API   — when oauth_token_url is a Microsoft Entra endpoint.
         No smtp_host or licensed mailbox required; needs Mail.Send app permission.
      2. XOAUTH2 SMTP          — when oauth_token_url is set (non-Microsoft).
         Requires smtp_host and a provider that supports SASL XOAUTH2.
      3. Basic-auth SMTP       — when smtp_host is set with username/password.
      4. Disabled              — no send configuration present.
    """
    if settings.smtp_oauth_token_url:
        if "microsoftonline.com" in settings.smtp_oauth_token_url:
            return "graph"
        return "xoauth2"
    if settings.smtp_host:
        return "basic_auth"
    return "disabled"


# ── Token acquisition ──────────────────────────────────────────────────────────

async def _acquire_oauth_token(scope: str) -> str:
    """Client-credentials token fetch for the given OAuth 2.0 scope."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.post(
            settings.smtp_oauth_token_url,
            data={
                "grant_type": "client_credentials",
                "client_id": settings.smtp_oauth_client_id,
                "client_secret": settings.smtp_oauth_client_secret,
                "scope": scope,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    if "access_token" not in data:
        raise RuntimeError(
            f"OAuth token error: {data.get('error_description', data.get('error', data))}"
        )
    return data["access_token"]


# ── Send backends ──────────────────────────────────────────────────────────────

async def _send_graph(msg: EmailMessage) -> None:
    """Send via Microsoft Graph API /sendMail.

    Uses application-permission Mail.Send — no licensed mailbox or SMTP AUTH
    needed. The smtp_from address must be a shared mailbox (or any mailbox)
    in the tenant, and the app registration must have admin-consented Mail.Send.

    Scope is always https://graph.microsoft.com/.default (hardcoded — it never
    changes for Graph). smtp_oauth_scope env var is ignored on this path.
    """
    access_token = await _acquire_oauth_token("https://graph.microsoft.com/.default")

    to_recipients = [
        {"emailAddress": {"address": addr.strip()}}
        for addr in (msg["To"] or "").split(",")
        if addr.strip()
    ]

    payload = {
        "message": {
            "subject": msg["Subject"] or "",
            "body": {
                "contentType": "Text",
                "content": msg.get_content(),
            },
            "toRecipients": to_recipients,
        },
        "saveToSentItems": False,
    }

    send_url = (
        f"https://graph.microsoft.com/v1.0/users"
        f"/{settings.smtp_from}/sendMail"
    )

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(
            send_url,
            json=payload,
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
            },
        )

    if resp.status_code == 202:
        return  # accepted — Graph returns no body on success

    try:
        err = resp.json().get("error", {})
        code = err.get("code", str(resp.status_code))
        message = err.get("message", resp.text)
    except Exception:
        code = str(resp.status_code)
        message = resp.text
    raise RuntimeError(f"Graph sendMail failed ({code}): {message}")


def _xoauth2_string(user: str, access_token: str) -> bytes:
    """Build the base64-encoded SASL XOAUTH2 initial client response."""
    payload = f"user={user}\x01auth=Bearer {access_token}\x01\x01"
    return base64.b64encode(payload.encode())


async def _send_xoauth2(msg: EmailMessage) -> None:
    """Send via SMTP SASL XOAUTH2 (non-Microsoft OAuth providers).

    aiosmtplib's start_tls=True performs EHLO → STARTTLS → EHLO during
    connect(). We then send one additional EHLO before AUTH to ensure the
    server state machine is ready.
    """
    import aiosmtplib  # type: ignore[import]

    access_token = await _acquire_oauth_token(settings.smtp_oauth_scope)
    xoauth2 = _xoauth2_string(settings.smtp_from, access_token)

    smtp = aiosmtplib.SMTP(
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        start_tls=True,
        timeout=30,
    )
    await smtp.connect()
    await smtp.ehlo()

    code, response = await smtp.execute_command(b"AUTH", b"XOAUTH2 " + xoauth2)
    if code != 235:
        try:
            detail = base64.b64decode(response).decode()
        except Exception:
            detail = response
        await smtp.quit()
        raise RuntimeError(f"XOAUTH2 auth rejected ({code}): {detail}")

    await smtp.send_message(msg)
    await smtp.quit()


async def _send_basic_auth(msg: EmailMessage) -> None:
    """Send via standard SMTP with username/password (Mailgun, Postmark, etc.)."""
    import aiosmtplib  # type: ignore[import]

    await aiosmtplib.send(
        msg,
        hostname=settings.smtp_host,
        port=settings.smtp_port,
        username=settings.smtp_user or None,
        password=settings.smtp_password or None,
        use_tls=settings.smtp_use_tls,
    )


async def _dispatch(msg: EmailMessage) -> None:
    """Route the message to the appropriate send backend."""
    path = active_send_path()
    if path == "graph":
        await _send_graph(msg)
    elif path == "xoauth2":
        await _send_xoauth2(msg)
    elif path == "basic_auth":
        await _send_basic_auth(msg)
    else:
        raise RuntimeError("No email send path is configured.")


# ── Public API ─────────────────────────────────────────────────────────────────

async def send_family_invite(
    to_email: str,
    inviter_name: str,
    group_name: str,
    accept_url: str,
) -> None:
    path = active_send_path()
    if path == "disabled":
        logger.info(
            "Email not configured — invitation skipped for %s (accept URL: %s)",
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
        await _dispatch(msg)
        logger.info("Invitation email sent to %s via %s", to_email, path)
    except Exception:
        # Don't raise — invite token is in DB; caller can share the link manually.
        logger.exception("Failed to send invitation email to %s", to_email)


async def send_welcome_email(
    to_email: str,
    display_name: str,
    temporary_password: str,
) -> None:
    """Send a welcome email to a newly created user with their temporary credentials."""
    path = active_send_path()
    if path == "disabled":
        logger.info("Email not configured — welcome email skipped for %s", to_email)
        return

    app_url = settings.app_base_url.rstrip('/')

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = "Welcome to Luma — your account is ready"
    msg.set_content(
        f"Hi {display_name},\n\n"
        f"Your Luma account has been created. Use the credentials below to sign in "
        f"for the first time — you'll be asked to choose a new password immediately.\n\n"
        f"    Luma URL:           {app_url}\n"
        f"    Email:              {to_email}\n"
        f"    Temporary password: {temporary_password}\n\n"
        f"For your security, this password is single-use. It cannot be reused once "
        f"you have set a permanent password.\n\n"
        f"If you weren't expecting this email, please contact your administrator.\n"
    )

    try:
        await _dispatch(msg)
        logger.info("Welcome email sent to %s via %s", to_email, path)
    except Exception:
        # Don't raise — the caller already has the temporary_password in the API response.
        logger.exception("Failed to send welcome email to %s", to_email)


async def send_password_reset_email(
    to_email: str,
    display_name: str,
    temporary_password: str,
) -> None:
    """Notify a user that an admin has reset their password."""
    path = active_send_path()
    if path == "disabled":
        logger.info(
            "Email not configured — password reset email skipped for %s", to_email
        )
        return

    app_url = settings.app_base_url.rstrip('/')

    msg = EmailMessage()
    msg["From"] = settings.smtp_from
    msg["To"] = to_email
    msg["Subject"] = "Luma — your password has been reset"
    msg.set_content(
        f"Hi {display_name},\n\n"
        f"An administrator has reset your Luma password. Use the temporary password "
        f"below to sign in — you'll be prompted to set a new one immediately.\n\n"
        f"    Luma URL:           {app_url}\n"
        f"    Email:              {to_email}\n"
        f"    Temporary password: {temporary_password}\n\n"
        f"If you did not request this reset and believe your account may be "
        f"compromised, contact your administrator immediately.\n"
    )

    try:
        await _dispatch(msg)
        logger.info("Password reset email sent to %s via %s", to_email, path)
    except Exception:
        logger.exception("Failed to send password reset email to %s", to_email)
