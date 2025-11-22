import json
from encoders import encodeValue
import tiktoken
import dotenv
from nestedCheck import flatten_json

dotenv.load_dotenv()

with open("data/dummy_w_nest.json", "r", encoding="utf-8") as f:
    users_nested = json.load(f)

with open("data/dummy_wt_nest.json", "r", encoding="utf-8") as f:
    users_not_nested = json.load(f)

def count_tokens(text, model="cl100k_base"):
    enc = tiktoken.get_encoding(model)
    return len(enc.encode(text))


def _count_keys(obj):
    count = 0
    if isinstance(obj, dict):
        count += len(obj)
        for v in obj.values():
            count += _count_keys(v)
    elif isinstance(obj, list):
        for v in obj:
            count += _count_keys(v)
    return count



print("=== LOSSLESS FLATTENING ANALYSIS ===\n")
nested_json = json.dumps(users_nested, indent=2)
nested_tokens = count_tokens(nested_json)
non_nested_json = json.dumps(users_not_nested, indent=2)
non_nested_tokens = count_tokens(non_nested_json)


flat_data = flatten_json(users_nested, compacted=False)
print(f"Flattened entries: {len(flat_data)}")


flat__nested_json = json.dumps(flat_data, indent=2)
flat__nested_tokens = count_tokens(flat__nested_json)
flatten_toon_tokens_nested = count_tokens(encodeValue(flat_data, options={"indent" : 2, "delimiter": ",", "lengthMarker": True}))
flatten_toon_tokens_non_nested = count_tokens(encodeValue(users_not_nested, options={"indent" : 2, "delimiter": ",", "lengthMarker": True}))




print("=== TOKEN COMPARISON ===")
print(f"Original non-nested JSON Tokens Count:        {non_nested_tokens} tokens")
print(f"Original nested JSON Tokens Count:        {nested_tokens} tokens")
print(f"Flattened nested JSON Tokens Count:   {flatten_toon_tokens_nested} tokens")
print(f"Flattened toon encoded Non Nested:   {flatten_toon_tokens_non_nested} tokens")

savings_nested = ((nested_tokens - flatten_toon_tokens_nested) / nested_tokens) * 100
savings_non_nested = ((non_nested_tokens - flatten_toon_tokens_non_nested) / non_nested_tokens) * 100
print(f"\nToken Savings for non-nested: {savings_non_nested:.1f}%")
print(f"\nToken Savings for nested: {savings_nested:.1f}%")


