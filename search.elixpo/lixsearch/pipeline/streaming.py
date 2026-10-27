"""Buffered text streaming with atomic lixSearch TASK control blocks."""
from __future__ import annotations


class TaskAwareChunkBuffer:
    OPEN = "<TASK>"
    CLOSE = "</TASK>"

    def __init__(self, chunk_chars: int = 96):
        self.chunk_chars = max(16, int(chunk_chars))
        self._raw = ""
        self._normal = ""

    def feed(self, text: str) -> list[tuple[str, str]]:
        self._raw += text or ""
        events: list[tuple[str, str]] = []
        while self._raw:
            opening = self._raw.find(self.OPEN)
            if opening >= 0:
                self._normal += self._raw[:opening]
                self._raw = self._raw[opening:]
                events.extend(self._drain_normal(force=True))
                closing = self._raw.find(self.CLOSE, len(self.OPEN))
                if closing < 0:
                    break
                end = closing + len(self.CLOSE)
                events.append(("task", self._raw[:end]))
                self._raw = self._raw[end:]
                continue

            partial = self._partial_open_suffix(self._raw)
            safe_end = len(self._raw) - partial
            self._normal += self._raw[:safe_end]
            self._raw = self._raw[safe_end:]
            events.extend(self._drain_normal(force=False))
            break
        return events

    def flush(self) -> list[tuple[str, str]]:
        # An unfinished TASK block is control data and is deliberately not leaked
        # into assistant text. A partial opening token is ordinary text.
        if self._raw and not self._raw.startswith(self.OPEN):
            self._normal += self._raw
        self._raw = ""
        return self._drain_normal(force=True)

    def _drain_normal(self, *, force: bool) -> list[tuple[str, str]]:
        chunks: list[tuple[str, str]] = []
        while len(self._normal) >= self.chunk_chars:
            split = self._normal.rfind(" ", self.chunk_chars // 2, self.chunk_chars + 1)
            if split < 0:
                split = self.chunk_chars
            else:
                split += 1
            chunks.append(("text", self._normal[:split]))
            self._normal = self._normal[split:]
        if force and self._normal:
            chunks.append(("text", self._normal))
            self._normal = ""
        return chunks

    @classmethod
    def _partial_open_suffix(cls, value: str) -> int:
        maximum = min(len(value), len(cls.OPEN) - 1)
        for size in range(maximum, 0, -1):
            if value.endswith(cls.OPEN[:size]):
                return size
        return 0
