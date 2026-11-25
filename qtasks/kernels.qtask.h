#pragma once

#include <stdint.h>

#include "qtask.h"

#define QF_BLOCK_BYTES 64
#define QF_FIR_SAMPLES (QF_BLOCK_BYTES / 2)
#define QF_FIR_TAPS 16

typedef struct {
  uint8_t bytes[QF_BLOCK_BYTES];
} qf_block_t;

// CRC-32 (IEEE 802.3, reflected), bitwise so both domains run identical work.
Q_TASK(crc32, uint32_t, (const qf_block_t block)) {
  uint32_t crc = 0xFFFFFFFFu;
  for (uint32_t i = 0; i < QF_BLOCK_BYTES; ++i) {
    crc ^= block.bytes[i];
    for (int bit = 0; bit < 8; ++bit) {
      crc = (crc >> 1) ^ (0xEDB88320u & (0u - (crc & 1u)));
    }
  }
  return ~crc;
}

// 16-tap triangular Q15 FIR over 32 little-endian samples, repeated `passes`
// times with a pass-dependent perturbation; returns the sum of all outputs.
Q_TASK(fir, int32_t, (const qf_block_t block, uint32_t passes)) {
  int32_t total = 0;
  for (uint32_t pass = 0; pass < passes; ++pass) {
    for (int32_t n = 0; n < QF_FIR_SAMPLES; ++n) {
      int32_t acc = 0;
      for (int32_t k = 0; k < QF_FIR_TAPS && k <= n; ++k) {
        const int32_t tap = (k < QF_FIR_TAPS / 2 ? k + 1 : QF_FIR_TAPS - k) * 256;
        const int32_t index = 2 * (n - k);
        const int32_t sample = (int16_t)(block.bytes[index] | (block.bytes[index + 1] << 8));
        acc += tap * (sample ^ (int32_t)(pass & 0x7Fu));
      }
      total += acc >> 15;
    }
  }
  return total;
}
