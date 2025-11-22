from typing import Any, Dict, List, Optional, Set, Tuple, Union
from constants import COLON, DEFAULT_DELIMITER, DOT, LIST_ITEM_PREFIX
from dataTypes import JsonValue, JsonObject, JsonPrimitive, Depth, JsonArray
from expand import QUOTED_KEY_MARKER

class ParsedLine:
    def __init__(self, content: str, depth: int, line_number: int):
        self.content = content
        self.depth = depth
        self.line_number = line_number

class LineCursor:
    def __init__(self, lines: List[ParsedLine]):
        self.lines = lines
        self.index = 0
        self.blank_lines = set()

    def peek(self) -> Optional[ParsedLine]:
        if self.index < len(self.lines):
            return self.lines[self.index]
        return None

    def next(self) -> Optional[ParsedLine]:
        if self.index < len(self.lines):
            line = self.lines[self.index]
            self.index += 1
            return line
        return None

    def advance(self):
        self.index += 1

    def at_end(self) -> bool:
        return self.index >= len(self.lines)

    def length(self) -> int:
        return len(self.lines) - self.index

    def current(self) -> Optional[ParsedLine]:
        if 0 <= self.index < len(self.lines):
            return self.lines[self.index]
        return None

    def get_blank_lines(self) -> Set[int]:
        return self.blank_lines

# Utility functions (to be implemented)
def find_closing_quote(s: str, start: int) -> int:
    # Returns the index of the closing quote, or -1 if not found
    try:
        return s.index('"', start + 1)
    except ValueError:
        return -1

def is_array_header_after_hyphen(content: str) -> bool:
    # Placeholder: implement logic to detect array header after hyphen
    return False

def parse_array_header_line(content: str, delimiter: str) -> Optional[Any]:
    # Placeholder: implement logic to parse array header line
    return None

def is_object_first_field_after_hyphen(content: str) -> bool:
    # Placeholder: implement logic to detect object first field after hyphen
    return False

def map_row_values_to_primitives(values: List[str]) -> List[JsonPrimitive]:
    # Placeholder: convert string values to primitives
    return [parse_primitive_token(v) for v in values]

def parse_delimited_values(content: str, delimiter: str) -> List[str]:
    # Placeholder: split content by delimiter
    return [v.strip() for v in content.split(delimiter)]

def parse_key_token(content: str, start: int) -> Dict[str, Any]:
    # Placeholder: parse key token, return dict with key, end, is_quoted
    if content.startswith('"'):
        end = find_closing_quote(content, 0)
        key = content[1:end]
        is_quoted = True
        rest = content[end+1:]
        if rest.startswith(COLON):
            end += 1
    else:
        if COLON in content:
            end = content.index(COLON)
            key = content[:end].strip()
            is_quoted = False
        else:
            end = len(content)
            key = content.strip()
            is_quoted = False
    return {'key': key, 'end': end + 1, 'is_quoted': is_quoted}

def parse_primitive_token(token: str) -> JsonPrimitive:
    # Placeholder: parse a primitive token (int, float, bool, null, or string)
    token = token.strip()
    if token == 'null':
        return None
    if token == 'true':
        return True
    if token == 'false':
        return False
    try:
        return int(token)
    except ValueError:
        try:
            return float(token)
        except ValueError:
            return token

def assert_expected_count(actual: int, expected: int, what: str, options: Any):
    if actual != expected:
        raise ValueError(f"Expected {expected} {what}, got {actual}")

def validate_no_blank_lines_in_range(start: int, end: int, blank_lines: Set[int], strict: bool, what: str):
    if strict:
        for line in range(start, end + 1):
            if line in blank_lines:
                raise ValueError(f"Blank line found in {what} at line {line}")

def validate_no_extra_list_items(cursor: LineCursor, item_depth: int, expected_length: int):
    # Placeholder: implement strict validation for extra list items
    pass

def validate_no_extra_tabular_rows(cursor: LineCursor, row_depth: int, header: Any):
    # Placeholder: implement strict validation for extra tabular rows
    pass

# Entry decoding

