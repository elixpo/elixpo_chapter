"""OreoLook's public Hugging Face Space."""
from __future__ import annotations

import html
import os
import re
import time

import spaces
import gradio as gr

from oreolook_client import (
    OreoLookAPIError,
    begin_device_authorization,
    extract_links,
    poll_device_authorization,
    stream_completion,
    verification_url_with_code,
)


SITE_URL = os.getenv("OREOLOOK_SITE_URL", "https://search.elixpo.com")
APP_KEY = os.getenv("OREOLOOK_APP_KEY", "").strip()
SPACE_URL = os.getenv("OREOLOOK_SPACE_URL", "https://huggingface.co/spaces/Elixpo/OreoLook")
OG_IMAGE_URL = os.getenv("OREOLOOK_OG_IMAGE_URL", f"{SITE_URL}/og-image.png")
PAPER_URL = "https://arxiv.org/abs/2609.05463"
HF_PAPER_URL = "https://huggingface.co/papers/2609.05463"

SEO_HEAD = f"""
<meta name="description" content="OreoLook is an open-source AI search and deep research agent with live web results, grounded citations, streaming answers, follow-up memory, and downloadable PDF reports.">
<meta name="keywords" content="AI search engine, deep research agent, web search AI, cited answers, PDF research reports, LLM web search caching, commodity CPU inference, Pollinations AI, OreoLook, arXiv 2609.05463">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
<meta name="application-name" content="OreoLook">
<meta name="theme-color" content="#f7f5f0">
<link rel="canonical" href="{SPACE_URL}">
<link rel="icon" href="{SITE_URL}/favicon.png" type="image/png">
<meta property="og:type" content="website">
<meta property="og:site_name" content="OreoLook">
<meta property="og:title" content="OreoLook — AI Search & Deep Research with Receipts">
<meta property="og:description" content="Search the live web, investigate topics deeply, verify claims with citations, and export polished PDF research reports.">
<meta property="og:url" content="{SPACE_URL}">
<meta property="og:image" content="{OG_IMAGE_URL}">
<meta property="og:image:alt" content="OreoLook AI search and deep research agent">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="OreoLook — AI Search with Receipts">
<meta name="twitter:description" content="Live web search, cited deep research, streaming answers, and downloadable PDF reports.">
<meta name="twitter:image" content="{OG_IMAGE_URL}">
<script type="application/ld+json">
{{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "OreoLook",
  "alternateName": "OreoLook AI Search",
  "applicationCategory": "ResearchApplication",
  "operatingSystem": "Web",
  "url": "{SPACE_URL}",
  "image": "{OG_IMAGE_URL}",
  "description": "Open-source AI search and deep research agent with live sources, citations, follow-up memory, and PDF report generation.",
  "isAccessibleForFree": true,
  "license": "https://opensource.org/licenses/MIT",
  "creator": [
    {{"@type": "Person", "name": "Ayushman Bhattacharya"}},
    {{"@type": "Person", "name": "Nihal Gazi", "url": "https://nihalgazi.com"}}
  ],
  "publisher": {{"@type": "Organization", "name": "Pollinations AI", "url": "https://pollinations.ai"}},
  "citation": "{PAPER_URL}",
  "codeRepository": "https://github.com/pollinations/search.elixpo"
}}
</script>
"""

APP_JS = """
() => {
  document.addEventListener("keydown", (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key !== "Enter") return;
    if (!event.target.closest("#research-prompt")) return;
    event.preventDefault();
    const send = document.querySelector("#research-send button")
      || document.getElementById("research-send");
    if (send && !send.disabled) send.click();
  });
  document.addEventListener("click", (event) => {
    const hint = event.target.closest(".empty-connect");
    if (!hint) return;
    event.preventDefault();
    const connect = document.querySelector("#pollinations-connect button")
      || document.getElementById("pollinations-connect");
    if (connect && !connect.disabled) connect.click();
  });
}
"""

EMPTY_CHAT = """
<div class="empty-chat">
  <span>✦</span>
  <strong>What should we uncover?</strong>
  <p>Search fresh sources, compare the evidence, or create a polished PDF.</p>
  <button type="button" class="empty-connect">Connect with Pollinations to begin</button>
  <small>Ctrl + Enter to send</small>
</div>
"""


@spaces.GPU(duration=1)
def _zerogpu_runtime_contract():
    """ZeroGPU startup contract for a free API-proxy Space; intentionally never called."""
    return None


