"""Run with the webapp-testing with_server helper; see tests/README.md."""

import os
import re
from pathlib import Path
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
ARTIFACTS = Path("tests/artifacts")


def main() -> None:
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(
            headless=True,
            executable_path=os.environ.get("PLAYWRIGHT_CHROMIUM_EXECUTABLE"),
        )
        page = browser.new_page(viewport={"width": 1440, "height": 900})

        page.goto(f"{BASE_URL}/engagement/campaigns/campaigns?start=0&limit=12", wait_until="networkidle")
        assert page.get_by_role("heading", name="Campaigns").is_visible()
        page.screenshot(path=str(ARTIFACTS / "campaign-list.png"), full_page=True)

        campaigns = page.request.get(f"{BASE_URL}/api/campaigns").json()
        assert campaigns["total"] >= 4
        campaign_id = "cmp_e2e_email"
        created = page.request.post(f"{BASE_URL}/api/campaigns", data={
            "id": campaign_id,
            "name": "E2E Email Campaign",
            "channel": "email",
            "schedule": "One time",
            "audience": "New Users",
            "conversion": "Make Purchase",
            "subject": "E2E subject",
            "body": "E2E body",
        })
        assert created.ok, created.text()
        launched = page.request.post(f"{BASE_URL}/api/campaigns/{campaign_id}/launch")
        assert launched.ok, launched.text()
        assert launched.json()["run"]["delivered"] > 0

        page.goto(f"{BASE_URL}/engagement/campaigns/{campaign_id}?step=compose", wait_until="networkidle")
        page.get_by_text("Campaign Details").wait_for(timeout=10_000)
        assert page.get_by_text("Campaign Details").is_visible()
        assert page.get_by_text("Email Composer").is_visible()
        page.screenshot(path=str(ARTIFACTS / "email-compose.png"), full_page=True)

        page.goto(f"{BASE_URL}/engagement/campaigns/cmp_3d084f2b?step=compose", wait_until="networkidle")
        page.get_by_text("Email Composer").wait_for(timeout=10_000)
        page.get_by_role("button", name="Edit message").click()
        page.get_by_role("button", name="Personalization").first.click()
        page.get_by_role("dialog", name="Insert into HTML").get_by_role("button", name=re.compile("First name")).click()
        assert "first_name" in page.get_by_label("Email HTML source").input_value()
        page.get_by_role("button", name="Sending settings").click()
        page.get_by_role("heading", name="Sending Info").wait_for(timeout=10_000)
        page.get_by_label("From address (verified sending identity)").select_option(label="Thinkingai Marketing <marketing@thinkingai.com>")
        page.get_by_role("button", name="Done").click()
        page.get_by_role("heading", name="Sending info", exact=True).wait_for(timeout=10_000)
        assert page.get_by_text("Thinkingai Marketing <marketing@thinkingai.com>").is_visible()

        page.goto(f"{BASE_URL}/engagement/campaigns/cmp_iam?step=compose", wait_until="networkidle")
        page.get_by_role("heading", name="Message Composer").wait_for(timeout=10_000)
        assert page.get_by_label("Send To").input_value() == "Both Mobile Apps & Web Browsers"
        assert page.get_by_role("heading", name="Page Preview").is_visible()
        page.screenshot(path=str(ARTIFACTS / "in-app-compose.png"), full_page=True)
        page.get_by_role("button", name="Edit Message").click()
        page.get_by_role("tab", name="Compose").wait_for(timeout=10_000)
        assert page.get_by_text("Pages (1)").first.is_visible()
        page.get_by_role("button", name="Add Page").click()
        assert page.get_by_text("Pages (2)").first.is_visible()
        page.get_by_role("button", name="Drag Basic Modal").drag_to(page.get_by_test_id("iam-page-row").nth(1))
        reordered_pages = page.get_by_test_id("iam-page-row").all_inner_texts()
        assert reordered_pages[0].startswith("Page 2")
        assert reordered_pages[1].startswith("Basic Modal")
        page.get_by_title("Undo").click()
        assert page.get_by_test_id("iam-page-row").nth(0).inner_text().startswith("Basic Modal")
        page.get_by_role("tab", name="Settings").click()
        assert page.get_by_role("heading", name="Accessibility").is_visible()
        page.get_by_label("Accessibility language").select_option(label="Japanese")
        page.get_by_role("button", name="Add language with Liquid").click()
        assert page.get_by_label("Accessibility language").is_disabled()
        page.get_by_role("button", name="Add Liquid personalization").click()
        personalization = page.get_by_role("dialog", name="Add Personalization")
        personalization.get_by_label("Personalization type").select_option(label="Default Attributes")
        personalization.get_by_label("Liquid attribute").select_option(label="Language")
        personalization.get_by_label("Liquid default value").fill("en")
        page.screenshot(path=str(ARTIFACTS / "in-app-liquid-personalization.png"))
        personalization.get_by_role("button", name="Insert Liquid Snippet").click()
        assert page.get_by_label("Liquid language expression").input_value() == "{{${language} | default: 'en'}}"
        page.screenshot(path=str(ARTIFACTS / "in-app-liquid-settings.png"))
        liquid_status = page.get_by_text("Valid Liquid · Preview HTML language:", exact=False)
        assert liquid_status.is_visible()
        assert liquid_status.locator("b").inner_text() == "en"
        page.get_by_role("tab", name="Preview & Test").click()
        assert page.locator("article[lang='en']").count() == 1
        page.get_by_label("Add individual users").fill("user_1024")
        page.get_by_role("button", name="Send Test").click()
        assert page.get_by_text(re.compile("Test message simulated for user_1024")).is_visible()
        page.screenshot(path=str(ARTIFACTS / "in-app-preview-test.png"))
        page.get_by_role("button", name="Done").click()
        page.get_by_role("heading", name="Page Preview").wait_for(timeout=10_000)
        assert page.locator("article[lang='en']").count() >= 1
        page.get_by_role("button", name="Switch/convert to custom code").click()
        assert page.get_by_role("dialog", name="Switch to custom code?").is_visible()
        page.get_by_role("dialog", name="Switch to custom code?").get_by_role("button", name="Cancel").click()

        page.goto(f"{BASE_URL}/settings/message-activity-log", wait_until="networkidle")
        assert page.get_by_role("heading", name="Message Activity Log").is_visible()
        assert page.locator("tbody").get_by_text("delivered", exact=True).first.is_visible()

        report = page.request.get(f"{BASE_URL}/api/reports/overview?days=30").json()
        assert report["delivered"] > 0

        groups = page.request.get(f"{BASE_URL}/api/subscription-groups").json()["data"]
        promotions = next(group for group in groups if group["id"] == "sg_promotions")
        baseline = page.request.get(f"{BASE_URL}/api/audience/estimate?audience=All+Users&eligibility=subscribed&subscriptionGroupId={promotions['id']}").json()["reachable"]
        changed = page.request.patch(f"{BASE_URL}/api/subscription-groups/{promotions['id']}/members", data={"userId": "user_1", "state": "unsubscribed"})
        assert changed.ok
        after_unsubscribe = page.request.get(f"{BASE_URL}/api/audience/estimate?audience=All+Users&eligibility=subscribed&subscriptionGroupId={promotions['id']}").json()["reachable"]
        assert after_unsubscribe == baseline - 1
        restored = page.request.patch(f"{BASE_URL}/api/subscription-groups/{promotions['id']}/members", data={"userId": "user_1", "state": "subscribed"})
        assert restored.ok

        page.goto(f"{BASE_URL}/users/subscription_groups/6aa75e37db69160082adb7ae?locale=en", wait_until="networkidle")
        assert page.get_by_role("heading", name="Subscription Group Management").is_visible()
        page.get_by_text("Promotions", exact=True).wait_for(timeout=10_000)
        assert page.get_by_text("Promotions", exact=True).is_visible()
        page.screenshot(path=str(ARTIFACTS / "subscription-groups.png"), full_page=True)

        page.goto(f"{BASE_URL}/users/subscription_groups/preference_centers/6aa75e37db69160082adb7ae?locale=en", wait_until="networkidle")
        assert page.get_by_role("heading", name="Email Preference Centers").is_visible()
        page.screenshot(path=str(ARTIFACTS / "email-preference-centers.png"), full_page=True)
        browser.close()


if __name__ == "__main__":
    main()
