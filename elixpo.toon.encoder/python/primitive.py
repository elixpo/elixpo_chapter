from dataTypes import JsonPrimitive
from constants import COMMA, DEFAULT_DELIMITER, DOUBLE_QUOTE, NULL_LITERAL
from string_utils import escape_string
from validation import isSafeUnquoted, isValidUnquotedKey
from typing import Optional, TypedDict



def encodePrimitive(value: JsonPrimitive, delimiter: Optional[str]) -> str:
    if (value == None):
        return NULL_LITERAL
    if( isinstance(value, bool)):
        return str(value)
    if (isinstance(value, (int, float))):
        return str(value)
    
    return encodeStringLiteral(value, delimiter)

def encodeStringLiteral(value: str, delimiter: Optional[str] = COMMA) -> str:
    if(isSafeUnquoted(value, delimiter)):
        return value
    return f'{DOUBLE_QUOTE}{escape_string(value)}{DOUBLE_QUOTE}'

def encodeKey(key: str) -> str:
    if(isValidUnquotedKey(key)):
        return key
    return encodeStringLiteral(key, DEFAULT_DELIMITER)

def encodeAndJoinPrimitives(values: list[JsonPrimitive], delimiter: Optional[str] = COMMA) -> str:
    encodedValues = [encodePrimitive(value, delimiter) for value in values]
    return delimiter.join(encodedValues)

options = TypedDict('options', {
    'key': Optional[str],
    'fields': Optional[list[str]],
    'delimiter': Optional[str],
    'lengthMarker': Optional[bool]
    })

def formatHeader(
        length: int,
        options: Optional[options] = None
) -> str:
    key = options['key'] if options and 'key' in options else None
    fields = options['fields'] if options and 'fields' in options else None
    delimiter = options['delimiter'] if options and 'delimiter' in options else DEFAULT_DELIMITER
    lengthMarker = options['lengthMarker'] if options and 'lengthMarker' in options else False

    header = ''
    if (key):
        header += f"{encodeKey(key)} "
    header += f'[{lengthMarker or ""}{length}{delimiter != DEFAULT_DELIMITER and delimiter or ""}]'
    if(fields):
        quotedFields = [encodeKey(field) for field in fields]
        header += '  ' + delimiter.join(quotedFields)
    header += ';'
    return header