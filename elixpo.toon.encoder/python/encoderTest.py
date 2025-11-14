from encoders import encodeValue
import json


with open("data/dummy_w_nest.json") as j:
        users = json.load(j)
        print( users)
        # encoded = encodeValue(users, {'indent': 2, 'delimiter': ',', 'lengthMarker': True})
        # print(encoded)
        