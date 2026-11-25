"""Pure text helpers for IR Quest (host-testable, no badge imports)."""


def wrap(text, width, max_lines=0):
    """Split `text` into lines of at most `width` characters.

    Breaks at spaces where it can and hard-breaks long tokens (ESP-IDF
    error names have no spaces). With max_lines > 0 the last kept line
    ends in "..." when text had to be dropped, so nothing is cut silently.
    """
    lines = []
    for para in str(text).split("\n"):
        cur = ""
        for word in para.split(" "):
            if not word:
                continue
            while len(word) > width:
                if cur:
                    lines.append(cur)
                    cur = ""
                lines.append(word[:width])
                word = word[width:]
            if not cur:
                cur = word
            elif len(cur) + 1 + len(word) <= width:
                cur = cur + " " + word
            else:
                lines.append(cur)
                cur = word
        if cur or not para:
            lines.append(cur)
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        if len(last) > width - 3:
            last = last[:width - 3]
        lines[-1] = last + "..."
    return lines


def hex32(v):
    return "0x%08X" % (v & 0xFFFFFFFF)
