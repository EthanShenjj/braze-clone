"""Run with the webapp-testing with_server helper; see tests/README.md."""

from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = "http://127.0.0.1:3000"
ARTIFACTS = Path("tests/artifacts")


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto(f"{BASE_URL}/engagement/campaigns/campaigns?start=0&limit=12", wait_until="networkidle")
        assert page.get_by_role("heading", name="Campaigns").is_visible()
        page.screenshot(path=str(ARTIFACTS / "campaign-list.png"), full_page=True)

        campaigns = page.request.get(f"{BASE_URL}/api/campaigns").json()
        assert campaigns["total"] >= 4
        campaign_id = "cmp_e2e_email"
        page.request.post(f"{BASE_URL}/api/campaigns", data={
            "id": campaign_id,
            "name": "E2E Email Campaign",
            "channel": "email",
            "schedule": "One time",
            "audience": "New Users",
            "conversion": "Make Purchase",
            "subject": "E2E subject",
            "body": "E2E body",
        })
        launched = page.request.post(f"{BASE_URL}/api/campaigns/{campaign_id}/launch")
        assert launched.ok
        assert launched.json()["run"]["delivered"] > 0

        page.goto(f"{BASE_URL}/engagement/campaigns/{campaign_id}?step=compose", wait_until="networkidle")
        assert page.get_by_text("Campaign Details").is_visible()
        assert page.get_by_text("Email Composer").is_visible()
        page.screenshot(path=str(ARTIFACTS / "email-compose.png"), full_page=True)

        page.goto(f"{BASE_URL}/settings/message-activity-log", wait_until="networkidle")
        assert page.get_by_role("heading", name="Message Activity Log").is_visible()
        assert page.get_by_text("delivered").first.is_visible()

        report = page.request.get(f"{BASE_URL}/api/reports/overview?days=30").json()
        assert report["delivered"] > 0
        browser.close()


if __name__ == "__main__":
    main()
