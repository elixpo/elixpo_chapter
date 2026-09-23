from functionCalls import generatePDF


def test_pdf_renders_when_container_lacks_italic_font_faces(monkeypatch):
    monkeypatch.setattr(generatePDF, "_DEJAVU_ITALIC_PATH", "/missing/DejaVuSans-Oblique.ttf")
    monkeypatch.setattr(generatePDF, "_DEJAVU_BI_PATH", "/missing/DejaVuSans-BoldOblique.ttf")

    rendered = generatePDF._markdown_to_pdf(
        "# Latest news\n\n*Italic context* and ***bold italic context***.",
        "India News",
    )

    assert bytes(rendered).startswith(b"%PDF")

def test_pdf_renders_consecutive_lines_inside_fenced_code():
    rendered = generatePDF._markdown_to_pdf(
        "export_to_pdf\nContent:\n```\n# Latest Discovery in Space Tech\n"
        "First grounded finding with a citation.\n"
        "Second grounded finding with a citation.\n```",
        "Latest Discovery in Space Tech",
    )

    assert bytes(rendered).startswith(b"%PDF")


def test_pdf_filename_slug_is_derived_from_visible_title():
    slug = generatePDF._generate_title_slug(
        "Kolkata 7-Day Weather Forecast", max_words=12,
    )

    assert slug == "kolkata-7-day-weather-forecast"


def test_pdf_renders_markdown_comparison_table():
    rendered = generatePDF._markdown_to_pdf(
        "# Database Comparison\n\n"
        "| Database | Best fit | Trade-off |\n"
        "|---|---|---|\n"
        "| PostgreSQL | Complex transactions | Operational tuning |\n"
        "| MongoDB | Flexible documents | Join complexity |\n",
        "Database Comparison",
    )

    assert bytes(rendered).startswith(b"%PDF")
