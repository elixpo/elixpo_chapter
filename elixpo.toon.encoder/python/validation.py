from constants import COMMA, LIST_ITEM_MARKER
from literal_utils import isBooleanOrNullLiteral
import re
from typing import Optional

def isValidUnquotedKey(key: str) -> bool: 
    return re.match(r'^[A-Z_][\w.]*$', key, re.IGNORECASE) is not None


def isNumericLike(value: str) -> bool:
    return re.match(r'^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$', value, re.IGNORECASE) is not None or re.match(r'^0\d+$', value) is not None

def isSafeUnquoted(value: str, delimiter: Optional[str] = COMMA) -> bool:
   if (not value):
       return False
   if(value != value.strip()):
       return False
   if (isBooleanOrNullLiteral(value) or isNumericLike(value)):
         return False
   if ('"' in value or "\\" in value):
         return False
   if(re.match(r'[\[\]{}]', value)):
         return False
   if (re.match(r'[\n\r\t]', value)):
         return False
   if (delimiter and delimiter in value):
         return False
   if (value.startswith(LIST_ITEM_MARKER)):
         return False
   return True