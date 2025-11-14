from dataTypes import JsonArray, JsonObject, JsonPrimitive, JsonValue
from typing import Union, Optional
from math import isfinite
from datetime import datetime


def normalizeValue(value) -> JsonValue:
    if(value == None):
        return None
    elif isinstance(value, (str,bool)):
        return value
    elif isinstance(value, (int, float)):
        if value == 0 and str(value).startswith('-'):
            return 0
        if not isfinite(value):
            return None
        return value
    elif isinstance(value, datetime):
        return value.isoformat()
    
    elif isinstance(value, list):
        return [normalizeValue(item) for item in value]
    elif isinstance(value, set):
        return [normalizeValue(item) for item in value]
    elif isinstance(value, dict):
        result = {}
        for key, val in value.items():
            result[str(key)] = normalizeValue(val)
        return result
    elif (isPlainObject(value)):
        result = dict[str, "JsonValue"] = {}
        for key, val in value.items():
            result[str(key)] = normalizeValue(val)
        return result

    else:
        return None
    
def isJsonPrimitive(value) -> bool:
    return value == None or isinstance(value, (str, int, float, bool))

def isJsonObject(value) -> bool:
    return value != None and isinstance(value, dict) and not isinstance(value, list)

def isJsonArray(value) -> JsonArray:
    return isinstance(value, list)

def isPlainObject(value) -> str:
    if(value == None or not isinstance(value, dict)):
        return False
    prototype = type(value)
    return prototype == None or prototype == dict

def isArrayOfPrimitives(value: JsonArray) -> JsonPrimitive:
    return all(isJsonPrimitive(item) for item in value)

def isArrayOfArrays(value: JsonArray) -> JsonArray:
    return all(isinstance(item, list) for item in value)

def isArrayOfObjects(value: JsonArray) -> JsonArray:
    return all(isJsonObject(item) for item in value)