CSS = """
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,500;6..72,600&display=swap');
:root{--canvas:#f7f5f0;--paper:#fffdf9;--paper-2:#f1eee8;--ink:#2f2b27;--muted:#756f67;--line:#ded9d0;--accent:#c15f3c;--accent-dark:#9d472a;--accent-soft:#f8e9e1;--sage:#52705d;--shadow:0 18px 52px rgba(58,45,34,.08)}
.gradio-container,.dark .gradio-container{
  color-scheme:light!important;min-height:100vh!important;max-width:none!important;padding:0!important;
  font-family:'DM Sans',ui-sans-serif,system-ui,sans-serif!important;color:var(--ink)!important;background:var(--canvas)!important;
  --body-background-fill:var(--canvas)!important;--body-text-color:var(--ink)!important;--body-text-color-subdued:var(--muted)!important;
  --background-fill-primary:var(--paper)!important;--background-fill-secondary:var(--paper-2)!important;
  --block-background-fill:var(--paper)!important;--block-border-color:var(--line)!important;--block-label-text-color:var(--muted)!important;
  --input-background-fill:var(--paper)!important;--input-border-color:var(--line)!important;--input-placeholder-color:#9b958d!important;
  --button-primary-background-fill:var(--accent)!important;--button-primary-background-fill-hover:var(--accent-dark)!important;
  --button-primary-text-color:#fff!important;--button-secondary-background-fill:var(--paper)!important;--button-secondary-text-color:var(--ink)!important;
  --border-color-primary:var(--line)!important;--shadow-drop:var(--shadow)!important
}
.gradio-container>main,.gradio-container main,.gradio-container .main,.gradio-container .contain,.gradio-container .fill-width{max-width:none!important;width:100%!important;margin:0!important;padding-left:0!important;padding-right:0!important}
.site-header{background:rgba(255,253,249,.94)!important;border:0!important;border-bottom:1px solid var(--line)!important;padding:0!important;position:sticky!important;top:0!important;z-index:20!important;backdrop-filter:blur(18px)}
.topbar{width:min(1240px,calc(100% - 48px));margin:0 auto;min-height:54px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center}.brand{display:flex;align-items:center;gap:9px;color:var(--ink)}
.brand img{width:31px;height:31px;border-radius:9px;box-shadow:0 4px 12px rgba(47,43,39,.13)}.brand strong{display:block;font-size:15px;letter-spacing:-.025em}.brand small{display:block;color:var(--muted);font-size:8px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;margin-top:1px}
.toplinks{display:flex;align-items:center;justify-self:center;gap:5px}.toplinks a{color:var(--muted)!important;font-size:11px;font-weight:650;text-decoration:none!important;padding:6px 9px;border-radius:8px}.toplinks a:hover{background:var(--paper-2);color:var(--ink)!important}
.hero-wrap{background:transparent!important;border:0!important;padding:0!important}.hero{width:min(1240px,calc(100% - 48px));margin:0 auto;padding:34px 0 50px;border-top:1px solid var(--line);display:grid;grid-template-columns:minmax(280px,.8fr) minmax(320px,1.2fr);gap:70px;align-items:start}.eyebrow{color:var(--accent);font-size:11px;font-weight:800;letter-spacing:.13em;text-transform:uppercase}
.hero h1{font:600 clamp(34px,4vw,52px)/1.02 'Newsreader',Georgia,serif;letter-spacing:-.045em;color:var(--ink);margin:9px 0 0}.hero h1 em{color:var(--accent);font-style:normal}.hero p{color:var(--muted);font-size:16px;line-height:1.7;max-width:650px;margin:2px 0 0}
.workspace{width:min(1240px,calc(100% - 48px))!important;max-width:1240px!important;margin:0 auto!important;padding:14px 0 26px!important;gap:20px!important;align-items:flex-start!important}
.chat-card,.panel{background:var(--paper)!important;border:1px solid var(--line)!important;border-radius:18px!important;box-shadow:var(--shadow)!important}.chat-card{height:auto!important;padding:6px!important;overflow:hidden!important;border-radius:20px!important;position:relative!important;display:flex!important;flex-direction:column!important;gap:0!important}.panel{padding:16px!important;box-shadow:0 9px 32px rgba(58,45,34,.055)!important}
.panel h3,.panel h4,.panel strong,.panel label,.panel span,.panel p{color:var(--ink)!important}.panel h3{font:600 20px 'Newsreader',Georgia,serif!important;margin:0 0 4px!important}.panel-copy{color:var(--muted);font-size:12px;line-height:1.55;margin-bottom:12px}
.chat-heading{display:flex;align-items:center;justify-content:space-between;gap:18px;padding:4px 8px 8px;border-bottom:1px solid var(--line)}.chat-heading strong{display:block;color:var(--ink);font:600 19px 'Newsreader',Georgia,serif}.chat-heading span{display:block;color:var(--muted);font-size:11px;margin-top:2px}.chat-heading small{color:var(--sage);background:#edf3ee;border:1px solid #d7e4da;border-radius:999px;padding:5px 8px;font-size:10px;font-weight:700;white-space:nowrap}
.chatbot,.chatbot>div{background:var(--paper)!important;border:0!important;color:var(--ink)!important}.chatbot{height:clamp(300px,calc(100dvh - 500px),410px)!important;min-height:300px!important;max-height:410px!important;overflow:hidden!important;overscroll-behavior:contain}.chatbot .message{border-radius:16px!important;box-shadow:none!important;font-size:14px!important;line-height:1.6!important}.chatbot .message.user{background:#37322d!important;color:#fff!important}.chatbot .message.user *{color:#fff!important}.chatbot .message.user code{background:#514b45!important;color:#fff!important}.chatbot .message.user a{color:#fff4e9!important;text-decoration:underline!important}.chatbot .message.bot,.chatbot .message.bot *{color:var(--ink)!important}.chatbot .message.bot{background:var(--paper-2)!important;border:1px solid var(--line)!important}.chatbot .message.bot code{background:#e7e2da!important}.chatbot .message.bot a{color:var(--accent-dark)!important}
.empty-chat{align-items:center;box-sizing:border-box;color:var(--muted);display:flex;flex-direction:column;justify-content:center;margin:0 auto;min-height:280px;max-width:430px;padding:34px 24px;text-align:center;width:100%}.empty-chat>span{align-items:center;background:var(--accent-soft);border:1px solid #ebc8b8;border-radius:14px;color:var(--accent);display:flex;font-size:22px;height:48px;justify-content:center;margin:0 auto 14px;width:48px}.empty-chat strong{color:var(--ink)!important;display:block;font:600 23px 'Newsreader',Georgia,serif;margin-bottom:7px;text-align:center}.empty-chat p{font-size:12px;line-height:1.55;margin:0 auto;max-width:360px;text-align:center}.empty-chat small{color:#999188;display:block;font-size:10px;font-weight:700;margin-top:13px;text-transform:uppercase;letter-spacing:.06em}.empty-connect{background:transparent;border:0;color:var(--accent-dark);cursor:pointer;font:700 12px 'DM Sans',sans-serif;margin-top:13px;padding:3px 6px;text-decoration:underline;text-underline-offset:3px}.empty-connect:hover{color:var(--accent)}
.research-trail{background:#f8f5ef;border:1px solid var(--line);border-radius:11px;margin:0 0 12px;padding:9px 11px}.research-trail summary{color:var(--accent-dark);cursor:pointer;font-size:11px;font-weight:800;list-style:none}.research-trail summary::-webkit-details-marker{display:none}.research-trail ul{color:var(--muted);font-size:11px;line-height:1.55;margin:8px 0 1px;padding-left:18px}
.composer-row{align-items:stretch!important;z-index:8!important;background:var(--paper)!important;border-top:1px solid var(--line)!important;padding:6px 2px 1px!important;gap:8px!important}.composer{border:0!important;background:transparent!important;min-height:48px!important}.composer textarea{box-sizing:border-box!important;font-size:14px!important;line-height:1.45!important;background:#f8f6f1!important;color:var(--ink)!important;border:1px solid var(--line)!important;border-radius:12px!important;height:48px!important;min-height:48px!important;padding:12px!important}.send-btn{align-self:stretch!important;height:48px!important;min-height:48px!important;min-width:122px!important;border:0!important;border-radius:12px!important;background:var(--accent)!important;color:#fff!important;font-weight:700!important;box-shadow:none!important}.send-btn:hover{background:var(--accent-dark)!important}
.new-btn{border:1px solid var(--line)!important;border-radius:12px!important;color:var(--ink)!important;background:var(--paper)!important;font-weight:700!important}.new-btn:hover{border-color:#bcb4a9!important;background:var(--paper-2)!important}
.oauth-status{background:var(--paper)!important;border:1px solid var(--line)!important;border-radius:12px!important;padding:11px 12px!important}.oauth-status p{font-size:12px!important;line-height:1.5!important;margin:0!important}.oauth-actions,.oauth-actions>div,.oauth-actions .block,.oauth-actions .form{background:transparent!important;border:0!important;box-shadow:none!important;padding:0!important}.oauth-actions{display:flex!important;flex-direction:column!important;gap:8px!important;margin-top:9px!important;overflow:visible!important}.oauth-actions>*{flex:0 0 auto!important;width:100%!important}.oauth-actions button,.oauth-connect,.oauth-disconnect{border-radius:12px!important;overflow:hidden!important}.oauth-connect{background:var(--accent)!important;color:#fff!important;border:1px solid var(--accent)!important;font-weight:700!important}.oauth-connect:hover{background:var(--accent-dark)!important}.oauth-connect:disabled{background:var(--paper)!important;border-color:var(--line)!important;color:var(--muted)!important;opacity:1!important}.oauth-disconnect{margin-top:0!important;background:var(--paper)!important;color:var(--muted)!important;border:1px solid var(--line)!important}.oauth-disconnect:hover{background:var(--paper-2)!important;color:var(--ink)!important}.oauth-disconnect:disabled{background:var(--paper)!important;color:#aaa39b!important;opacity:1!important}
.secondary-card{background:var(--paper)!important;border:1px solid var(--line)!important;border-radius:14px!important;box-shadow:0 7px 22px rgba(58,45,34,.04)!important;overflow:hidden!important}.secondary-card>button{padding:13px 15px!important;color:var(--ink)!important;font-weight:700!important}.secondary-card [class*="content"]{padding:0 14px 14px!important}
.source-panel a,.artifact-panel a{display:block;background:#f8f6f1;border:1px solid var(--line);border-radius:11px;color:var(--ink)!important;margin:8px 0;padding:11px 12px;text-decoration:none!important;font-size:12px;font-weight:650;overflow-wrap:anywhere}.source-panel a:hover{border-color:#bdb4aa;background:#fff}.artifact-panel a{background:var(--accent-soft);border-color:#e7baa7;color:var(--accent-dark)!important}
.feature-list{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:11px}.feature-list span{background:#f5f2ec;border:1px solid var(--line);border-radius:9px;padding:9px 10px;color:var(--muted)!important;font-size:11px;font-weight:600}
#examples{border:0!important;background:transparent!important;margin:4px 2px 1px!important;padding:0!important}#examples>div:first-child{display:none!important}#examples button{background:var(--paper-2)!important;border:1px solid var(--line)!important;border-radius:999px!important;color:var(--muted)!important;font-size:10px!important;padding:5px 10px!important}#examples button:hover{border-color:#bdb4aa!important;color:var(--ink)!important;background:var(--paper)!important}
.footer-note{text-align:center;color:#928b82;font-size:11px;padding:0 20px 28px}.footer-note a{color:var(--accent-dark)!important;text-decoration:none!important;font-weight:700}
.paper-citation{width:min(1240px,calc(100% - 48px));margin:0 auto 18px;padding:13px 16px;border:1px solid var(--line);border-radius:14px;background:var(--paper);color:var(--muted);font-size:11px;line-height:1.55;text-align:center}.paper-citation strong{color:var(--ink)}.paper-citation a{color:var(--accent-dark)!important;font-weight:700;text-decoration:none!important}.paper-citation a:hover{text-decoration:underline!important}
@media(max-width:960px){.workspace{flex-direction:column!important}.workspace>div{width:100%!important;min-width:0!important}.research-rail{display:grid!important;grid-template-columns:1fr 1fr!important}.hero{grid-template-columns:1fr;gap:18px}.hero h1{font-size:44px}}
@media(max-width:640px){.topbar,.hero,.workspace{width:calc(100% - 26px)!important}.topbar{min-height:50px;display:flex;justify-content:space-between}.brand small{display:none}.toplinks a{padding:6px}.toplinks a:not(:first-child){display:none}.workspace{padding-top:8px!important}.hero{padding:28px 0 34px}.hero h1{font-size:37px}.hero p{font-size:14px}.research-rail{display:flex!important}.chatbot{height:300px!important;min-height:300px!important;max-height:300px!important}.chat-heading small{display:none}.send-btn{min-width:82px!important}.composer-row{align-items:stretch!important}.feature-list{grid-template-columns:1fr}}
"""


