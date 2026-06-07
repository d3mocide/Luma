import logging
from email.message import EmailMessage

from luma.config import settings

logger = logging.getLogger(__name__)


async def send_family_invite(
    to_email: str,
    inviter_name: str,
    group_name: str,
    accept_url: str,
) -> None:
    if not settings.smtp_host:
        logger.info("SMTP not configured — invitation email skipped for %s (accept URL: %s)", to_email, accept_url)
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
        import aiosmtplib  # type: ignore[import]

        await aiosmtplib.send(
            msg,
            hostname=settings.smtp_host,
            port=settings.smtp_port,
            username=settings.smtp_user or None,
            password=settings.smtp_password or None,
            use_tls=settings.smtp_use_tls,
        )
        logger.info("Invitation email sent to %s", to_email)
    except Exception:
        # Don't raise — the invite token is already in the DB; the caller can share the link manually.
        logger.exception("Failed to send invitation email to %s", to_email)
