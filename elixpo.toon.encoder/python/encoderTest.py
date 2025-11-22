import json
from encoders import encodeValue
from decoder import decode_value_from_lines, LineCursor, ParsedLine
import tiktoken
import dotenv
from nestedCheck import flatten_json, unflatten_json

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


def parse_encoded_text(encoded_text: str) -> LineCursor:
    """Convert encoded text into LineCursor for decoding"""
    lines = encoded_text.split('\n')
    parsed_lines = []
    for line_num, line in enumerate(lines):
        if line or line_num == 0:  # Keep track of all lines including empty
            depth = (len(line) - len(line.lstrip())) // 2  # Assuming 2-space indent
            content = line.strip() if line.strip() else ""
            parsed_lines.append(ParsedLine(content, depth, line_num))
    return LineCursor(parsed_lines)


def test_roundtrip_with_unflatten(original_data, test_name: str, should_flatten=False):
    """Test: encode -> decode -> unflatten roundtrip"""
    options = {"indent": 2, "delimiter": ",", "lengthMarker": True}
    
    try:
        print(f"\n{'='*60}")
        print(f"TEST: {test_name}")
        print(f"{'='*60}")
        
        # Step 1: Encode
        print("\n[STEP 1] Encoding...")
        encoded = encodeValue(original_data, options)
        print(f"Encoded output:\n{encoded[:200]}..." if len(encoded) > 200 else f"Encoded output:\n{encoded}")
        
        # Step 2: Decode
        print("\n[STEP 2] Decoding...")
        cursor = parse_encoded_text(encoded)
        decoded_flat = decode_value_from_lines(cursor, options)
        print(f"Decoded (flat): {type(decoded_flat).__name__}")
        
        # Step 3: Unflatten if data was flattened during encoding
        print("\n[STEP 3] Unflattening...")
        if should_flatten or isinstance(decoded_flat, dict):
            decoded_final = unflatten_json(decoded_flat)
            print(f"Unflattened: {type(decoded_final).__name__}")
        else:
            decoded_final = decoded_flat
        
        # Step 4: Compare
        print("\n[STEP 4] Comparing...")
        if decoded_final == original_data:
            print(f"✓ PASS: {test_name}")
            print(f"Original and decoded data match perfectly!")
            return True
        else:
            print(f"✗ FAIL: {test_name}")
            print(f"\nOriginal data:")
            print(json.dumps(original_data, indent=2)[:500])
            print(f"\nDecoded data:")
            print(json.dumps(decoded_final, indent=2)[:500])
            
            # Show differences
            if isinstance(original_data, dict) and isinstance(decoded_final, dict):
                orig_keys = set(original_data.keys())
                decoded_keys = set(decoded_final.keys())
                if orig_keys != decoded_keys:
                    print(f"\nKey differences:")
                    print(f"  Missing keys: {orig_keys - decoded_keys}")
                    print(f"  Extra keys: {decoded_keys - orig_keys}")
            return False
            
    except Exception as e:
        print(f"✗ ERROR in {test_name}: {str(e)}")
        import traceback
        traceback.print_exc()
        return False


print("\n" + "="*60)
print("ROUNDTRIP TESTS: encode -> decode -> unflatten")
print("="*60)

tests_passed = 0
tests_total = 0

tests_total += 1
if test_roundtrip_with_unflatten(users_not_nested, "Non-Nested JSON Data", should_flatten=False):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten(users_nested, "Nested JSON Data", should_flatten=True):
    tests_passed += 1

tests_total += 1
if test_roundtrip_with_unflatten(
    {"name": "John", "age": 30, "city": "NYC"},
    "Simple Object",
    should_flatten=False
):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten(
    [{"id": 1, "name": "Alice"}, {"id": 2, "name": "Bob"}],
    "Array of Objects (Tabular)",
    should_flatten=False
):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten(
    [1, 2, 3, 4, 5],
    "Array of Primitives",
    should_flatten=False
):
    tests_passed += 1

tests_total += 1
if test_roundtrip_with_unflatten(
    {"user": {"name": "John", "address": {"city": "NYC", "zip": "10001"}}},
    "Nested Object",
    should_flatten=True
):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten([], "Empty Array", should_flatten=False):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten({}, "Empty Object", should_flatten=False):
    tests_passed += 1
tests_total += 1
if test_roundtrip_with_unflatten(
    {
        "name": "Test",
        "values": [1, 2, 3],
        "metadata": {"version": "1.0", "active": True}
    },
    "Mixed Types Object",
    should_flatten=True
):
    tests_passed += 1


print(f"\n\n{'='*60}")
print("TEST SUMMARY")
print(f"{'='*60}")
print(f"Passed: {tests_passed}/{tests_total}")
print(f"Failed: {tests_total - tests_passed}/{tests_total}")
print(f"Success Rate: {(tests_passed/tests_total)*100:.1f}%")
print("="*60)

print("\n" + "="*60)
print("LOSSLESS FLATTENING ANALYSIS")
print("="*60 + "\n")

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

print("\n=== TOKEN COMPARISON ===")
print(f"Original non-nested JSON Tokens Count:        {non_nested_tokens} tokens")
print(f"Original nested JSON Tokens Count:        {nested_tokens} tokens")
print(f"Flattened nested JSON Tokens Count:   {flatten_toon_tokens_nested} tokens")
print(f"Flattened toon encoded Non Nested:   {flatten_toon_tokens_non_nested} tokens")

savings_nested = ((nested_tokens - flatten_toon_tokens_nested) / nested_tokens) * 100
savings_non_nested = ((non_nested_tokens - flatten_toon_tokens_non_nested) / non_nested_tokens) * 100
print(f"\nToken Savings for non-nested: {savings_non_nested:.1f}%")
print(f"Token Savings for nested: {savings_nested:.1f}%")