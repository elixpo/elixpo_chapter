
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

    def _flatten(value, path):
        nonlocal counter

        if not isinstance(value, (dict, list)):
            short_key = f"{prefix}{counter}"
            out[short_key] = value
            key_map[short_key] = path
            counter += 1
            return

        if isinstance(value, dict):
            for k, v in value.items():
                new_path = f"{path}.{k}" if path else k
                _flatten(v, new_path)

        elif isinstance(value, list):
            for i, v in enumerate(value):
                new_path = f"{path}[{i}]"
                _flatten(v, new_path)

    _flatten(data, "")
    return out, key_map