def _sources_markdown(answer: str) -> tuple[str, str]:
    sources, artifacts = extract_links(answer)
    source_lines = ["### Sources"]
    source_lines.extend(
        f"[{html.escape(label[:90])}]({url})" for label, url in sources[:12]
    )
    artifact_lines = ["### Downloads"]
    artifact_lines.extend(
        f"[Download PDF {index}]({url})" for index, url in enumerate(artifacts[:6], 1)
    )
    if len(source_lines) == 1:
        source_lines.append("Sources will appear here when OreoLook cites them.")
    if len(artifact_lines) == 1:
        artifact_lines.append("Generated reports will appear here as download links.")
    return "\n\n".join(source_lines), "\n\n".join(artifact_lines)


_RESEARCH_TRAIL = re.compile(
    r'<details class="research-trail"[^>]*>.*?</details>\s*',
    flags=re.IGNORECASE | re.DOTALL,
)


def _model_history(messages: list[dict] | None) -> list[dict]:
    """Remove UI-only progress markup before sending context to the model."""
    cleaned: list[dict] = []
    for item in messages or []:
        role = str(item.get("role") or "")
        content = str(item.get("content") or "")
        if role == "assistant":
            content = _RESEARCH_TRAIL.sub("", content).strip()
        if role in {"user", "assistant"} and content:
            cleaned.append({"role": role, "content": content})
    return cleaned


