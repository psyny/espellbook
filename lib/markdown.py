import re


def markdown_to_html(text):
    paragraphs = text.split("\n\n")
    parts = []
    for paragraph in paragraphs:
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if paragraph.startswith("- "):
            items = paragraph.splitlines()
            list_items = "".join(
                f"<li>{inline_format(item[2:])}</li>" for item in items
            )
            parts.append(f"<ul>{list_items}</ul>")
        else:
            parts.append(f"<p>{inline_format(paragraph)}</p>")
    return "\n".join(parts)


def inline_format(text):
    text = re.sub(r"\*\*\*(.+?)\*\*\*", r"<strong><em>\1</em></strong>", text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"\*(.+?)\*", r"<em>\1</em>", text)
    return text
