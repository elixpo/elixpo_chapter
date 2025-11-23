import json

with open("data/dummy_w_nest.json", "r", encoding="utf-8") as f:
    dummy_data = json.load(f)

def has_nesting(data): 
    if isinstance(data, dict): 
        return any(isinstance(v, (dict, list)) for v in data.values()) 
    elif isinstance(data, list): 
        return any(isinstance(item, dict) and any(isinstance(v, (dict, list)) for v in item.values()) for item in data) 
    return False

def flatten(data, parent_key="", out=None):
    if out is None:
        out = {}
    if isinstance(data, dict):
        for key, value in data.items():
            new_key = f"{parent_key}.{key}" if parent_key else key
            flatten(value, new_key, out)
    elif isinstance(data, list):
        for i, item in enumerate(data):
            new_key = f"{parent_key}.{i}"
            flatten(item, new_key, out)
    else:
        out[parent_key] = data  

    return out


def unflatten(flat):
    root = {}

    for composite_key, value in flat.items():
        parts = composite_key.split(".")
        curr = root

        for i, part in enumerate(parts):
            is_last = (i == len(parts) - 1)
            is_digit = part.isdigit()

            if is_digit:
                idx = int(part)

                if not isinstance(curr, list):
                    parent_key = parts[i-1] if i > 0 else None
                    new_list = []
                    if parent_key is None:
                        root = new_list
                        curr = new_list
                    else:
                        curr[parent_key] = new_list
                        curr = new_list
                while len(curr) <= idx:
                    curr.append(None)

                if is_last:
                    curr[idx] = value
                else:
                    if curr[idx] is None:
                        next_is_digit = parts[i+1].isdigit()
                        curr[idx] = [] if next_is_digit else {}
                    curr = curr[idx]
            else:
                if not isinstance(curr, dict):
                    raise TypeError("Mismatch while unflattening")

                if is_last:
                    curr[part] = value
                else:
                    if part not in curr:
                        next_is_digit = parts[i+1].isdigit()
                        curr[part] = [] if next_is_digit else {}
                    curr = curr[part]
    if isinstance(root, dict) and len(root) > 0 and all(k.isdigit() for k in root.keys()):
        max_i = max(int(k) for k in root.keys())
        new_root = [None] * (max_i + 1)
        for k, v in root.items():
            new_root[int(k)] = v
        return new_root

    return root

    

def normalize_unflattened(original, unflat):
    if isinstance(original, list):
        if isinstance(unflat, dict):
            if all(k.isdigit() for k in unflat.keys()):
                max_idx = max(int(k) for k in unflat.keys())
                lst = [None] * (max_idx + 1)
                for k, v in unflat.items():
                    lst[int(k)] = v
                return lst
        return unflat
    return unflat


def is_lossless(a, b):
    return json.dumps(a, sort_keys=True) in json.dumps(b, sort_keys=True)

if __name__ == "__main__":
        print(has_nesting(dummy_data))
        flat = flatten(dummy_data)
        print(json.dumps(flat, indent=2))
        print("\n=== UNFLATTENED DATA ===")
        unflat = unflatten(flat)
        unflat = normalize_unflattened(dummy_data, unflat)
        print(json.dumps(unflat, indent=2))
        print("\n=== COMPARISON DATA ===")
        print(f"Lossless flattening test: {is_lossless(dummy_data, unflat)}")