def _assistant_message(
    tasks: list[str], answer: str, visible: bool, *, active: bool
) -> str:
    """Render one stable assistant turn containing progress and answer text."""
    if not visible:
        return answer or "_OreoLook is researching…_"
    items = tasks[-8:] or ["Starting the research trail…"]
    task_list = "".join(f"<li>{html.escape(task)}</li>" for task in items)
    opened = " open" if active and not answer else ""
    trail = (
        f'<details class="research-trail"{opened}>'
        "<summary>Research trail</summary>"
        f"<ul>{task_list}</ul></details>"
    )
    return trail + (f"\n\n{answer}" if answer else "")


def _request_controls(*, busy: bool):
    """Lock the composer while one browser request is in flight."""
    return (
        gr.Textbox(value="", interactive=not busy),
        gr.Button("Working…" if busy else "Send", interactive=not busy),
    )


def stage_request(prompt: str, messages: list[dict], show_tasks: bool):
    """Paint the submitted user turn immediately, before queued research begins."""
    prompt = str(prompt or "").strip()
    display = [dict(item) for item in (messages or [])]
    if not prompt:
        return display, display, *_request_controls(busy=False)
    display.append({"role": "user", "content": prompt})
    display.append(
        {
            "role": "assistant",
            "content": _assistant_message([], "", show_tasks, active=True),
        }
    )
    return [*display], [*display], *_request_controls(busy=True)


