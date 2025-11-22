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

def flatten_json(data, parent_key="", out=None):
    if out is None:
        out = {}

    if isinstance(data, dict):
        for key, value in data.items():
            new_key = f"{parent_key}.{key}" if parent_key else key
            flatten_json(value, new_key, out)

    elif isinstance(data, list):
        for idx, item in enumerate(data):
            new_key = f"{parent_key}[{idx}]"
            flatten_json(item, new_key, out)

    else:
        out[parent_key] = data

    return out

if __name__ == "__main__":
    flatten = flatten_json(dummy_data)
    print("Flattened JSON:", flatten)