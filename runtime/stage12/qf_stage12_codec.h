#pragma once

#include <stddef.h>
#include <stdint.h>

// Include kernels.qtask.h before this header for qf_block_t.

// Base64 keeps Stage 12 requests within the 128-byte Bridge payload envelope
// verified in Stage 1; both executors decode with this same routine.
static inline int qf_base64_value(char symbol) {
  if (symbol >= 'A' && symbol <= 'Z') return symbol - 'A';
  if (symbol >= 'a' && symbol <= 'z') return symbol - 'a' + 26;
  if (symbol >= '0' && symbol <= '9') return symbol - '0' + 52;
  if (symbol == '+') return 62;
  if (symbol == '/') return 63;
  return -1;
}

static inline bool qf_decode_block(const char *text, size_t length, qf_block_t *block) {
  size_t written = 0;
  uint32_t buffer = 0;
  int bits = 0;
  for (size_t i = 0; i < length; ++i) {
    if (text[i] == '=') break;
    const int value = qf_base64_value(text[i]);
    if (value < 0) return false;
    buffer = (buffer << 6) | (uint32_t)value;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      if (written == QF_BLOCK_BYTES) return false;
      block->bytes[written++] = (uint8_t)(buffer >> bits);
    }
  }
  return written == QF_BLOCK_BYTES;
}
