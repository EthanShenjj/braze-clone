"""One-off check for the completeness fixes: push test preview, IAM test entry, GCG cancel, custom events refresh."""
import os
from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("BASE_URL", "http://127.0.0.1:3100")

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1440, "height": 900})

    # 1. Push campaign: Preview and test modal now renders a push preview.
    page.goto(f"{BASE_URL}/engagement/campaigns/cmp_push_primer?locale=en&step=compose", wait_until="networkidle")
    page.get_by_role("button", name="Preview and test").first.click()
    modal = page.locator("section[class*=testModal]").first
    modal.wait_for(timeout=15000)
    body = modal.inner_text()
    assert "Preview as" in body and "Send test" in body, body
    assert "now" in body, f"push notification preview missing: {body}"
    page.locator("section[class*=testModal] button[aria-label=Close]").click()
    print("push test preview: OK")

    # 2. IAM campaign: Preview and test entry exists on the compose page.
    page.goto(f"{BASE_URL}/engagement/campaigns/cmp_iam?locale=en&step=compose", wait_until="networkidle")
    iam_test = page.get_by_role("button", name="Preview and test").first
    assert iam_test.is_visible(), "IAM preview-and-test entry missing"
    iam_test.click()
    page.locator("section[class*=testModal]").first.wait_for(timeout=15000)
    page.locator("section[class*=testModal] button[aria-label=Close]").click()
    print("IAM test entry + preview: OK")

    # 3. Global Control Group: Cancel reverts edits.
    page.goto(f"{BASE_URL}/audience/global-control-group?locale=en", wait_until="networkidle")
    percent = page.get_by_label("Global Control Group percentage")
    percent.fill("9")
    page.get_by_role("button", name="Cancel").click()
    assert percent.input_value() == "5", f"cancel did not revert: {percent.input_value()}"
    print("GCG cancel revert: OK")

    # 4. Custom Events: Refresh button re-fetches (no crash, stays on page).
    page.goto(f"{BASE_URL}/data/custom-events?locale=en", wait_until="networkidle")
    page.get_by_role("button", name="Refresh").click()
    page.wait_for_timeout(800)
    assert page.get_by_role("button", name="Refresh").is_visible()
    print("custom events refresh: OK")

    # 5. Import Users actually writes users.
    page.goto(f"{BASE_URL}/audience/import-users?locale=en", wait_until="networkidle")
    page.get_by_role("button", name="Run import").click()
    page.get_by_text("Imported 2 new users").wait_for(timeout=15000)
    page.goto(f"{BASE_URL}/audience/search-users?locale=en", wait_until="networkidle")
    page.get_by_placeholder("Search by external ID, email, or name").fill("user_9002")
    page.locator("form button[type=submit]").first.click()
    page.wait_for_timeout(1500)
    assert page.get_by_text("user_9002").first.is_visible(), "imported user not searchable"
    print("import users -> searchable: OK")

    browser.close()
print("completeness checks passed")