def chat(messages: list[dict], api_key: str, mode: str, show_tasks: bool):
    """Stream an OreoLook research answer with citations and artifact links."""
    display = [dict(item) for item in (messages or [])]
    staged = (
        len(display) >= 2
        and display[-2].get("role") == "user"
        and display[-1].get("role") == "assistant"
    )
    if not staged:
        yield display, display, *_sources_markdown(""), *_request_controls(busy=False)
        return

    # The last assistant item is UI-only scaffolding created by stage_request.
    # Exclude it from the provider context, then update that same item in place.
    model_messages = _model_history(display[:-1])
    tasks: list[str] = []
    answer = ""
    try:
        for event in stream_completion(model_messages, api_key=api_key, mode=mode):
            if event.kind == "task":
                tasks.append(event.content)
            else:
                answer += event.content
            display[-1] = {
                "role": "assistant",
                "content": _assistant_message(tasks, answer, show_tasks, active=True),
            }
            sources, artifacts = _sources_markdown(answer)
            yield [*display], [*display], sources, artifacts, *_request_controls(busy=True)
    except OreoLookAPIError as exc:
        answer = f"**Tiny snag:** {html.escape(str(exc))}"
        display[-1] = {
            "role": "assistant",
            "content": _assistant_message(tasks, answer, show_tasks, active=False),
        }
        yield [*display], [*display], *_sources_markdown(answer), *_request_controls(busy=False)
        return
    if not answer.strip():
        answer = "**Tiny snag:** OreoLook finished without returning an answer. Please retry."
    display[-1] = {
        "role": "assistant",
        "content": _assistant_message(tasks, answer, show_tasks, active=False),
    }
    yield [*display], [*display], *_sources_markdown(answer), *_request_controls(busy=False)


