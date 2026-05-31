import argparse
import hashlib
import hmac
import json
import os
import sys
import time
from dataclasses import dataclass
from typing import Any

import requests
import urllib3

# Suppress local self-signed certificate warnings for nginx TLS in dev.
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)


@dataclass
class CheckResult:
    name: str
    ok: bool
    status: int | None
    elapsed_s: float
    detail: str = ""


class SmokeRunner:
    def __init__(
        self,
        base_url: str,
        verify_tls: bool,
        login_candidates: list[str],
        password: str,
        hae_secret: str,
        run_plan_generation: bool,
        plan_timeout: int,
        run_llm_agents: bool,
        llm_timeout: int,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.api = f"{self.base_url}/api/v1"
        self.verify_tls = verify_tls
        self.login_candidates = login_candidates
        self.password = password
        self.hae_secret = hae_secret
        self.run_plan_generation = run_plan_generation
        self.plan_timeout = plan_timeout
        self.run_llm_agents = run_llm_agents
        self.llm_timeout = llm_timeout
        self.session = requests.Session()
        self.results: list[CheckResult] = []

    def run(self) -> int:
        self._check_health()
        self._check_setup_status_and_login()
        self._check_auth_endpoints()
        self._check_ingest_signed_hae()
        self._check_today_and_trends()
        self._check_goals_and_preferences()
        self._check_foods_and_log_crud()
        self._check_plan_endpoints()
        self._check_llm_agents()
        self._check_stub_endpoints()
        return self._report()

    def _request(
        self,
        name: str,
        method: str,
        url: str,
        *,
        expected: set[int],
        timeout: int = 60,
        **kwargs: Any,
    ) -> requests.Response | None:
        t0 = time.monotonic()
        status: int | None = None
        detail = ""
        ok = False
        resp: requests.Response | None = None

        try:
            resp = self.session.request(method, url, timeout=timeout, verify=self.verify_tls, **kwargs)
            status = resp.status_code
            ok = status in expected
            if not ok:
                detail = (resp.text or "")[:260]
        except Exception as exc:
            detail = str(exc)

        elapsed = time.monotonic() - t0
        self.results.append(CheckResult(name=name, ok=ok, status=status, elapsed_s=elapsed, detail=detail))
        return resp

    def _check_health(self) -> None:
        self._request(
            "GET /health",
            "GET",
            f"{self.base_url}/health",
            expected={200},
        )

    def _check_setup_status_and_login(self) -> None:
        setup_resp = self._request(
            "GET /api/v1/auth/setup-status",
            "GET",
            f"{self.api}/auth/setup-status",
            expected={200},
        )
        if setup_resp is None:
            return

        setup_required = False
        try:
            setup_required = bool(setup_resp.json().get("setup_required"))
        except Exception:
            pass

        if setup_required:
            email = self.login_candidates[0]
            self._request(
                "POST /api/v1/auth/setup",
                "POST",
                f"{self.api}/auth/setup",
                expected={200, 201},
                json={"email": email, "password": self.password, "display_name": "Operator"},
            )
            return

        logged_in = False
        for email in self.login_candidates:
            resp = self._request(
                f"POST /api/v1/auth/login ({email})",
                "POST",
                f"{self.api}/auth/login",
                expected={200, 401, 422},
                json={"email": email, "password": self.password},
            )
            if resp is not None and resp.status_code == 200:
                logged_in = True
                break

        if not logged_in:
            self.results.append(
                CheckResult(
                    name="AUTH READY",
                    ok=False,
                    status=None,
                    elapsed_s=0.0,
                    detail="No login candidate succeeded",
                )
            )

    def _check_auth_endpoints(self) -> None:
        self._request(
            "GET /api/v1/auth/me",
            "GET",
            f"{self.api}/auth/me",
            expected={200},
        )
        self._request(
            "POST /api/v1/auth/refresh",
            "POST",
            f"{self.api}/auth/refresh",
            expected={200},
        )

    def _check_ingest_signed_hae(self) -> None:
        body = b'{"data":{"test":"signed-smoke"}}'
        signature = hmac.new(self.hae_secret.encode(), body, hashlib.sha256).hexdigest()
        self._request(
            "POST /api/v1/ingest/hae (signed)",
            "POST",
            f"{self.api}/ingest/hae",
            expected={200},
            data=body,
            headers={"Content-Type": "application/json", "X-HAE-Signature": signature},
        )

    def _check_today_and_trends(self) -> None:
        self._request(
            "GET /api/v1/today",
            "GET",
            f"{self.api}/today",
            expected={200},
        )
        self._request(
            "GET /api/v1/trends/weight_kg?range=7d",
            "GET",
            f"{self.api}/trends/weight_kg?range=7d",
            expected={200},
        )
        self._request(
            "GET /api/v1/trends",
            "GET",
            f"{self.api}/trends",
            expected={200},
        )

    def _check_goals_and_preferences(self) -> None:
        self._request(
            "GET /api/v1/goals",
            "GET",
            f"{self.api}/goals",
            expected={200},
        )
        self._request(
            "PUT /api/v1/goals",
            "PUT",
            f"{self.api}/goals",
            expected={200},
            json={
                "daily_calorie_target": 2100,
                "daily_sat_fat_g_max": 12.0,
                "daily_soluble_fiber_g": 10.0,
            },
        )
        pref = {"kind": "dislike", "value": "anchovies"}
        self._request(
            "POST /api/v1/preferences",
            "POST",
            f"{self.api}/preferences",
            expected={200},
            json=pref,
        )
        self._request(
            "GET /api/v1/preferences",
            "GET",
            f"{self.api}/preferences",
            expected={200},
        )
        self._request(
            "DELETE /api/v1/preferences/dislike/anchovies",
            "DELETE",
            f"{self.api}/preferences/dislike/anchovies",
            expected={200},
        )

    def _check_foods_and_log_crud(self) -> None:
        self._request(
            "GET /api/v1/foods/search?q=oat",
            "GET",
            f"{self.api}/foods/search?q=oat",
            expected={200},
        )

        created_food_id: str | None = None
        food_resp = self._request(
            "POST /api/v1/foods",
            "POST",
            f"{self.api}/foods",
            expected={201},
            json={
                "name": f"Smoke Oats {int(time.time())}",
                "brand": "Luma Smoke",
                "serving_size_g": 40,
                "nutrients_per_100g": {"calories": 389},
                "tags": ["smoke"],
            },
        )
        if food_resp is not None and food_resp.status_code == 201:
            try:
                created_food_id = food_resp.json().get("id")
            except Exception:
                created_food_id = None

        if created_food_id:
            self._request(
                "GET /api/v1/foods/{id}",
                "GET",
                f"{self.api}/foods/{created_food_id}",
                expected={200},
            )

        meal_id: str | None = None
        meal_resp = self._request(
            "POST /api/v1/log/meal",
            "POST",
            f"{self.api}/log/meal",
            expected={200},
            json={
                "slot": "lunch",
                "source": "manual",
                "items": [{"name": "Smoke Oats", "quantity": 1, "unit": "serving"}],
                "nutrition": {"calories": 200},
            },
        )
        if meal_resp is not None and meal_resp.status_code == 200:
            try:
                meal_id = meal_resp.json().get("id")
            except Exception:
                meal_id = None

        if meal_id:
            self._request(
                "PATCH /api/v1/log/meal/{id}",
                "PATCH",
                f"{self.api}/log/meal/{meal_id}",
                expected={200},
                json={"slot": "dinner"},
            )
            self._request(
                "DELETE /api/v1/log/meal/{id}",
                "DELETE",
                f"{self.api}/log/meal/{meal_id}",
                expected={200},
            )

    def _check_plan_endpoints(self) -> None:
        self._request(
            "GET /api/v1/plan/current",
            "GET",
            f"{self.api}/plan/current",
            expected={200, 404},
        )

        if not self.run_plan_generation:
            self.results.append(
                CheckResult(
                    name="POST /api/v1/plan/generate (skipped)",
                    ok=True,
                    status=None,
                    elapsed_s=0.0,
                    detail="Skipped by flag",
                )
            )
            return

        self._request(
            "POST /api/v1/plan/generate",
            "POST",
            f"{self.api}/plan/generate",
            expected={200},
            timeout=self.plan_timeout,
            json={"constraints": {"notes": "smoke-e2e"}},
        )

    def _check_llm_agents(self) -> None:
        """Round-trip the LLM-backed agents so a broken model route surfaces here.

        Unlike a plain 200 check, these assert the model actually produced
        output (extracted items / streamed tokens) — that is what distinguishes
        a working route from one that silently falls back to an empty result.
        """
        if not self.run_llm_agents:
            self.results.append(
                CheckResult(
                    name="LLM AGENTS (skipped)",
                    ok=True,
                    status=None,
                    elapsed_s=0.0,
                    detail="Skipped by flag",
                )
            )
            return

        self._check_food_extractor()
        self._check_coach_stream()
        # Insight narrator has no direct endpoint — it runs in the worker when an
        # alert fires. We can only confirm the read path + surface any narratives.
        self._request(
            "GET /api/v1/insights (insight-narrator read path)",
            "GET",
            f"{self.api}/insights",
            expected={200},
        )

    def _check_food_extractor(self) -> None:
        resp = self._request(
            "POST /api/v1/log/meal/text (food-extractor LLM)",
            "POST",
            f"{self.api}/log/meal/text",
            expected={200},
            timeout=self.llm_timeout,
            json={"text": "two scrambled eggs, a slice of whole wheat toast, and a cup of black coffee"},
        )
        if resp is None or resp.status_code != 200:
            return

        items: list[Any] = []
        try:
            items = resp.json().get("items") or []
        except Exception:
            items = []
        ok = len(items) > 0
        self.results.append(
            CheckResult(
                name="  food-extractor produced items",
                ok=ok,
                status=resp.status_code,
                elapsed_s=0.0,
                detail="" if ok else "LLM returned 0 items — model route likely failing",
            )
        )

    def _check_coach_stream(self) -> None:
        thread_resp = self._request(
            "POST /api/v1/coach/threads (coach thread)",
            "POST",
            f"{self.api}/coach/threads",
            expected={200},
            json={"title": "smoke-e2e"},
        )
        thread_id: str | None = None
        if thread_resp is not None and thread_resp.status_code == 200:
            try:
                thread_id = thread_resp.json().get("id")
            except Exception:
                thread_id = None
        if not thread_id:
            self.results.append(
                CheckResult(
                    name="POST /api/v1/coach/threads/{id}/messages (coach LLM)",
                    ok=False,
                    status=None,
                    elapsed_s=0.0,
                    detail="Could not create a coach thread to stream into",
                )
            )
            return

        name = "POST /api/v1/coach/threads/{id}/messages (coach LLM stream)"
        t0 = time.monotonic()
        tokens = 0
        detail = ""
        status_code: int | None = None
        ok = False
        try:
            with self.session.post(
                f"{self.api}/coach/threads/{thread_id}/messages",
                json={"content": "In one short sentence, what should I focus on today?"},
                stream=True,
                timeout=self.llm_timeout,
                verify=self.verify_tls,
            ) as r:
                status_code = r.status_code
                if r.status_code != 200:
                    detail = (r.text or "")[:260]
                else:
                    for line in r.iter_lines(decode_unicode=True):
                        if not line or not line.startswith("data:"):
                            continue
                        try:
                            data = json.loads(line[len("data:"):].strip())
                        except json.JSONDecodeError:
                            continue
                        event_type = data.get("type")
                        if event_type == "token":
                            tokens += 1
                        elif event_type == "error":
                            detail = str(data.get("message") or data.get("detail") or data)[:260]
                            break
                        elif event_type == "done":
                            break
                    ok = tokens > 0 and not detail
                    if not ok and not detail:
                        detail = "Stream produced 0 tokens — coach model route likely failing"
        except Exception as exc:
            detail = str(exc)

        elapsed = time.monotonic() - t0
        self.results.append(
            CheckResult(name=name, ok=ok, status=status_code, elapsed_s=elapsed, detail=detail)
        )

    def _check_stub_endpoints(self) -> None:
        self._request(
            "GET /api/v1/recipes",
            "GET",
            f"{self.api}/recipes",
            expected={200},
        )
        self._request(
            "POST /api/v1/coach/threads",
            "POST",
            f"{self.api}/coach/threads",
            expected={200},
        )

    def _report(self) -> int:
        passed = sum(1 for r in self.results if r.ok)
        failed = len(self.results) - passed
        print("\n=== Luma API E2E Smoke Results ===")
        for r in self.results:
            status = "PASS" if r.ok else "FAIL"
            code = "-" if r.status is None else str(r.status)
            line = f"[{status}] {r.name} (status={code}, {r.elapsed_s:.2f}s)"
            if r.detail:
                line += f" :: {r.detail}"
            print(line)

        print(f"\nSummary: {passed} passed, {failed} failed, {len(self.results)} total")
        return 0 if failed == 0 else 1


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Luma API end-to-end smoke tests")
    parser.add_argument("--base-url", default=os.environ.get("BASE_URL", "http://localhost:8000"))
    parser.add_argument("--verify-tls", action="store_true", help="Enable TLS cert verification")
    parser.add_argument("--password", default=os.environ.get("ADMIN_PASSWORD", "changeme"))
    parser.add_argument(
        "--login-candidates",
        default=os.environ.get("ADMIN_EMAILS", "admin@sovereign.health,admin@luma.health"),
        help="Comma-separated login email candidates",
    )
    parser.add_argument(
        "--hae-shared-secret",
        default=os.environ.get("HAE_SHARED_SECRET", "changeme_generate_with_openssl_rand_hex_32"),
    )
    parser.add_argument("--skip-plan-generation", action="store_true")
    parser.add_argument("--plan-timeout", type=int, default=720, help="Timeout seconds for /plan/generate")
    parser.add_argument(
        "--skip-llm-agents",
        action="store_true",
        help="Skip the food-extractor / coach LLM round-trip checks (they spend tokens)",
    )
    parser.add_argument("--llm-timeout", type=int, default=120, help="Timeout seconds for LLM agent calls")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    candidates = [x.strip() for x in args.login_candidates.split(",") if x.strip()]
    if not candidates:
        print("No login candidates configured.")
        return 2

    runner = SmokeRunner(
        base_url=args.base_url,
        verify_tls=args.verify_tls,
        login_candidates=candidates,
        password=args.password,
        hae_secret=args.hae_shared_secret,
        run_plan_generation=not args.skip_plan_generation,
        plan_timeout=args.plan_timeout,
        run_llm_agents=not args.skip_llm_agents,
        llm_timeout=args.llm_timeout,
    )
    return runner.run()


if __name__ == "__main__":
    raise SystemExit(main())
