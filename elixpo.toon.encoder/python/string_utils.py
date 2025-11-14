from constants import BACKSLASH, CARRIAGE_RETURN, DOUBLE_QUOTE, NEWLINE, TAB
from typing import Optional

def escape_string(input_string: str) -> str:
    escaped = (
        input_string.replace(BACKSLASH, BACKSLASH * 2)
        .replace(DOUBLE_QUOTE, BACKSLASH + DOUBLE_QUOTE)
        .replace(NEWLINE, BACKSLASH + 'n')
        .replace(CARRIAGE_RETURN, BACKSLASH + 'r')
        .replace(TAB, BACKSLASH + 't')
    )
    return escaped

def unescapeString(value: str) -> str:
    result = ''
    i = 0
    while (i < len(value)):
        if(value[i] == BACKSLASH):
            if(i + 1 >= len(value)):
                raise SyntaxError('Invalid escape sequence at end of string')
            next = value[i + 1]
            if(next == 'n'):
                result += NEWLINE
                i += 2
                continue
            elif(next == 'r'):
                result += CARRIAGE_RETURN
                i += 2
                continue
            elif(next == 't'):
                result += TAB
                i += 2
                continue
            elif(next == DOUBLE_QUOTE):
                result += DOUBLE_QUOTE
                i += 2
                continue
            elif(next == BACKSLASH):
                result += BACKSLASH
                i += 2
                continue
            else:
                raise SyntaxError(f'Invalid escape sequence: \\{next}')
        result += value[i]
        i += 1
    return result

def findClosingQuote(content: str, start: int) -> int:
    i = start + 1 
    while(i < len(content)):
        if(content[i] == BACKSLASH and i + 1 < len(content)):
            i += 2
            continue
        if(content[i] == DOUBLE_QUOTE):
            return i
        i += 1
    return -1

def findUnquotedChar(content: str, char: str, start: Optional[int] = 0) -> int:
    inQuotes = False
    i = start
    while(i < len(content)):
        if(content[i] == BACKSLASH and i + 1 < len(content) and inQuotes):
            i += 2
            continue
        if (content[i] == DOUBLE_QUOTE):
            inQuotes = not inQuotes
            i += 1
            continue
        if(not inQuotes and content[i] == char):
            return i
        i += 1
    return -1