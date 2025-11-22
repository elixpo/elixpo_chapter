from typing import Literal, TypedDict
from types import MappingProxyType

LIST_ITEM_MARKER = '-'
LIST_ITEM_PREFIX = '- '

COMMA = ','
COLON = ':'
SPACE = ' '
PIPE = '|'
DOT = '.'
HASH = '#'

OPEN_BRACKET = '['
CLOSE_BRACKET = ']'
OPEN_BRACE = '{'
CLOSE_BRACE = '}'

NULL_LITERAL = 'null'
TRUE_LITERAL = 'true'
FALSE_LITERAL = 'false'

BACKSLASH = '\\'
DOUBLE_QUOTE = '"'
NEWLINE = '\n'
CARRIAGE_RETURN = '\r'
TAB = '\t'


class Delimiters(TypedDict):
    comma: Literal[","]
    tab: Literal["\t"]
    pipe: Literal["|"]

DELIMITERS: Delimiters = MappingProxyType({
    "comma": ",",
    "tab": "\t",
    "pipe": "|",
})


DelimiterKey = Literal["comma", "tab", "pipe"]
Delimiter = Literal[",", "\t", "|"]
DEFAULT_DELIMITER: Delimiter = DELIMITERS["comma"]

if __name__ == "__main__":
    print("All delimiters:", dict(DELIMITERS))
    print("Default delimiter:", DEFAULT_DELIMITER)
