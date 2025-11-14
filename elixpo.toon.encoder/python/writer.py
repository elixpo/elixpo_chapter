from dataTypes import Depth
from constants import LIST_ITEM_PREFIX
from typing import Optional
class LineWriter:
    def __init__(self, indentSize: Optional[int]):
        self._lines: list[str] = []
        self.indentationString: str
        self.indentationString = ' ' * indentSize
        
    def push(self, depth: Depth, content: str) -> None:
        indent = self.indentationString * depth
        self._lines.append(f"{indent}{content}")

    def pushListItem(self, depth: Depth, content: str) -> None:
        self.push(depth, f"{LIST_ITEM_PREFIX}{content}")

    def toString(self) -> str:
        return '\n'.join(self._lines)
        
            