#include <Arduino_RouterBridge.h>
#include <zephyr/kernel.h>

#include <cstdint>

#include "qtasks/add.qtask.h"
#include "qtasks/kernels.qtask.h"
#include "runtime/stage12/qf_stage12_codec.h"

// Stage 12 RT executor. A request is "TASK PASSES BASE64_PAYLOAD"; the response
// is "RESULT LOCAL_EXECUTION_NS", or "error REASON". One RPC per invocation
// keeps diagnostics off the measured path.

qf_block_t qf_block{};

String qf_stage12_invoke(String request) {
  const int first = request.indexOf(' ');
  const int second = first < 0 ? -1 : request.indexOf(' ', first + 1);
  if (first < 0 || second < 0) return String("error invalid-request");
  const String task = request.substring(0, first);
  const long passes = request.substring(first + 1, second).toInt();
  if (passes < 1 || !qf_decode_block(request.c_str() + second + 1, request.length() - second - 1, &qf_block)) {
    return String("error invalid-request");
  }

  std::int64_t result = 0;
  const std::uint32_t started = k_cycle_get_32();
  if (task == "add") {
    result = qf_task_add(2, 3);
  } else if (task == "crc32") {
    result = qf_task_crc32(qf_block);
  } else if (task == "fir") {
    result = qf_task_fir(qf_block, static_cast<std::uint32_t>(passes));
  } else {
    return String("error unknown-task");
  }
  const std::uint32_t elapsed = k_cycle_get_32() - started;
  const std::uint64_t local_ns = k_cyc_to_ns_floor64(elapsed);
  // Results are reported modulo 2^32; the Linux profiler compares likewise.
  return String(static_cast<unsigned long>(static_cast<std::uint32_t>(result))) + " " +
         String(static_cast<unsigned long>(local_ns));
}

void setup() {
  if (!Bridge.begin()) {
    while (true) delay(1000);
  }
  Bridge.provide("qf_stage12_invoke", qf_stage12_invoke);
}

void loop() {
  delay(1);
}
