from typing import Optional, TypedDict
from dataTypes import JsonPrimitive
from constants import COMMA, DEFAULT_DELIMITER, DOUBLE_QUOTE, NULL_LITERAL
from string_utils import escapeString
from validation import isSafeUnquoted, isValidUnquotedKey


def encodePrimitive(value: JsonPrimitive, delimiter: Optional[str] = None) -> str:
    if value is None:
        return NULL_LITERAL

    if isinstance(value, bool):
        return str(value)

    if isinstance(value, (int, float)):
        return str(value)

    return encodeStringLiteral(value, delimiter)


def encodeStringLiteral(value: str, delimiter: str = COMMA) -> str:
    if isSafeUnquoted(value, delimiter):
        return value

    return f'{DOUBLE_QUOTE}{escapeString(value)}{DOUBLE_QUOTE}'


def encodeKey(key: str) -> str:
    if isValidUnquotedKey(key):
        return key

    return f'{DOUBLE_QUOTE}{escapeString(key)}{DOUBLE_QUOTE}'


def encodeAndJoinPrimitives(values: list[JsonPrimitive], delimiter: str = COMMA) -> str:
    encoded_values = [encodePrimitive(v, delimiter) for v in values]
    return delimiter.join(encoded_values)


class FormatHeaderOptions(TypedDict, total=False):
    key: Optional[str]
    fields: Optional[list[str]]
    delimiter: Optional[str]
    lengthMarker: Optional[str]


def formatHeader(
    length: int,
    options: Optional[FormatHeaderOptions] = None,
) -> str:
    key = options.get('key') if options else None
    fields = options.get('fields') if options else None
    delimiter = options.get('delimiter', DEFAULT_DELIMITER) if options else DEFAULT_DELIMITER
    length_marker = options.get('lengthMarker', False) if options else False

    header = ''

    if key:
        header += encodeKey(key)

    header += f'[{length_marker or ""}{length}{delimiter if delimiter != DEFAULT_DELIMITER else ""}]'

    if fields:
        quoted_fields = [encodeKey(f) for f in fields]
        header += f'{{{delimiter.join(quoted_fields)}}}'

    header += ':'

    return header