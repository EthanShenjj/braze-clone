"""One-off check: the sending-settings icon rail switches to Content editor and Preview & Test."""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3000")
CAMPAIGN = "cmp_3d084f2b"

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})
    page.goto(f"{BASE_URL}/engagement/campaigns/{CAMPAIGN}?locale=en&step=compose", wait_until="networkidle")

    # Open the sending-info editor from the compose page.
    page.get_by_role("button", name="Edit sending info").click()
    rail = page.locator("nav[aria-label='Email editor sections']")
    rail.wait_for()
    buttons = rail.locator("button")
    assert buttons.count() == 3, buttons.count()

    # Icon 2 (file-code) -> Content editor opens in place of the sending form.
    buttons.nth(1).click()
    content = page.locator("section[aria-label='HTML code editor'], section[aria-label='Braze drag-and-drop email editor']").first
    content.wait_for(timeout=15000)
    print("content editor opened from rail: OK")

    # Back to sending settings via the content editor's envelope / sending settings control.
    content.get_by_role("button", name="Sending settings").first.click()
    page.get_by_role("heading", name="Sending Info").wait_for(timeout=15000)
    print("back to sending info from content editor: OK")

    # Icon 3 (eye) -> Preview & Test modal opens.
    rail.locator("button").nth(2).click()
    page.get_by_role("button", name="Close").first.wait_for(timeout=15000)
    print("preview & test opened from rail: OK")

    browser.close()
print("rail checks passed")
