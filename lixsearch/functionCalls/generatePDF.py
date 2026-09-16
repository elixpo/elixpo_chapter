import asyncio
import os
import re
import uuid
from datetime import datetime

_BASE_URL = os.getenv("PUBLIC_BASE_URL", "https://search.elixpo.com").rstrip("/")

_DEJAVU_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"
_DEJAVU_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
_DEJAVU_ITALIC_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Oblique.ttf"
_DEJAVU_BI_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-BoldOblique.ttf"
_DEJAVU_MONO_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"

_EMOJI_RE = re.compile(
    "["
    "\U0001F600-\U0001F64F"
    "\U0001F300-\U0001F5FF"
    "\U0001F680-\U0001F6FF"
    "\U0001F1E0-\U0001F1FF"
    "\U00002702-\U000027B0"
    "\U0001F900-\U0001F9FF"
    "\U0001FA00-\U0001FA6F"
    "\U0001FA70-\U0001FAFF"
    "\U00002600-\U000026FF"
    "\U0000FE00-\U0000FE0F"
    "\U0000200D"
    "\U00002B50"
    "\U000023F0-\U000023FF"
    "]+",
    flags=re.UNICODE,
)


def _strip_emojis(text: str) -> str:
    if not text:
        return text or ""
    return _EMOJI_RE.sub("", text)


