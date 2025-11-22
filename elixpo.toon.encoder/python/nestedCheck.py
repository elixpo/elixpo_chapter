import json
import urllib.parse
# from testDummydata import dummyData as dummy_data
# --------------------------------------------------
# FLATTEN
# --------------------------------------------------

with open("data/dummy_w_nest.json", "r", encoding="utf-8") as f:
    dummy_data = json.load(f)

def has_nesting(data): 
    if isinstance(data, dict): 
        return any(isinstance(v, (dict, list)) for v in data.values()) 
    elif isinstance(data, list): 
        return any(isinstance(item, dict) and any(isinstance(v, (dict, list)) for v in item.values()) for item in data) 
    return False

def encode_value(v):
    if isinstance(v, str):
        return urllib.parse.quote(v, safe="")
    if v is True:
        return "true"
    if v is False:
        return "false"
    if v is None:
        return "null"
    return str(v)  # numbers

def flatten_json(data, parent_key="", out=None):
    if out is None:
        out = {}

    if isinstance(data, dict):
        for key, value in data.items():
            new_key = f"{parent_key}.{key}" if parent_key else key
            flatten_json(value, new_key, out)

    elif isinstance(data, list):
        for idx, item in enumerate(data):
            new_key = f"{parent_key}-{idx}"
            flatten_json(item, new_key, out)

    else:
        out[parent_key] = encode_value(data)

    return out


def compact_string(flat_dict):
    return "{" + ",".join(f"{k}:{v}" for k, v in flat_dict.items()) + "}"


# --------------------------------------------------
# UNFLATTEN
# --------------------------------------------------

def decode_value(v):
    if v.isdigit():
        return int(v)

    try:
        f = float(v)
        return f
    except:
        pass

    lower = v.lower()
    if lower == "true":
        return True
    if lower == "false":
        return False
    if lower == "null":
        return None

    # URL-decode string
    return urllib.parse.unquote(v)


def unflatten_json(flat):
    if isinstance(flat, str):
        flat = flat.strip("{}")
        parts = flat.split(",")
        flat_dict = {}
        for part in parts:
            key, value = part.split(":", 1)
            flat_dict[key] = decode_value(value)
    else:
        flat_dict = {k: decode_value(v) for k, v in flat.items()}

    # Check if root should be a list
    root_is_list = any(key.startswith("-") for key in flat_dict.keys())
    root = [] if root_is_list else {}

    for key, value in flat_dict.items():
        segments = key.split(".")
        current = root
        
        for i, seg in enumerate(segments):
            if "-" in seg:
                parts = seg.split("-")
                base = parts[0] if parts[0] else None
                idx = int(parts[1])
                
                if isinstance(current, list):
                    # Root level list
                    while len(current) <= idx:
                        current.append(None)
                    
                    if i == len(segments) - 1:
                        current[idx] = value
                    else:
                        if current[idx] is None:
                            current[idx] = {}
                        current = current[idx]
                else:
                    # Dict with list property
                    if base not in current:
                        current[base] = []

                    while len(current[base]) <= idx:
                        current[base].append(None)

                    if i == len(segments) - 1:
                        current[base][idx] = value
                    else:
                        if current[base][idx] is None:
                            current[base][idx] = {}
                        current = current[base][idx]
            else:
                # Handle non-hyphenated segments
                if isinstance(current, list):
                    idx = int(seg)
                    while len(current) <= idx:
                        current.append(None)
                    if i == len(segments) - 1:
                        current[idx] = value
                    else:
                        if current[idx] is None:
                            current[idx] = {}
                        current = current[idx]
                else:
                    if i == len(segments) - 1:
                        current[seg] = value
                    else:
                        if seg not in current:
                            current[seg] = {}
                        current = current[seg]

    return root


# --------------------------------------------------
# LOSSLESS CHECK
# --------------------------------------------------

def is_lossless(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)


# --------------------------------------------------
# TEST
# --------------------------------------------------

if __name__ == "__main__":
    flatten = flatten_json(dummy_data)
    compact = compact_string(flatten)
    restore = unflatten_json(compact)

    print("Flattened:", compact)
    print("Lossless round-trip:", is_lossless(dummy_data, unflatten_json(flatten_json(dummy_data))))
