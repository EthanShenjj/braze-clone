"""Webhook composer and protected delivery regression."""

import os
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
ARTIFACTS = Path("tests/artifacts")


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 1000})
        browser_errors: list[str] = []
        page.on("console", lambda message: browser_errors.append(message.text) if message.type == "error" else None)
        page.on("pageerror", lambda error: browser_errors.append(str(error)))
        campaign_id = "cmp_e2e_webhook"
        variant = {
            "id": "var_1",
            "name": "Variant 1",
            "url": "https://hooks.example.com/users/{{${user_id} | default: 'unknown'}}",
            "method": "POST",
            "bodyType": "json",
            "body": '{"email":"{{${email} | default: \'unknown@example.com\'}}","message":"{% translation greeting %}Hello{% endtranslation %}"}',
            "headers": [
                {"id": "header_1", "key": "Content-Type", "value": "application/json"},
                {"id": "header_2", "key": "Authorization", "value": "Bearer e2e-secret"},
            ],
            "locales": ["en", "zh-CN"],
            "translations": {"zh-CN": {"greeting": "你好"}},
        }
        created = page.request.post(f"{BASE_URL}/api/campaigns", data={
            "id": campaign_id,
            "name": "E2E Webhook Campaign",
            "channel": "webhook",
            "schedule": "One time",
            "audience": "All Users",
            "conversion": "Make Purchase",
            "body": variant["body"],
            "config": {"channelValues": {"webhookVariants": [variant]}},
        })
        assert created.ok, created.text()

        page.goto(f"{BASE_URL}/engagement/campaigns/{campaign_id}?step=compose", wait_until="networkidle")
        page.get_by_role("heading", name="Compose Webhook").wait_for(timeout=10_000)
        assert page.get_by_label("Webhook URL").input_value().startswith("https://hooks.example.com")
        assert page.get_by_label("HTTP method").locator("option").all_text_contents() == ["POST", "GET", "PUT", "DELETE"]
        assert page.get_by_text("Live webhook delivery disabled").is_visible()
        page.get_by_text("zh-CN", exact=True).click()
        assert "你好" in page.locator(".webhook-preview pre").inner_text()
        assert "••••••••" in page.locator(".webhook-preview pre").inner_text()
        page.screenshot(path=str(ARTIFACTS / "webhook-compose.png"), full_page=True)

        page.get_by_role("button", name="Test webhook").click()
        page.get_by_role("heading", name="Preview and test").wait_for(timeout=10_000)
        page.get_by_role("button", name="Send test").click()
        page.get_by_text("blocked", exact=False).wait_for(timeout=10_000)
        assert "WEBHOOK_DELIVERY_ENABLED" in page.locator(".webhook-test-result pre").inner_text()
        page.screenshot(path=str(ARTIFACTS / "webhook-test-blocked.png"))

        attempts = page.request.get(f"{BASE_URL}/api/campaigns/{campaign_id}/webhook-attempts").json()["data"]
        assert attempts[0]["outcome"] == "blocked"
        assert "e2e-secret" not in str(attempts)
        assert not browser_errors, browser_errors
        browser.close()


if __name__ == "__main__":
    main()
