import argparse
import json
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


PLATFORMS = {
    "chatgpt": {
        "label": "ChatGPT",
        "url": "https://chatgpt.com/",
        "prompt_selector": "textarea, #prompt-textarea",
        "logged_out_markers": ["Log in", "Sign up"],
        "answer_selector": "main article",
        "excluded_hosts": ["chatgpt.com", "openai.com"],
    },
    "deepseek": {
        "label": "DeepSeek",
        "url": "https://chat.deepseek.com/",
        "prompt_selector": "textarea",
        "logged_out_markers": ["登录", "手机号登录", "Login"],
        "answer_selector": "main, .ds-markdown",
        "excluded_hosts": ["chat.deepseek.com", "deepseek.com"],
    },
}


def normalize_source(url: str, title: str, text: str, rank: int) -> dict:
    host = url.split("://", 1)[-1].split("/", 1)[0].lower()
    parts = [part for part in host.split(".") if part]
    root = ".".join(parts[-2:]) if len(parts) >= 2 else host
    if host.endswith("mp.weixin.qq.com"):
        source_type = "wechat"
    elif host.endswith("baike.baidu.com") or "wikipedia.org" in host:
        source_type = "encyclopedia"
    elif "douyin.com" in host:
        source_type = "short_video"
    elif any(media in host for media in ["qq.com", "sina.cn", "ifeng.com", "163.com", "sohu.com"]):
        source_type = "news_media"
    else:
        source_type = "official_site" if "." in host else "unknown"
    return {
        "title": title or url,
        "url": url,
        "normalized_url": url,
        "domain": host,
        "root_domain": root,
        "source_type": source_type,
        "rank_index": rank,
        "display_text": text,
    }


def page_text(page) -> str:
    try:
        return page.locator("body").inner_text(timeout=5000)
    except Exception:
        return ""


def login_required(page, markers: list[str], prompt_selector: str) -> bool:
    try:
        if page.locator(prompt_selector).count() > 0:
            return False
    except Exception:
        pass
    body = page_text(page)
    return any(marker.lower() in body.lower() for marker in markers)


def blocked_by_challenge(page) -> bool:
    title = (page.title() or "").lower()
    body = page_text(page).lower()
    return any(marker in title or marker in body for marker in ["just a moment", "verify you are human", "checking your browser", "security verification"])


def extract_links(page, answer_selector: str, excluded_hosts: list[str]) -> list[dict]:
    container = page.locator(answer_selector).last
    anchors = container.locator("a[href^='http']") if container.count() else page.locator("a[href^='http']")
    seen = set()
    rows = []
    count = min(anchors.count(), 30)
    for index in range(count):
        anchor = anchors.nth(index)
        try:
            href = (anchor.get_attribute("href") or "").strip()
            title = " ".join((anchor.inner_text(timeout=1500) or "").split())
        except Exception:
            continue
        if not href or href in seen:
            continue
        host = href.split("://", 1)[-1].split("/", 1)[0].lower()
        if any(host == excluded or host.endswith("." + excluded) for excluded in excluded_hosts):
            continue
        seen.add(href)
        rows.append(normalize_source(href, title[:220], title[:500], len(rows) + 1))
    return rows


def wait_for_answer(page):
    page.wait_for_timeout(5000)
    for _ in range(10):
        body = page_text(page)
        if body and any(token in body for token in ["来源", "参考", "source", "引用", "海云端"]):
            return
        page.wait_for_timeout(1500)


def submit_query(page, selector: str, keyword: str):
    area = page.locator(selector).first
    area.click(timeout=8000)
    area.fill(keyword, timeout=8000)
    area.press("Enter")


def run(platform: str, keyword: str, task_code: str, profile_dir: Path, artifact_dir: Path) -> dict:
    if platform not in PLATFORMS:
        return {"status": "failed", "message": f"暂不支持平台：{platform}", "sources": [], "answer_text": "", "screenshot_path": ""}
    meta = PLATFORMS[platform]
    artifact_dir.mkdir(parents=True, exist_ok=True)
    profile_dir.mkdir(parents=True, exist_ok=True)
    screenshot_path = artifact_dir / f"{task_code}-{platform}.png"
    with sync_playwright() as playwright:
        context = playwright.chromium.launch_persistent_context(
            user_data_dir=str(profile_dir),
            headless=True,
            viewport={"width": 1440, "height": 1080},
        )
        page = context.pages[0] if context.pages else context.new_page()
        try:
            page.goto(meta["url"], wait_until="domcontentloaded", timeout=60000)
            page.wait_for_timeout(3000)
            if blocked_by_challenge(page):
                page.screenshot(path=str(screenshot_path), full_page=True)
                return {
                    "status": "blocked_by_challenge",
                    "message": f"{meta['label']} 返回平台风控/人机验证页，需要使用人工登录后的真实 Chrome 会话。",
                    "sources": [],
                    "answer_text": f"{meta['label']} 当前被平台风控或人机验证拦截，系统已保留截图，未把候选搜索结果冒充为官方引用。",
                    "screenshot_path": str(screenshot_path),
                }
            if login_required(page, meta["logged_out_markers"], meta["prompt_selector"]):
                page.screenshot(path=str(screenshot_path), full_page=True)
                return {
                    "status": "login_required",
                    "message": f"{meta['label']} 当前未登录，请先在浏览器 profile 中完成登录。",
                    "sources": [],
                    "answer_text": f"{meta['label']} 当前未登录，系统已保留浏览器截图与登录入口，等待人工登录后重试。",
                    "screenshot_path": str(screenshot_path),
                }
            submit_query(page, meta["prompt_selector"], keyword)
            wait_for_answer(page)
            page.screenshot(path=str(screenshot_path), full_page=True)
            body = page_text(page)
            sources = extract_links(page, meta["answer_selector"], meta["excluded_hosts"])
            return {
                "status": "completed",
                "message": f"{meta['label']} 网页端抓取完成",
                "sources": sources,
                "answer_text": body[:4000],
                "screenshot_path": str(screenshot_path),
            }
        except PlaywrightTimeoutError as error:
            page.screenshot(path=str(screenshot_path), full_page=True)
            return {
                "status": "failed",
                "message": f"{meta['label']} 页面操作超时：{error}",
                "sources": [],
                "answer_text": "",
                "screenshot_path": str(screenshot_path),
            }
        finally:
            context.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--platform", required=True)
    parser.add_argument("--keyword", required=True)
    parser.add_argument("--task-code", required=True)
    parser.add_argument("--profile-dir", required=True)
    parser.add_argument("--artifact-dir", required=True)
    args = parser.parse_args()
    result = run(args.platform, args.keyword, args.task_code, Path(args.profile_dir), Path(args.artifact_dir))
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