def reset_conversation():
    """Clear only the current browser session's conversation state."""
    return [], [], *_sources_markdown(""), ""


def _oauth_controls(*, connected: bool, authorizing: bool = False):
    """Return Gradio 6 updates for the composer and OAuth actions."""
    return (
        gr.Textbox(interactive=connected),
        gr.Button("Send", interactive=connected),
        gr.Button(
            "Connect with Pollinations",
            interactive=not connected and not authorizing,
        ),
        gr.Button("Disconnect account", interactive=connected),
    )


def connect_pollinations():
    """Authorize one browser session to spend the user's own Pollinations Pollen."""
    try:
        authorization = begin_device_authorization(APP_KEY)
    except OreoLookAPIError as exc:
        yield "", f"**Sign-in unavailable:** {html.escape(str(exc))}", *_oauth_controls(
            connected=False,
        )
        return
    link = html.escape(
        verification_url_with_code(
            authorization.verification_uri,
            authorization.user_code,
        ),
        quote=True,
    )
    code = html.escape(authorization.user_code)
    yield "", (
        f'<a href="{link}" target="_blank"><strong>Open Pollinations to authorize ↗</strong></a>'
        f"<br>Enter code <strong>{code}</strong>. This page will connect automatically."
    ), *_oauth_controls(connected=False, authorizing=True)
    deadline = time.monotonic() + authorization.expires_in
    while time.monotonic() < deadline:
        time.sleep(authorization.interval)
        try:
            token = poll_device_authorization(authorization.device_code)
        except OreoLookAPIError as exc:
            yield "", f"**Sign-in stopped:** {html.escape(str(exc))}", *_oauth_controls(
                connected=False,
            )
            return
        if token:
            yield token, (
                "**Connected to Pollinations.** Research is unlocked and requests "
                "use your approved budget."
            ), *_oauth_controls(connected=True)
            return
    yield "", (
        "**Sign-in code expired.** Select Connect with Pollinations to start again."
    ), *_oauth_controls(connected=False)


def disconnect_pollinations():
    """Forget the user-scoped Pollinations key held in this browser session."""
    return "", (
        "Connect with Pollinations to unlock research. No API key pasting required."
    ), *_oauth_controls(connected=False)


