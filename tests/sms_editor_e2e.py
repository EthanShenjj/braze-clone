"""SMS composer regression; run through the webapp-testing with_server helper."""

import os
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
        page.goto(
            f"{BASE_URL}/engagement/campaigns/cmp_sms_early_access?step=compose",
            wait_until="networkidle",
        )

        composer = page.get_by_label("SMS/MMS/RCS Composer")
        composer.get_by_role("heading", name="SMS/MMS/RCS Composer").wait_for()
        assert composer.get_by_text("Early Access", exact=True).is_visible()
        assert composer.get_by_label("Subscription Group").input_value() == "sg_sms_alerts"

        message = composer.get_by_label("Message")
        original = message.input_value()
        composer.get_by_role("button", name="Add Liquid").click()
        composer.get_by_role("button", name="{{${city}}}").click()
        assert message.input_value() == f"{original} {{{{${{city}}}}}}"

        composer.get_by_role("button", name="Add variant").click()
        assert composer.get_by_role("tab", name="Variant 2").is_visible()
        message.fill("Second variant")

        composer.get_by_role("button", name="Contact Card Generator").click()
        composer.get_by_label("Organization").fill("ThinkingData")
        assert composer.get_by_label("Organization").input_value() == "ThinkingData"

        composer.get_by_role("button", name="Test", exact=True).click()
        send_test = composer.get_by_role("button", name="Send test")
        assert send_test.is_disabled()
        composer.get_by_label("Phone number").fill("+1 555 000 0000")
        assert send_test.is_enabled()

        page.screenshot(path=str(ARTIFACTS / "sms-compose.png"), full_page=True)
        browser.close()


if __name__ == "__main__":
    main()
