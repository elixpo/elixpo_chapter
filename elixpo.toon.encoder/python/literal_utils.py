from constants import FALSE_LITERAL, NULL_LITERAL, TRUE_LITERAL
import math 

def isBooleanOrNullLiteral(token: str) -> bool:
    return token == TRUE_LITERAL or token == FALSE_LITERAL or token == NULL_LITERAL

def isNumericLiteral(token: str) -> bool:
   
   if(not token):
       return False
   if(len(token) > 1 and token[0] == "0" and token[1] != "."):
       return False
   neumericValue = int(token)
   return not math.isnan(neumericValue) and math.isfinite(neumericValue)
   