def decode_value_from_lines(cursor: LineCursor, options: Any) -> JsonValue:
    first = cursor.peek()
    if not first:
        raise ReferenceError('No content to decode')

    # Check for root array
    if is_array_header_after_hyphen(first.content):
        header_info = parse_array_header_line(first.content, DEFAULT_DELIMITER)
        if header_info:
            cursor.advance()
            return decode_array_from_header(header_info['header'], header_info.get('inlineValues'), cursor, 0, options)

    # Check for single primitive value
    if cursor.length() == 1 and not is_key_value_line(first):
        return parse_primitive_token(first.content.strip())

    # Default to object
    return decode_object(cursor, 0, options)

def is_key_value_line(line: ParsedLine) -> bool:
    content = line.content
    if content.startswith('"'):
        closing_quote_index = find_closing_quote(content, 0)
        if closing_quote_index == -1:
            return False
        return COLON in content[closing_quote_index + 1:]
    else:
        return COLON in content

# Object decoding

def decode_object(cursor: LineCursor, base_depth: Depth, options: Any) -> JsonObject:
    obj: JsonObject = {}
    quoted_keys: Set[str] = set()
    computed_depth: Optional[Depth] = None

    while not cursor.at_end():
        line = cursor.peek()
        if not line or line.depth < base_depth:
            break

        if computed_depth is None and line.depth >= base_depth:
            computed_depth = line.depth

        if line.depth == computed_depth:
            cursor.advance()
            key_value = decode_key_value(line.content, cursor, computed_depth, options)
            key, value, _, is_quoted = key_value['key'], key_value['value'], key_value['follow_depth'], key_value['is_quoted']
            obj[key] = value
            if is_quoted and DOT in key:
                quoted_keys.add(key)
        else:
            break

    if quoted_keys:
        obj[QUOTED_KEY_MARKER] = quoted_keys

    return obj

def decode_key_value(content: str, cursor: LineCursor, base_depth: Depth, options: Any) -> Dict[str, Any]:
    array_header = parse_array_header_line(content, DEFAULT_DELIMITER)
    if array_header and array_header['header'].get('key'):
        decoded_value = decode_array_from_header(array_header['header'], array_header.get('inlineValues'), cursor, base_depth, options)
        return {
            'key': array_header['header']['key'],
            'value': decoded_value,
            'follow_depth': base_depth + 1,
            'is_quoted': False,
        }

    key_token = parse_key_token(content, 0)
    key, end, is_quoted = key_token['key'], key_token['end'], key_token['is_quoted']
    rest = content[end:].strip()

    if not rest:
        next_line = cursor.peek()
        if next_line and next_line.depth > base_depth:
            nested = decode_object(cursor, base_depth + 1, options)
            return {'key': key, 'value': nested, 'follow_depth': base_depth + 1, 'is_quoted': is_quoted}
        return {'key': key, 'value': {}, 'follow_depth': base_depth + 1, 'is_quoted': is_quoted}

    decoded_value = parse_primitive_token(rest)
    return {'key': key, 'value': decoded_value, 'follow_depth': base_depth + 1, 'is_quoted': is_quoted}

# Array decoding

def decode_array_from_header(header: Any, inline_values: Optional[str], cursor: LineCursor, base_depth: Depth, options: Any) -> JsonArray:
    if inline_values:
        return decode_inline_primitive_array(header, inline_values, options)
    if header.get('fields'):
        return decode_tabular_array(header, cursor, base_depth, options)
    return decode_list_array(header, cursor, base_depth, options)

def decode_inline_primitive_array(header: Any, inline_values: str, options: Any) -> List[JsonPrimitive]:
    if not inline_values.strip():
        assert_expected_count(0, header['length'], 'inline array items', options)
        return []
    values = parse_delimited_values(inline_values, header['delimiter'])
    primitives = map_row_values_to_primitives(values)
    assert_expected_count(len(primitives), header['length'], 'inline array items', options)
    return primitives

