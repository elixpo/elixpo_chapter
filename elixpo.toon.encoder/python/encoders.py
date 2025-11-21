from dataTypes import Depth, JsonArray, JsonObject, JsonPrimitive, JsonValue, ResolvedEncodeOptions
from constants import LIST_ITEM_MARKER
from normalize import isArrayOfArrays, isArrayOfObjects, isArrayOfPrimitives, isJsonArray, isJsonObject, isJsonPrimitive
from primitive import encodePrimitive, encodeAndJoinPrimitives, encodeKey, formatHeader
from nestedCheck import has_nesting, flatten_json
from writer import LineWriter
from typing import Optional, Sequence


def encodeValue(value: JsonValue, options: ResolvedEncodeOptions) -> str:
    if (has_nesting(value) == True):
        value, key = flatten_json(value)
    if isJsonPrimitive(value):
        return encodePrimitive(value, options['delimiter'])
    writer = LineWriter(options['indent'])

    if isJsonArray(value):
        encodeArray(None, value, writer, 0, options)
    elif isJsonObject(value):
        encodeObject(value, writer, 0, options)

    return writer.toString()


def encodeObject(value: JsonObject, writer: LineWriter, depth: Depth, options: ResolvedEncodeOptions) -> None:
    keys = list(value.keys())

    for key in keys:
        encodeKeyValuePair(key, value[key], writer, depth, options)


def encodeKeyValuePair(key: str, value: JsonValue, writer: LineWriter, depth: Depth, options: ResolvedEncodeOptions) -> None:
    encoded_key = encodeKey(key)

    if isJsonPrimitive(value):
        writer.push(depth, f"{encoded_key}: {encodePrimitive(value, options['delimiter'])}")
    elif isJsonArray(value):
        encodeArray(key, value, writer, depth, options)
    elif isJsonObject(value):
        nested_keys = list(value.keys())
        if len(nested_keys) == 0:
            writer.push(depth, f"{encoded_key}:")
        else:
            writer.push(depth, f"{encoded_key}:")
            encodeObject(value, writer, depth + 1, options)


