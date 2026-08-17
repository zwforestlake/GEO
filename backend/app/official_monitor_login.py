import argparse
from pathlib import Path

from playwright.sync_api import sync_playwright


PLATFORM_URLS = {
    "chatgpt": "https://chatgpt.com/",
    "deepseek": "https://chat.deepseek.com/",
    "doubao": "https://www.doubao.com/",
    "hunyuan": "https://hunyuan.tencent.com/",
    "claude": "https://claude.ai/",
}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", required=True, choices=PLATFORM_URLS.keys())
    parser.add_argument("--profile-dir", required=True)
    args = parser.parse_args()
    profile_dir = Path(args.profile_dir)
    profile_dir.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=False,
            viewport={"width": 1280, "height": 900},
        )
        page = context.pages[0] if context.pages else context.new_page()
        page.goto(PLATFORM_URLS[args.platform], wait_until="domcontentloaded", timeout=60000)
        print("请在浏览器窗口中完成登录。登录完成后关闭整个浏览器窗口。")
        try:
            context.pages[0].wait_for_timeout(24 * 60 * 60 * 1000)
        except Exception:
            pass
        finally:
            try:
                context.close()
            except Exception:
                pass


if __name__ == "__main__":
    main()
