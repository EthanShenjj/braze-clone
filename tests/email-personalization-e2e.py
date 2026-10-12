"""Browser regression coverage for the Braze-style email personalization panel."""

import os
from uuid import uuid4

from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:3100")


def main() -> None:
    campaign_id = f"cmp_e2e_personalization_{uuid4().hex[:8]}"
    mjml = (
        "<mjml><mj-head></mj-head><mj-body><mj-section><mj-column>"
        '<mj-text padding="10px">Add your message here.</mj-text>'
        "</mj-column></mj-section></mj-body></mjml>"
    )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1440, "height": 900})
        created = page.request.post(
            f"{BASE_URL}/api/campaigns",
            data={
                "id": campaign_id,
                "name": "Personalization panel regression",
                "channel": "email",
                "status": "Draft",
                "schedule": "One time",
                "audience": "All Users",
                "conversion": "Make Purchase",
                "subject": "Personalization regression",
                "body": "Add your message here.",
                "config": {
                    "emailEditorMode": "drag",
                    "emailEditorEngine": "grapesjs-mjml",
                    "emailGrapesSchemaVersion": 1,
                    "emailMjml": mjml,
                    "variants": [{"id": "var_1", "name": "Variant 1"}],
                },
            },
        )
        assert created.ok, created.text()

        try:
            page.goto(f"{BASE_URL}/engagement/campaigns/{campaign_id}?step=compose", wait_until="networkidle")
            page.get_by_role("button", name="Edit message").click()
            page.get_by_role("button", name="Personalization", exact=True).click()
            panel = page.get_by_role("dialog", name="Add Personalization")
            panel.wait_for(timeout=15_000)

            personalization_type = panel.get_by_label("Personalization type")
            assert len(personalization_type.locator("option").all()) == 18
            personalization_type.select_option(label="Custom Attributes")

            attribute = panel.get_by_label("Attribute")
            attribute.click()
            option = panel.locator("button[role='option']").first
            option.wait_for(timeout=10_000)
            selected_attribute = option.inner_text()
            option.click()
            panel.get_by_label("Default value").fill("fallback")

            expected = "{{custom_attribute.${" + selected_attribute + "} | default: 'fallback'}}"
            assert panel.locator("code").inner_text() == expected
            assert panel.get_by_role("button", name="Copy Liquid snippet").is_enabled()
            panel.get_by_role("button", name="Insert into message").click()

            canvas = page.frame_locator(".gjs-frame")
            assert expected in canvas.locator("body").inner_text()
            assert canvas.get_by_text("This page contains the following errors:").count() == 0
        finally:
            page.request.delete(f"{BASE_URL}/api/campaigns/{campaign_id}")
            browser.close()


if __name__ == "__main__":
    main()