def encodeArray(
    key: Optional[str],
    value: JsonArray,
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    if len(value) == 0:
        header = formatHeader(0, {
            'key': key,
            'delimiter': options['delimiter'],
            'lengthMarker': options['lengthMarker']
        })
        writer.push(depth, header)
        return

    if isArrayOfPrimitives(value):
        formatted = encodeInlineArrayLine(value, options['delimiter'], key, options['lengthMarker'])
        writer.push(depth, formatted)
        return

    if isArrayOfArrays(value):
        all_primitive_arrays = all(isArrayOfPrimitives(arr) for arr in value)
        if all_primitive_arrays:
            encodeArrayOfArraysAsListItems(key, value, writer, depth, options)
            return

    if isArrayOfObjects(value):
        header = extractTabularHeader(value)
        if header:
            encodeArrayOfObjectsAsTabular(key, value, header, writer, depth, options)
        else:
            encodeMixedArrayAsListItems(key, value, writer, depth, options)
        return

    encodeMixedArrayAsListItems(key, value, writer, depth, options)


def encodeArrayOfArraysAsListItems(
    prefix: Optional[str],
    values: Sequence[JsonArray],
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    header = formatHeader(
        len(values),
        {
            'key': prefix,
            'delimiter': options['delimiter'],
            'lengthMarker': options['lengthMarker']
        }
    )
    writer.push(depth, header)

    for arr in values:
        if isArrayOfPrimitives(arr):
            inline = encodeInlineArrayLine(arr, options['delimiter'], None, options['lengthMarker'])
            writer.pushListItem(depth + 1, inline)


def encodeInlineArrayLine(
    values: Sequence[JsonPrimitive],
    delimiter: str,
    prefix: Optional[str] = None,
    lengthMarker: Optional[str] = None,
) -> str:
    header = formatHeader(
        len(values),
        {
            'key': prefix,
            'delimiter': delimiter,
            'lengthMarker': lengthMarker
        }
    )
    joined_value = encodeAndJoinPrimitives(list(values), delimiter)
    if len(values) == 0:
        return header
    return f"{header} {joined_value}"


def encodeArrayOfObjectsAsTabular(
    prefix: Optional[str],
    rows: Sequence[JsonObject],
    header: Sequence[str],
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    formatted_header = formatHeader(
        len(rows),
        {
            'key': prefix,
            'fields': list(header),
            'delimiter': options['delimiter'],
            'lengthMarker': options['lengthMarker']
        }
    )
    writer.push(depth, formatted_header)
    writeTabularRows(rows, header, writer, depth + 1, options)


def extractTabularHeader(rows: Sequence[JsonObject]) -> Optional[list[str]]:
    if len(rows) == 0:
        return None

    first_row = rows[0]
    first_keys = list(first_row.keys()) if isJsonObject(first_row) else []
    if len(first_keys) == 0:
        return None

    if isTabularArray(rows, first_keys):
        return first_keys

    return None


def isTabularArray(rows: Sequence[JsonObject], header: Sequence[str]) -> bool:
    for row in rows:
        keys = list(row.keys()) if isJsonObject(row) else []

        if len(keys) != len(header):
            return False

        for key in header:
            if key not in row:
                return False
            if not isJsonPrimitive(row[key]):
                return False

    return True


def writeTabularRows(
    rows: Sequence[JsonObject],
    header: Sequence[str],
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    for row in rows:
        values = [row.get(key) for key in header]
        joined_value = encodeAndJoinPrimitives(values, options['delimiter'])
        writer.push(depth, joined_value)


def encodeMixedArrayAsListItems(
    prefix: Optional[str],
    items: Sequence[JsonValue],
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    header = formatHeader(
        len(items),
        {
            'key': prefix,
            'delimiter': options['delimiter'],
            'lengthMarker': options['lengthMarker']
        }
    )
    writer.push(depth, header)

    for item in items:
        encodeListItemValue(item, writer, depth + 1, options)


def encodeObjectAsListItem(
    obj: JsonObject,
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    keys = list(obj.keys())
    if len(keys) == 0:
        writer.push(depth, LIST_ITEM_MARKER)
        return

    first_key = keys[0]
    encoded_key = encodeKey(first_key)
    first_value = obj[first_key]

    if isJsonPrimitive(first_value):
        writer.pushListItem(depth, f"{encoded_key}: {encodePrimitive(first_value, options['delimiter'])}")
    elif isJsonArray(first_value):
        if isArrayOfPrimitives(first_value):
            formatted = encodeInlineArrayLine(first_value, options['delimiter'], first_key, options['lengthMarker'])
            writer.pushListItem(depth, formatted)
        elif isArrayOfObjects(first_value):
            header = extractTabularHeader(first_value)
            if header:
                formatted_header = formatHeader(
                    len(first_value),
                    {
                        'key': first_key,
                        'fields': header,
                        'delimiter': options['delimiter'],
                        'lengthMarker': options['lengthMarker']
                    }
                )
                writer.pushListItem(depth, formatted_header)
                writeTabularRows(first_value, header, writer, depth + 1, options)
            else:
                writer.pushListItem(depth, f"{encoded_key}[{len(first_value)}]:")
                for item in first_value:
                    encodeObjectAsListItem(item, writer, depth + 1, options)
        else:
            writer.pushListItem(depth, f"{encoded_key}[{len(first_value)}]:")
            for item in first_value:
                encodeListItemValue(item, writer, depth + 1, options)
    elif isJsonObject(first_value):
        nested_keys = list(first_value.keys())
        if len(nested_keys) == 0:
            writer.pushListItem(depth, f"{encoded_key}:")
        else:
            writer.pushListItem(depth, f"{encoded_key}:")
            encodeObject(first_value, writer, depth + 2, options)

    for i in range(1, len(keys)):
        key = keys[i]
        encodeKeyValuePair(key, obj[key], writer, depth + 1, options)


def encodeListItemValue(
    value: JsonValue,
    writer: LineWriter,
    depth: Depth,
    options: ResolvedEncodeOptions,
) -> None:
    if isJsonPrimitive(value):
        writer.pushListItem(depth, encodePrimitive(value, options['delimiter']))
    elif isJsonArray(value) and isArrayOfPrimitives(value):
        inline = encodeInlineArrayLine(value, options['delimiter'], None, options['lengthMarker'])
        writer.pushListItem(depth, inline)
    elif isJsonObject(value):
        encodeObjectAsListItem(value, writer, depth, options)