from dataTypes import Depth, JsonArray, JsonObject, JsonPrimitive, JsonValue, ResolvedEncodeOptions
from constants import LIST_ITEM_MARKER
from normalize import isArrayOfArrays, isArrayOfObjects, isArrayOfPrimitives, isJsonObject, isJsonArray, isJsonPrimitive
from primitive import encodePrimitive, encodeAndJoinPrimitives, encodeKey, formatHeader
from writer import LineWriter
from typing import Optional

def encodeValue(value: JsonValue, options: ResolvedEncodeOptions) -> str:
    if(isJsonPrimitive(value)):
        return encodePrimitive(value, options['delimiter'])
    writer = LineWriter(options['indent'])
    if(isJsonArray(value)):
        encodeArray(None, value, writer, 0, options)

def encodeArray(
        key: str | None,
        value: JsonArray,
        writer: LineWriter,
        depth: Depth, 
        options: ResolvedEncodeOptions
) -> None:
    if(len(value) == 0):
        header = formatHeader(0, {
            'key': key,
            'delimiter': options['delimiter'],
            'lengthMarker': options['lengthMarker']
        })
        writer.push(depth, header)
        return
    if(isArrayOfPrimitives(value)):
        formatted = encodeInlineArrayLine(value, options['delimiter'], key, options['lengthMarker'])
        writer.push(depth, formatted)
        return
    if (isArrayOfArrays(value)):
        allPrimitiveArrays = all(isArrayOfPrimitives(item) for item in value)
        if(allPrimitiveArrays):
            encodeArrayOfArraysAsListItems(key, value, writer, depth, options)
            return
    if (isArrayOfObjects(value)):
        header = extractTabularHeader(value)
        if(header):
            encodeArrayOfObjectsAsTabular(key, value, header, writer, depth, options)
        else:
            encodeMixedArrayAsListItems(key, value, writer, depth, options)
        return
    

