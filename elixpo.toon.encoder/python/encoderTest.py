import json
import os
import requests
from encoders import encodeValue
import tiktoken
import dotenv
from nestedCheck import has_nesting, flatten_json
dotenv.load_dotenv()
with open("data/dummy_w_nest.json", "r", encoding="utf-8") as f:
    users = json.load(f)

def count_tokens(text, model="cl100k_base"):
    enc = tiktoken.get_encoding(model)
    return len(enc.encode(text))


print("=== FLATTENING ANALYSIS ===\n")

encoded_flat_direct = encodeValue(
    users,
    options={"indent": 2, "delimiter": ", ", "lengthMarker": True}
)

val, key = flatten_json(users)
print(f"Flattened data keys: {len(val)}")
print(f"Sample flattened (first 3 items):")
for i, (k, v) in enumerate(list(val.items())[:10]):
    print(f"  {k}: {v}")
print()

print(f"Key map entries: {len(key)}")
print(f"Sample path mapping (first 3):")
for i, (k, v) in enumerate(list(key.items())[:10]):
    print(f"  {k} -> {v}")
print()

encoded_flat_module = encodeValue(
    val,
    options={"indent": 2, "delimiter": ", ", "lengthMarker": True}
)

min_str = json.dumps(users, indent=2)

print("=== TOKEN ANALYSIS ===")
print(f"Original nested JSON:        {count_tokens(json.dumps(users, indent=2))} tokens")
print(f"Flattened data only:         {count_tokens(json.dumps(val, indent=2))} tokens")
print(f"Key map (paths):             {count_tokens(json.dumps(key, indent=2))} tokens")
print(f"Combined flat+map:           {count_tokens(json.dumps(val, indent=2) + json.dumps(key, indent=2))} tokens")
print()
print(f"Encoded Direct (nested):     {count_tokens(encoded_flat_direct)} tokens")
print(f"Encoded Flat (optimized):    {count_tokens(encoded_flat_module)} tokens")
print()

original_tokens = count_tokens(json.dumps(users, indent=2))
flat_combined = count_tokens(json.dumps(val, indent=2) + json.dumps(key, indent=2))
savings = ((original_tokens - flat_combined) / original_tokens) * 100
print(f"Token Savings: {savings:.1f}%")
print("\nDONE.")
