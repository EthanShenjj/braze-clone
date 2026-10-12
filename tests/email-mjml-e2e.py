"""Regression coverage for multiline Liquid insertion in the GrapesJS MJML editor."""

import os
from uuid import uuid4
from playwright.sync_api import sync_playwright


BASE_URL = os.environ.get("BASE_URL", "http://localhost:3100")


def main() -> None:
    campaign_id = f"cmp_e2e_mjml_{uuid4().hex[:8]}"
    legacy_mjml = (
        '<mjml><mj-head></mj-head><mj-body><mj-section><mj-column>'
        '<mj-text>Legacy line one<br>Legacy line two</mj-text>'
        '</mj-column></mj-section></mj-body></mjml>'
    )

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1600, "height": 1000})
        created = page.request.post(
            f"{BASE_URL}/api/campaigns",
            data={
                "id": campaign_id,
                "name": "MJML line break regression",
                "channel": "email",
                "status": "Draft",
                "schedule": "One time",
                "audience": "All Users",
                "conversion": "Make Purchase",
                "subject": "MJML regression",
                "body": "Legacy line one\nLegacy line two",
                "config": {
                    "emailEditorMode": "drag",
                    "emailEditorEngine": "grapesjs-mjml",
                    "emailGrapesSchemaVersion": 1,
                    "emailMjml": legacy_mjml,
                    "variants": [{"id": "var_1", "name": "Variant 1"}],
                },
            },
        )
        assert created.ok, created.text()

        try:
            page.goto(f"{BASE_URL}/engagement/campaigns/{campaign_id}?step=compose", wait_until="networkidle")
            page.get_by_role("heading", name="Email Composer").wait_for(timeout=15_000)
            page.get_by_role("button", name="Edit message").click()
            page.get_by_role("button", name="Personalization").wait_for(timeout=15_000)

            canvas = page.frame_locator("iframe").first
            assert canvas.get_by_text("This page contains the following errors:").count() == 0
            assert canvas.locator("parsererror").count() == 0

            canvas.get_by_text("Legacy line one", exact=False).dblclick()
            editable = canvas.locator("[contenteditable='true']").first
            editable.wait_for()
            editable.click()
            page.keyboard.press("End")

            page.get_by_role("button", name="Personalization").click()
            page.get_by_label("Personalization type").select_option(label="Catalog Items")
            page.get_by_label("Catalog name").select_option(label="Featured collection")
            catalog_items = page.locator("fieldset").filter(has_text="Catalog items")
            item_checkboxes = catalog_items.locator('input[type="checkbox"]')
            item_checkboxes.first.wait_for()
            assert item_checkboxes.count() >= 3
            for index in range(3):
                item_checkboxes.nth(index).check()
            fields = page.locator("fieldset").filter(has_text="Fields")
            field_checkboxes = fields.locator('input[type="checkbox"]')
            field_checkboxes.first.wait_for()
            assert field_checkboxes.count() >= 4
            for index in range(4):
                field_checkboxes.nth(index).check()
            page.get_by_role("button", name="Insert into message").click()
            page.wait_for_timeout(750)

            assert canvas.get_by_text("This page contains the following errors:").count() == 0
            assert canvas.locator("parsererror").count() == 0
            page.get_by_role("button", name="Done").click()
            page.get_by_role("heading", name="Email Composer").wait_for(timeout=15_000)

            saved = page.request.get(f"{BASE_URL}/api/campaigns/{campaign_id}").json()
            mjml = saved["config"]["emailMjml"]
            assert "<br />" in mjml
            assert "<br>" not in mjml
        finally:
            page.request.delete(f"{BASE_URL}/api/campaigns/{campaign_id}")
            browser.close()


if __name__ == "__main__":
    main()
