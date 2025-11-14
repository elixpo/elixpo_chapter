from __future__ import annotations
from dataclasses import dataclass
from typing import Optional, Union, Dict, List, Any
from constants import Delimiter, DelimiterKey, DEFAULT_DELIMITER

type JsonPrimitive = Union[str, int, float, bool, None]
type JsonValue = Union[JsonPrimitive, "JsonObject", "JsonArray"]
type JsonObject = Dict[str, JsonValue]
type JsonArray = List[JsonValue]


class ParsedLine:
    raw: str
    depth: Depth   
    indent: int
    content: str
    line_number: int


class ArrayHeaderInfo:
    key: Optional[str] = None
    length: int 
    delimiter: Delimiter
    fields: Optional[list[str]] = None
    hasLengthMarker: bool

class BlankLineInfo:
    lineNumber: int 
    indent: int 
    depth: Depth

class DecodeOptions:
    indent: Optional[int] = 2
    strict: Optional[bool] = True

class EncodeOptions:
    indent: Optional[int] = 2
    delimiter: Optional[Delimiter] = DEFAULT_DELIMITER
    lengthMarker: Optional[bool] = '#' or False

type Depth = int

type ResolvedEncodeOptions = EncodeOptions