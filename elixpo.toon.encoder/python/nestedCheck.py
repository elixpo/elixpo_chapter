import json


dummy_data = {
            "id": 1,
            "name": "John Doe",
            "email": "john.doe@example.com",
            "profile": {
                "age": 28,
                "location": "New York",
                "preferences": {
                    "theme": "dark",
                    "notifications": "true",
                    "language": "en"
                }
            },
            "orders": [
                {
                    "orderId": "ORD-001",
                    "amount": 99.99,
                    "status": "completed"
                }
            ]
        }

def has_nesting(data):
    if isinstance(data, dict):
        return any(isinstance(v, (dict, list)) for v in data.values())
    elif isinstance(data, list):
        return any(isinstance(item, dict) and any(isinstance(v, (dict, list)) for v in item.values()) for item in data)
    return False

def flatten_json(data, parent_key="", out=None, compacted=False):
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
        out[parent_key] = data
    if compacted:
        compacted_out = compact_string(out)
        return compacted_out
    return out


def compact_string(flat_dict):
    parts = []
    for k, v in flat_dict.items():
        if isinstance(v, str):
            parts.append(f"{k}:{v}")
        else:
            parts.append(f"{k}:{v}")
    return "{"+",".join(parts)+"}"


if __name__ == "__main__":
    flatten = flatten_json(dummy_data)
    print("Flattened JSON:", json.dumps(flatten, indent=2))