def _generate_title_slug(content: str, max_words: int = 8) -> str:
    heading = re.search(r"^#+\s+(.+)", content, re.MULTILINE)
    if heading:
        title = heading.group(1).strip()
    else:
        first_line = content.strip().split("\n")[0]
        title = re.sub(r"[*_`\[\]()]", "", first_line).strip()
    words = title.split()[:max_words]
    slug = "-".join(words).lower()
    slug = re.sub(r"[^a-z0-9\-]", "", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return slug or "lixsearch-export"


_INLINE_RE = re.compile(
    r"(?P<bold_italic>\*\*\*(.+?)\*\*\*)"
    r"|(?P<bold>\*\*(.+?)\*\*)"
    r"|(?P<italic>\*(.+?)\*)"
    r"|(?P<code>`(.+?)`)"
    r"|(?P<link>\[([^\]]+)\]\(([^)]+)\))"
    r"|(?P<img>!\[[^\]]*\]\([^)]+\))"
)


def _parse_inline(text: str):
    segments = []
    last = 0
    for m in _INLINE_RE.finditer(text):
        if m.start() > last:
            segments.append(("text", text[last:m.start()]))
        if m.group("bold_italic"):
            segments.append(("bold_italic", m.group(2)))
        elif m.group("bold"):
            segments.append(("bold", m.group(4)))
        elif m.group("italic"):
            segments.append(("italic", m.group(6)))
        elif m.group("code"):
            segments.append(("code", m.group(8)))
        elif m.group("link"):
            segments.append(("link", m.group(10), m.group(11)))
        last = m.end()
    if last < len(text):
        segments.append(("text", text[last:]))
    return segments if segments else [("text", text)]


def _plain_table_cell(text: str) -> str:
    """Reduce inline Markdown to readable text for fpdf2 table cells."""
    value = _strip_emojis(text.strip())
    value = re.sub(r"!\[([^\]]*)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", value)
    value = re.sub(r"(?:\*\*\*|\*\*|\*|__|_|`)", "", value)
    return value.strip()


def _table_row(line: str) -> list[str]:
    return [_plain_table_cell(cell) for cell in line.strip().strip("|").split("|")]


def _is_table_separator(line: str) -> bool:
    cells = line.strip().strip("|").split("|")
    return bool(cells) and all(re.fullmatch(r"\s*:?-{3,}:?\s*", cell) for cell in cells)


def _write_md(pdf, text: str, font: str = "DejaVu", size: int = 11,
              color=(50, 50, 50), lh: float = 6):
    text = _strip_emojis(text)
    for seg in _parse_inline(text):
        kind = seg[0]
        if kind == "text":
            pdf.set_font(font, "", size)
            pdf.set_text_color(*color)
            pdf.write(lh, seg[1])
        elif kind == "bold":
            pdf.set_font(font, "B", size)
            pdf.set_text_color(*color)
            pdf.write(lh, seg[1])
        elif kind == "italic":
            pdf.set_font(font, "I", size)
            pdf.set_text_color(*color)
            pdf.write(lh, seg[1])
        elif kind == "bold_italic":
            pdf.set_font(font, "BI", size)
            pdf.set_text_color(*color)
            pdf.write(lh, seg[1])
        elif kind == "code":
            code_text = seg[1]
            pdf.set_font("DejaVuMono", "", size - 1)
            w = pdf.get_string_width(code_text) + 3
            x, y = pdf.get_x(), pdf.get_y()
            pdf.set_fill_color(240, 240, 240)
            pdf.rect(x, y - 0.5, w, lh + 1, "F")
            pdf.set_text_color(180, 50, 50)
            pdf.write(lh, f" {code_text} ")
        elif kind == "link":
            link_text, url = seg[1], seg[2]
            pdf.set_font(font, "U", size)
            pdf.set_text_color(40, 80, 160)
            pdf.write(lh, link_text, url)
    pdf.set_font(font, "", size)
    pdf.set_text_color(*color)


def _markdown_to_pdf(markdown_text: str, title: str = "lixSearch Response") -> bytes:
    from fpdf import FPDF
    from fpdf.enums import XPos, YPos

    class BrandedPDF(FPDF):
        def header(self):
            self.set_font("DejaVu", "B", 9)
            self.set_text_color(100, 100, 100)
            self.cell(0, 8, "OreoLook", align="L")
            self.ln(0)
            self.cell(0, 8, "search.elixpo.com", align="R")
            self.ln(8)
            self.set_draw_color(30, 30, 60)
            self.set_line_width(0.5)
            self.line(self.l_margin, self.get_y(), self.w - self.r_margin, self.get_y())
            self.ln(4)

        def footer(self):
            self.set_y(-15)
            self.set_font("DejaVu", "I", 8)
            self.set_text_color(150, 150, 150)
            self.cell(0, 10, f"Page {self.page_no()}/{{nb}}", align="C")

    pdf = BrandedPDF()

    if os.path.exists(_DEJAVU_PATH):
        # Some slim/container font packages ship only part of the DejaVu
        # family. Register every style the renderer requests, falling back to
        # a compatible face instead of letting fpdf raise "Undefined font".
        bold_path = _DEJAVU_BOLD_PATH if os.path.exists(_DEJAVU_BOLD_PATH) else _DEJAVU_PATH
        italic_path = _DEJAVU_ITALIC_PATH if os.path.exists(_DEJAVU_ITALIC_PATH) else _DEJAVU_PATH
        bold_italic_path = _DEJAVU_BI_PATH if os.path.exists(_DEJAVU_BI_PATH) else bold_path
        mono_path = _DEJAVU_MONO_PATH if os.path.exists(_DEJAVU_MONO_PATH) else _DEJAVU_PATH

        pdf.add_font("DejaVu", "", _DEJAVU_PATH, uni=True)
        pdf.add_font("DejaVu", "B", bold_path, uni=True)
        pdf.add_font("DejaVu", "I", italic_path, uni=True)
        pdf.add_font("DejaVu", "BI", bold_italic_path, uni=True)
        pdf.add_font("DejaVuMono", "", mono_path, uni=True)
    else:
        pdf.add_font("DejaVu", "", "Helvetica")
        pdf.add_font("DejaVuMono", "", "Courier")

    pdf.alias_nb_pages()
    pdf.set_auto_page_break(auto=True, margin=20)
    pdf.add_page()

    title = _strip_emojis(title)
    title_size = 20 if len(title) <= 65 else 17 if len(title) <= 100 else 15
    pdf.set_font("DejaVu", "B", title_size)
    pdf.set_text_color(30, 30, 60)
    pdf.multi_cell(0, title_size * 0.55, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
    pdf.ln(2)

    pdf.set_font("DejaVu", "", 9)
    pdf.set_text_color(120, 120, 120)
    ts = datetime.now(tz=__import__('datetime').timezone.utc).strftime("%B %d, %Y at %H:%M UTC")
    pdf.cell(0, 6, f"Generated {ts}  |  Powered by OreoLook")
    pdf.ln(8)

    pdf.set_draw_color(200, 200, 200)
    pdf.set_line_width(0.3)
    pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
    pdf.ln(6)

    text = _strip_emojis(markdown_text.replace("\\n", "\n"))
    in_code_block = False

    lines = text.split("\n")
    skipped_lines = set()
    first_content_line = next((i for i, value in enumerate(lines) if value.strip()), None)
    normalized_title = re.sub(r"\W+", "", title).casefold()

    for line_index, line in enumerate(lines):
        if line_index in skipped_lines:
            continue
        stripped = line.strip()

        if not stripped:
            pdf.ln(4)
            continue

        # The cover already renders the document H1; avoid printing it twice.
        if line_index == first_content_line and stripped.startswith("# "):
            normalized_heading = re.sub(r"\W+", "", stripped[2:]).casefold()
            if normalized_heading == normalized_title:
                continue

        # Render GitHub-style Markdown tables as real, wrapping tables rather
        # than a series of pipe-delimited body paragraphs.
        if (
            stripped.startswith("|")
            and line_index + 1 < len(lines)
            and _is_table_separator(lines[line_index + 1])
        ):
            rows = [_table_row(stripped)]
            cursor = line_index + 2
            while cursor < len(lines) and lines[cursor].strip().startswith("|"):
                rows.append(_table_row(lines[cursor]))
                cursor += 1
            skipped_lines.update(range(line_index + 1, cursor))
            if rows and all(len(row) == len(rows[0]) for row in rows):
                from fpdf.fonts import FontFace
                pdf.set_font("DejaVu", "", 8.5)
                with pdf.table(
                    rows=rows,
                    width=pdf.epw,
                    text_align="LEFT",
                    line_height=5,
                    padding=2,
                    headings_style=FontFace(
                        family="DejaVu",
                        emphasis="B",
                        color=(30, 30, 60),
                        fill_color=(235, 238, 246),
                    ),
                ):
                    pass
                pdf.ln(5)
                continue

        if stripped.startswith("```"):
            in_code_block = not in_code_block
            pdf.ln(2)
            continue

        if in_code_block:
            pdf.set_font("DejaVuMono", "", 9)
            pdf.set_text_color(60, 60, 60)
            pdf.set_fill_color(245, 245, 245)
            # Reset after every multiline cell; width=0 otherwise inherits the right edge.
            pdf.multi_cell(
                0, 5, f"  {stripped}", fill=True,
                new_x=XPos.LMARGIN, new_y=YPos.NEXT,
            )
            continue

        if stripped.startswith("### "):
            pdf.ln(3)
            _write_md(pdf, stripped[4:], size=13, color=(40, 40, 80), lh=7)
            pdf.ln(9)
        elif stripped.startswith("## "):
            pdf.ln(4)
            _write_md(pdf, stripped[3:], size=15, color=(30, 30, 60), lh=8)
            pdf.ln(11)
        elif stripped.startswith("# "):
            pdf.ln(5)
            _write_md(pdf, stripped[2:], size=17, color=(20, 20, 50), lh=9)
            pdf.ln(13)
        elif stripped.startswith("- ") or stripped.startswith("* "):
            pdf.set_font("DejaVu", "", 11)
            pdf.set_text_color(50, 50, 50)
            pdf.cell(6)
            pdf.write(6, "- ")
            _write_md(pdf, stripped[2:])
            pdf.ln(7)
        elif re.match(r"^\d+\.\s", stripped):
            num_match = re.match(r"^(\d+\.\s)", stripped)
            prefix = num_match.group(1)
            rest = stripped[len(prefix):]
            pdf.set_font("DejaVu", "", 11)
            pdf.set_text_color(50, 50, 50)
            pdf.cell(6)
            pdf.write(6, prefix)
            _write_md(pdf, rest)
            pdf.ln(7)
        elif stripped.startswith("> "):
            y = pdf.get_y()
            pdf.set_draw_color(100, 120, 200)
            pdf.set_line_width(0.8)
            pdf.line(pdf.l_margin + 2, y, pdf.l_margin + 2, y + 8)
            pdf.cell(10)
            _write_md(pdf, stripped[2:], color=(80, 80, 80))
            pdf.ln(8)
        elif stripped in ("---", "***", "___") or re.match(r"^[-*_]{3,}$", stripped):
            pdf.ln(3)
            pdf.set_draw_color(200, 200, 200)
            pdf.line(pdf.l_margin, pdf.get_y(), pdf.w - pdf.r_margin, pdf.get_y())
            pdf.ln(5)
        else:
            _write_md(pdf, stripped)
            pdf.ln(8)

    return pdf.output()


async def create_pdf_from_content(content: str, title: str = None) -> str:
    from app.gateways.content import store_content

    if not content:
        raise ValueError("PDF content cannot be empty")

    if not title:
        title = _generate_title_slug(content).replace("-", " ").title()

    pdf_bytes = await asyncio.to_thread(_markdown_to_pdf, content, title)

    # Derive the filename slug from the visible subject title.
    slug = _generate_title_slug(title, max_words=12)
    content_id = f"{slug}-{uuid.uuid4().hex[:8]}"
    store_content(content_id, pdf_bytes, ".pdf")

    return f"{_BASE_URL}/api/content/{content_id}.pdf"