def encodeArrayOfArraysAsListItems(
        prefix: str | None,
        values: JsonArray,
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions

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
        if(isArrayOfPrimitives(arr)):
            inline = encodeInlineArrayLine(arr, options['delimiter'], None, options['lengthMarker'])
            writer.pushListItem(depth + 1, inline)


def encodeInlineArrayLine(
        values: JsonPrimitive,
        delimiter: str,
        prefix: Optional[str],
        lengthMarker: Optional[bool] = '#' or False
) -> str:
    header = formatHeader(
        len(values),
        {
            'key': prefix,
            'delimiter': delimiter,
            'lengthMarker': lengthMarker
        }
    )
    joinedPrimitives = encodeAndJoinPrimitives(values, delimiter)
    if(len(values) == 0):
        return header
    return f"{header} {joinedPrimitives}"

def encodeArrayOfObjectsAsTabular(
        prefix: str | None,
        rows: JsonObject,
        header: list[str],
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions
) -> None:
    formattedHeader = formatHeader(len(rows), {'key': prefix, 'fields': header, 'delimiter': options['delimiter'], 'lengthMarker': options['lengthMarker']})
    writer.push(depth, formattedHeader)
    writeTabularRows(rows, header, writer, depth + 1, options)

def extractTabularHeader(rows: JsonObject) -> Optional[list[str]]:
    if(len(rows) == 0):
        return None
    firstRow = rows[0] if rows else None
    firstKeys = list(firstRow.keys()) if firstRow and isJsonObject(firstRow) else None
    if(len(firstKeys) == 0):
        return
    if (isTabularArray(rows, firstKeys)):
        return firstKeys

def isTabularArray(rows: JsonObject, header: list[str]) -> bool:
    for row in rows:
        keys = list(row.keys()) if isJsonObject(row) else None
        if(len(keys) != len(header)):
            return False
        for key in header:
            if(key not in keys):
                return False
            if not isJsonPrimitive(row[key]):
                return False
    return True


def writeTabularRows(
        rows: JsonObject,
        header: list[str],
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions
) -> None:
    for row in rows:
        values = header.map(lambda key: row[key] if key in row else None)
        joinedValues = encodeAndJoinPrimitives(values, options['delimiter'])
        writer.push(depth, joinedValues)


def encodeMixedArrayAsListItems(
        prefix: str | None,
        items: JsonValue,
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions
) -> None:
    header = formatHeader(len(items), {'key': prefix, 'delimiter': options['delimiter'], 'lengthMarker': options['lengthMarker']})
    writer.push(depth, header)
    for item in items:
        encodeListItemValue(item, writer, depth + 1, options)

def encodeObjectAsListItem(
        obj: JsonObject,
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions  
) -> None:
    keys = list(obj.keys())
    if(len(keys) == 0):
        writer.push(depth, LIST_ITEM_MARKER)
        return
    
    firstKey = keys[0] if keys else None
    encodedKey = encodeKey(firstKey) 
    firstValue = obj[firstKey] if firstKey and firstKey in obj else None

    if(isJsonPrimitive(firstValue)):
        writer.pushListItem(depth, f"{encodedKey} {encodePrimitive(firstValue, options['delimiter'])}")
    
    elif (isJsonArray(firstValue)):
        if(isArrayOfPrimitives(firstValue)):
            formatted = encodeInlineArrayLine(firstValue, options['delimiter'], encodedKey, options['lengthMarker'])
            writer.pushListItem(depth, formatted)
        elif(isArrayOfObjects(firstValue)):
            header = extractTabularHeader(firstValue)
            if(header):
                formattedHeader = formatHeader(
                    len(firstValue),
                    {
                        'key': encodedKey,
                        'fields': header,
                        'delimiter': options['delimiter'],
                        'lengthMarker': options['lengthMarker']
                    }
                )
                writer.pushListItem(depth, formattedHeader)
                writeTabularRows(firstValue, header, writer, depth + 1, options)
            elif(isArrayOfObjects(firstValue)):
                writer.pushListItem(depth, f"{encodedKey}[{len(firstValue)}]:")
                for items in firstValue:
                    encodeListItemValue(items, writer, depth + 1, options)
        else:
            writer.pushListItem(depth, f"{encodedKey}[{len(firstValue)}]:")
            for iteems in firstValue:
                encodeListItemValue(items, writer, depth + 1, options)

    elif (isJsonObject(firstValue)):
        nestedKeys = list(firstValue.keys())
        if(len(nestedKeys) == 0 ):
            writer.pushListItem(depth, f"{encodedKey}:")
        else:
            writer.pushListItem(depth, f"{encodedKey}:")
            encodeObjectAsListItem(firstValue, writer, depth + 2, options)
    
    for i in range(1, len(keys)):
        key = keys[i] if keys else None
        encodeKeyValuePair(key, obj[key] if key and key in obj else None, writer, depth + 1, options)


def encodeKeyValuePair(key: str, value: JsonValue, writer: LineWriter, depth: Depth, options: ResolvedEncodeOptions) -> None:
    encodeKey = encodeKey(key)
    if(isJsonPrimitive(value)):
        writer.push(depth, f"{encodeKey} {encodePrimitive(value, options['delimiter'])}")
    elif (isJsonArray(value)):
        encodeArray(key, value, writer, depth, options)
    elif (isJsonObject(value)):
        nestedKeys = list(value.keys())
        if(len(nestedKeys) == 0):
            writer.push(depth, f"{encodeKey}:")
        else:
            writer.push(depth, f"{encodeKey}:")
            encodeObjectAsListItem(value, writer, depth + 1, options)  


def encodeListItemValue(
        value: JsonValue,
        writer: LineWriter,
        depth: Depth,
        options: ResolvedEncodeOptions
) -> None:
    if(isJsonPrimitive(value)):
        writer.pushListItem(depth, encodePrimitive(value, options['delimiter']))
    elif (isJsonArray(value) and isArrayOfPrimitives(value)):
        inline = encodeInlineArrayLine(value, options['delimiter'], None, options['lengthMarker'])
        writer.pushListItem(depth, inline)
    elif (isJsonObject(value)):
        encodeObjectAsListItem(value, writer, depth, options)
        