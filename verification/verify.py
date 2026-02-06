from playwright.sync_api import sync_playwright
import time

def run():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        context = browser.new_context()
        page = context.new_page()

        # 1. Navigate
        print("Navigating...")
        page.goto("http://localhost:3000")

        # 2. Wait for load
        print("Waiting for page load...")
        page.wait_for_timeout(3000) # Wait for Yjs and everything

        # 3. Check URL for room param
        url = page.url
        print(f"Current URL: {url}")
        if "room=" not in url:
            print("ERROR: Room ID not found in URL")

        # 4. Check for Share button
        try:
            share_btn = page.get_by_title("Copy link to share")
            share_btn.wait_for(state="visible", timeout=5000)
            print("Share button found.")
        except:
            print("ERROR: Share button not found")

        # 5. Screenshot
        page.screenshot(path="verification/screenshot.png")
        print("Screenshot saved.")

        browser.close()

if __name__ == "__main__":
    run()
