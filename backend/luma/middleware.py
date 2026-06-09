"""ASGI middleware for the Luma API.

CSRFMiddleware implements the double-submit cookie pattern: a non-HttpOnly
`csrf_token` cookie is issued on any response that lacks one, and every
state-mutating request must echo that value back in the `X-CSRF-Token`
header. Auth cookies are HTTP-only + SameSite=Strict, so this is a second,
independent layer — a cross-site page can neither read the cookie nor set
the header.

Implemented as pure ASGI (not BaseHTTPMiddleware) so streaming responses
(coach SSE) pass through without buffering.
"""
import hmac
import http.cookies
import secrets

CSRF_COOKIE = "csrf_token"
CSRF_HEADER = b"x-csrf-token"
SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})

# Ingest endpoints are called by Health Auto Export, not a browser session —
# they authenticate via the app shared secret + per-user import token and
# cannot participate in the cookie/header dance.
EXEMPT_PREFIXES = ("/api/v1/ingest/",)

_DENIED_BODY = b'{"detail":"CSRF token missing or invalid"}'


def _parse_cookie_header(scope) -> dict[str, str]:
    raw = b"; ".join(v for k, v in scope.get("headers", []) if k == b"cookie")
    if not raw:
        return {}
    parsed = http.cookies.SimpleCookie()
    try:
        parsed.load(raw.decode("latin-1"))
    except http.cookies.CookieError:
        return {}
    return {key: morsel.value for key, morsel in parsed.items()}


def _get_header(scope, name: bytes) -> str | None:
    for key, value in scope.get("headers", []):
        if key == name:
            return value.decode("latin-1")
    return None


class CSRFMiddleware:
    def __init__(self, app, secure: bool) -> None:
        self.app = app
        self.secure = secure

    def _set_cookie_value(self, token: str) -> bytes:
        attrs = f"{CSRF_COOKIE}={token}; Path=/; Max-Age=604800; SameSite=Strict"
        if self.secure:
            attrs += "; Secure"
        return attrs.encode("latin-1")

    async def __call__(self, scope, receive, send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        cookies = _parse_cookie_header(scope)
        cookie_token = cookies.get(CSRF_COOKIE)
        new_token = None if cookie_token else secrets.token_urlsafe(32)

        method = scope["method"].upper()
        path = scope["path"]
        if method not in SAFE_METHODS and not path.startswith(EXEMPT_PREFIXES):
            header_token = _get_header(scope, CSRF_HEADER)
            if (
                not cookie_token
                or not header_token
                or not hmac.compare_digest(cookie_token, header_token)
            ):
                headers = [
                    (b"content-type", b"application/json"),
                    (b"content-length", str(len(_DENIED_BODY)).encode()),
                ]
                if new_token:
                    headers.append((b"set-cookie", self._set_cookie_value(new_token)))
                await send({"type": "http.response.start", "status": 403, "headers": headers})
                await send({"type": "http.response.body", "body": _DENIED_BODY})
                return

        if new_token is None:
            await self.app(scope, receive, send)
            return

        async def send_with_cookie(message) -> None:
            if message["type"] == "http.response.start":
                message.setdefault("headers", []).append(
                    (b"set-cookie", self._set_cookie_value(new_token))
                )
            await send(message)

        await self.app(scope, receive, send_with_cookie)