with gr.Blocks(title="OreoLook — AI search with receipts") as demo:
    conversation = gr.State([])
    api_key = gr.State("")
    mode = gr.State("Auto")
    gr.HTML(f"""<div class="topbar"><div class="brand">
      <img src="{SITE_URL}/favicon.png" alt="OreoLook"><div><strong>OreoLook</strong><small>AI search with receipts</small></div>
    </div><div class="toplinks"><a href="{SITE_URL}" target="_blank">Website ↗</a><a href="{SITE_URL}/docs" target="_blank">API docs ↗</a><a href="{PAPER_URL}" target="_blank">Paper ↗</a><a href="https://github.com/pollinations/search.elixpo" target="_blank">GitHub ↗</a></div></div>""", elem_classes="site-header")
    with gr.Row(elem_classes="workspace"):
        with gr.Column(scale=8, min_width=560):
            with gr.Column(elem_classes="chat-card"):
                gr.HTML("""<div class="chat-heading"><div><strong>OreoLook research</strong><span>Live research, clear citations, and polished reports</span></div><small>Private OAuth session</small></div>""")
                chatbot = gr.Chatbot(
                    value=[], height=360, min_height=280, max_height=410, show_label=False,
                    placeholder=EMPTY_CHAT,
                    elem_classes="chatbot", elem_id="research-chat",
                )
                prompt = gr.Textbox(
                    placeholder="Ask a question or request a report…", show_label=False,
                    lines=1, max_lines=7, container=False, elem_classes="composer", scale=8,
                    interactive=False, render=False, elem_id="research-prompt",
                )
                with gr.Row(elem_classes="composer-row"):
                    prompt.render()
                    send = gr.Button(
                        "Send", variant="primary", elem_classes="send-btn", scale=1,
                        interactive=False, elem_id="research-send",
                    )
                gr.Examples(
                    examples=[
                        "What changed in AI today? Cite the original sources.",
                        "Compare PostgreSQL, MySQL, and MongoDB for a high-traffic application.",
                        "Research the latest climate-tech funding trends and explain the strongest signals.",
                        "Create a PDF briefing on this week's major space-technology news.",
                    ], inputs=prompt, label="Start with an example", elem_id="examples",
                )
        with gr.Column(scale=3, min_width=290, elem_classes="research-rail"):
            with gr.Group(elem_classes="panel"):
                oauth_status = gr.Markdown(
                    "Connect with Pollinations to unlock research. No API key pasting required.",
                    elem_classes="oauth-status",
                )
                with gr.Column(elem_classes="oauth-actions"):
                    oauth_connect = gr.Button(
                        "Connect with Pollinations", variant="primary", elem_classes="oauth-connect",
                        elem_id="pollinations-connect",
                    )
                    new_conversation = gr.Button("＋ New conversation", elem_classes="new-btn")
                    oauth_disconnect = gr.Button(
                        "Disconnect account", elem_classes="oauth-disconnect",
                        interactive=False,
                    )
                show_tasks = gr.Checkbox(value=True, label="Show research trail")
            with gr.Accordion("Sources", open=False, elem_classes="secondary-card"):
                sources = gr.Markdown(_sources_markdown("")[0], elem_classes="source-panel")
            with gr.Accordion("Downloads", open=False, elem_classes="secondary-card"):
                artifacts = gr.Markdown(_sources_markdown("")[1], elem_classes="artifact-panel")
            with gr.Accordion("Built for real research", open=False, elem_classes="secondary-card"):
                gr.HTML("""<div class="feature-list"><span>Live web search</span><span>Automatic depth</span><span>Source citations</span><span>PDF reports</span><span>Same-tab memory</span><span>Streaming answers</span></div>""")
    gr.HTML("""<div class="hero"><div><span class="eyebrow">Research, grounded</span><h1>The web, with <em>receipts.</em></h1></div><p>Ask a quick question, investigate a topic from several angles, or turn current research into a polished PDF report. OreoLook chooses the right depth automatically and keeps the evidence close.</p></div>""", elem_classes="hero-wrap")
    gr.HTML(f'''<div class="paper-citation"><strong>Research behind OreoLook:</strong>
      Ayushman Bhattacharya and Nihal Gazi, “A Three-Layer Caching Architecture for
      Low-Latency LLM Web Search on Commodity CPU Hardware” (2026) ·
      <a href="{PAPER_URL}" target="_blank" rel="noopener">arXiv:2609.05463</a> ·
      <a href="{HF_PAPER_URL}" target="_blank" rel="noopener">Hugging Face Paper</a>
    </div><div class="footer-note">Powered by <a href="https://pollinations.ai" target="_blank">Pollinations AI</a> · Learn more at <a href="{SITE_URL}" target="_blank">search.elixpo.com</a></div>''')

    outputs = [chatbot, conversation, sources, artifacts, prompt, send]
    reset_outputs = [chatbot, conversation, sources, artifacts, prompt]
    stage = send.click(
        stage_request,
        inputs=[prompt, conversation, show_tasks],
        outputs=[chatbot, conversation, prompt, send],
        queue=False,
        trigger_mode="once",
        show_progress="hidden",
        api_name=False,
    )
    stage.then(
        chat,
        inputs=[conversation, api_key, mode, show_tasks],
        outputs=outputs,
        concurrency_limit=8,
        trigger_mode="once",
        stream_every=0.1,
        show_progress="hidden",
        api_name="research",
    )
    new_conversation.click(
        reset_conversation,
        outputs=reset_outputs,
        queue=False,
        api_name="new_conversation",
    )
    oauth_connect.click(
        connect_pollinations,
        outputs=[
            api_key, oauth_status, prompt, send, oauth_connect, oauth_disconnect,
        ],
        concurrency_limit=4, api_name=False,
    )
    oauth_disconnect.click(
        disconnect_pollinations,
        outputs=[
            api_key, oauth_status, prompt, send, oauth_connect, oauth_disconnect,
        ],
        queue=False, api_name=False,
    )


if __name__ == "__main__":
    # The production OreoLook MCP is hosted at search.elixpo.com/mcp. Keeping
    # this UI as a plain Gradio app avoids exposing its API-key input as a tool.
    demo.queue(default_concurrency_limit=8, max_size=64).launch(
        css=CSS, head=SEO_HEAD, js=APP_JS, ssr_mode=False,
    )