def decode_list_array(header: Any, cursor: LineCursor, base_depth: Depth, options: Any) -> List[JsonValue]:
    items: List[JsonValue] = []
    item_depth = base_depth + 1
    start_line = None
    end_line = None

    while not cursor.at_end() and len(items) < header['length']:
        line = cursor.peek()
        if not line or line.depth < item_depth:
            break
        is_list_item = line.content.startswith(LIST_ITEM_PREFIX) or line.content == '-'
        if line.depth == item_depth and is_list_item:
            if start_line is None:
                start_line = line.line_number
            end_line = line.line_number
            item = decode_list_item(cursor, item_depth, options)
            items.append(item)
            current_line = cursor.current()
            if current_line:
                end_line = current_line.line_number
        else:
            break

    assert_expected_count(len(items), header['length'], 'list array items', options)
    if getattr(options, 'strict', False) and start_line is not None and end_line is not None:
        validate_no_blank_lines_in_range(start_line, end_line, cursor.get_blank_lines(), getattr(options, 'strict', False), 'list array')
    if getattr(options, 'strict', False):
        validate_no_extra_list_items(cursor, item_depth, header['length'])
    return items

def decode_tabular_array(header: Any, cursor: LineCursor, base_depth: Depth, options: Any) -> List[JsonObject]:
    objects: List[JsonObject] = []
    row_depth = base_depth + 1
    start_line = None
    end_line = None

    while not cursor.at_end() and len(objects) < header['length']:
        line = cursor.peek()
        if not line or line.depth < row_depth:
            break
        if line.depth == row_depth:
            if start_line is None:
                start_line = line.line_number
            end_line = line.line_number
            cursor.advance()
            values = parse_delimited_values(line.content, header['delimiter'])
            assert_expected_count(len(values), len(header['fields']), 'tabular row values', options)
            primitives = map_row_values_to_primitives(values)
            obj = {header['fields'][i]: primitives[i] for i in range(len(header['fields']))}
            objects.append(obj)
        else:
            break

    assert_expected_count(len(objects), header['length'], 'tabular rows', options)
    if getattr(options, 'strict', False) and start_line is not None and end_line is not None:
        validate_no_blank_lines_in_range(start_line, end_line, cursor.get_blank_lines(), getattr(options, 'strict', False), 'tabular array')
    if getattr(options, 'strict', False):
        validate_no_extra_tabular_rows(cursor, row_depth, header)
    return objects

# List item decoding

def decode_list_item(cursor: LineCursor, base_depth: Depth, options: Any) -> JsonValue:
    line = cursor.next()
    if not line:
        raise ReferenceError('Expected list item')
    if line.content == '-':
        return {}
    elif line.content.startswith(LIST_ITEM_PREFIX):
        after_hyphen = line.content[len(LIST_ITEM_PREFIX):]
    else:
        raise SyntaxError(f'Expected list item to start with "{LIST_ITEM_PREFIX}"')
    if not after_hyphen.strip():
        return {}
    if is_array_header_after_hyphen(after_hyphen):
        array_header = parse_array_header_line(after_hyphen, DEFAULT_DELIMITER)
        if array_header:
            return decode_array_from_header(array_header['header'], array_header.get('inlineValues'), cursor, base_depth, options)
    if is_object_first_field_after_hyphen(after_hyphen):
        return decode_object_from_list_item(line, cursor, base_depth, options)
    return parse_primitive_token(after_hyphen)

def decode_object_from_list_item(first_line: ParsedLine, cursor: LineCursor, base_depth: Depth, options: Any) -> JsonObject:
    after_hyphen = first_line.content[len(LIST_ITEM_PREFIX):]
    key_value = decode_key_value(after_hyphen, cursor, base_depth, options)
    key, value, follow_depth, is_quoted = key_value['key'], key_value['value'], key_value['follow_depth'], key_value['is_quoted']
    obj: JsonObject = {key: value}
    quoted_keys: Set[str] = set()
    if is_quoted and DOT in key:
        quoted_keys.add(key)
    while not cursor.at_end():
        line = cursor.peek()
        if not line or line.depth < follow_depth:
            break
        if line.depth == follow_depth and not line.content.startswith(LIST_ITEM_PREFIX):
            cursor.advance()
            kv = decode_key_value(line.content, cursor, follow_depth, options)
            k, v, k_is_quoted = kv['key'], kv['value'], kv['is_quoted']
            obj[k] = v
            if k_is_quoted and DOT in k:
                quoted_keys.add(k)
        else:
            break
    if quoted_keys:
        obj[QUOTED_KEY_MARKER] = quoted_keys
    return obj