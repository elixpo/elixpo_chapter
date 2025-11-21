import json

def has_nesting(data):
    if isinstance(data, dict):
        return any(isinstance(v, (dict, list)) for v in data.values())
    elif isinstance(data, list):
        return any(isinstance(item, dict) and any(isinstance(v, (dict, list)) for v in item.values()) for item in data)
    return False

def flatten_json(data, out=None, key_map=None, prefix="k"):
    if out is None:
        out = {}
    if key_map is None:
        key_map = {}

    counter = 0
    value_map = {} 
    
    def _flatten(value, path_parts):
        nonlocal counter
        
        if not isinstance(value, (dict, list)):
            value_str = json.dumps(value, sort_keys=True)
            if value_str in value_map:
                return value_map[value_str] 
            
            key = str(counter)
            out[key] = value
            path_str = ".".join(str(p) if isinstance(p, str) else f"[{p}]" for p in path_parts)
            key_map[key] = path_str if path_str else "root"
            value_map[value_str] = key
            counter += 1
            return key
        
        if isinstance(value, dict):
            for k, v in value.items():
                _flatten(v, path_parts + (k,))
        elif isinstance(value, list):
            for i, v in enumerate(value):
                _flatten(v, path_parts + (i,))
    
    _flatten(data, ())
    return out, key_map

def unflatten_json(flat_data, key_map):
    result = {}
    for key, path_str in key_map.items():
        if path_str == "root":
            result = flat_data[key]
        else:
            _set_nested(result, path_str, flat_data[key])
    return result

def _set_nested(obj, path_str, value):
    parts = _parse_path(path_str)
    current = obj
    for part in parts[:-1]:
        if isinstance(part, int):
            if not isinstance(current, list):
                current = []
            while len(current) <= part:
                current.append(None)
            current = current[part]
        else:
            if part not in current:
                current[part] = {}
            current = current[part]
    
    last = parts[-1]
    if isinstance(last, int):
        current[last] = value
    else:
        current[last] = value

def _parse_path(path_str):
    import re
    parts = []
    for match in re.finditer(r'(\w+)|\[(\d+)\]', path_str):
        if match.group(1):
            parts.append(match.group(1))
        else:
            parts.append(int(match.group(2)))
    return parts