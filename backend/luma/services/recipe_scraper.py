import logging
import re
from html.parser import HTMLParser

import httpx

logger = logging.getLogger("recipe_scraper")

_SKIP_TAGS = frozenset({"script", "style", "noscript", "head", "meta", "link", "svg", "path", "button", "nav", "footer"})
_MAX_CHARS = 20_000


class _TextExtractor(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self._skip_depth = 0
        self._parts: list[str] = []

    def handle_starttag(self, tag: str, attrs: list) -> None:
        if tag.lower() in _SKIP_TAGS:
            self._skip_depth += 1

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in _SKIP_TAGS:
            self._skip_depth = max(0, self._skip_depth - 1)

    def handle_data(self, data: str) -> None:
        if self._skip_depth == 0:
            stripped = data.strip()
            if stripped:
                self._parts.append(stripped)

    def get_text(self) -> str:
        text = "\n".join(self._parts)
        text = re.sub(r"\n{3,}", "\n\n", text)
        return text.strip()


async def fetch_and_clean(url: str) -> str:
    """Fetch a URL and return clean plaintext with HTML tags stripped."""
    headers = {
        "User-Agent": "Mozilla/5.0 (compatible; Luma/1.0; recipe-importer)",
        "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
    }
    async with httpx.AsyncClient(timeout=15.0, follow_redirects=True) as client:
        try:
            resp = await client.get(url, headers=headers)
            resp.raise_for_status()
        except httpx.HTTPStatusError as e:
            raise ValueError(f"Could not fetch URL: HTTP {e.response.status_code}") from e
        except httpx.RequestError as e:
            raise ValueError(f"Could not reach URL: {e}") from e

    content_type = resp.headers.get("content-type", "")
    if "html" not in content_type and "text" not in content_type:
        raise ValueError(f"URL did not return HTML (content-type: {content_type})")

    extractor = _TextExtractor()
    extractor.feed(resp.text)
    return extractor.get_text()[:_MAX_CHARS]
