from typing import Any, Dict, List, Set, Union, Optional
from constants import DOT
from dataTypes import JsonValue, JsonObject

QUOTED_KEY_MARKER = 'quotedKey'

class ObjectWithQuotedKeys(dict):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self._quoted_keys: Set[str] = set()

    def mark_quoted(self, key: str):
        self._quoted_keys.add(key)

    def is_quoted(self, key: str) -> bool:
        return key in self._quoted_keys

def is_json_object(value: Any) -> bool:
    return isinstance(value, dict)

def is_identifier_segment(segment: str) -> bool:
    return segment.isidentifier()

def can_merge(a: JsonValue, b: JsonValue) -> bool:
    return is_json_object(a) and is_json_object(b)

def merge_objects(target: JsonObject, source: JsonObject, strict: bool) -> None:
    for key, source_value in source.items():
        target_value = target.get(key)
        if target_value is None:
            target[key] = source_value
        elif can_merge(target_value, source_value):
            merge_objects(target_value, source_value, strict)
        else:
            if strict:
                raise TypeError(
                    f'Path expansion conflict at key "{key}": cannot merge {type(target_value).__name__} with {type(source_value).__name__}'
                )
            target[key] = source_value

def insert_path_safe(
    target: JsonObject,
    segments: List[str],
    value: JsonValue,
    strict: bool
) -> None:
    current_node = target
    for i in range(len(segments) - 1):
        current_segment = segments[i]
        segment_value = current_node.get(current_segment)
        if segment_value is None:
            new_obj = {}
            current_node[current_segment] = new_obj
            current_node = new_obj
        elif is_json_object(segment_value):
            current_node = segment_value
        else:
            if strict:
                raise TypeError(
                    f'Path expansion conflict at segment "{current_segment}": expected object but found {type(segment_value).__name__}'
                )
            new_obj = {}
            current_node[current_segment] = new_obj
            current_node = new_obj

    last_seg = segments[-1]
    destination_value = current_node.get(last_seg)
    if destination_value is None:
        current_node[last_seg] = value
    elif can_merge(destination_value, value):
        merge_objects(destination_value, value, strict)
    else:
        if strict:
            raise TypeError(
                f'Path expansion conflict at key "{last_seg}": cannot merge {type(destination_value).__name__} with {type(value).__name__}'
            )
        current_node[last_seg] = value

def expand_paths_safe(value: JsonValue, strict: bool) -> JsonValue:
    if isinstance(value, list):
        return [expand_paths_safe(item, strict) for item in value]

    if is_json_object(value):
        expanded_object: JsonObject = {}
        quoted_keys: Optional[Set[str]] = None
        if isinstance(value, ObjectWithQuotedKeys):
            quoted_keys = value._quoted_keys

        for key, key_value in value.items():
            is_quoted = quoted_keys is not None and key in quoted_keys

            if DOT in key and not is_quoted:
                segments = key.split(DOT)
                if all(is_identifier_segment(seg) for seg in segments):
                    expanded_value = expand_paths_safe(key_value, strict)
                    insert_path_safe(expanded_object, segments, expanded_value, strict)
                    continue

            expanded_value = expand_paths_safe(key_value, strict)
            if key in expanded_object:
                conflicting_value = expanded_object[key]
                if can_merge(conflicting_value, expanded_value):
                    merge_objects(conflicting_value, expanded_value, strict)
                else:
                    if strict:
                        raise TypeError(
                            f'Path expansion conflict at key "{key}": cannot merge {type(conflicting_value).__name__} with {type(expanded_value).__name__}'
                        )
                    expanded_object[key] = expanded_value
            else:
                expanded_object[key] = expanded_value

        return expanded_object

    return value