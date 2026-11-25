/* Conformance decoder: open one RV565 file and decode every frame three ways,
 * printing a SHA-256 per frame for tests/check_conformance.py to compare
 * with tests/data/v7/manifest.json or tests/data/v8/manifest.json:
 *
 *   seq   in order, in place (prev == dst), with a scratch buffer
 *   pp    in order, ping-ponging two buffers (prev != dst), no scratch
 *   seek  each frame on its own with rv565_seek (from its keyframe)
 *
 * Output lines: "open <status>", then on success "header ...", "types ...",
 * "lines <i> <first>:<count> ..." (rv565_changed_lines per frame),
 * "rects <i> <first>:<count>:<x0>:<xw> ..." (rv565_changed_rects per frame),
 * "<mode> <i> <sha256>" or "<mode>-error <i> <status>", and for a clip with
 * zlib deltas, partial or region deltas "noscratch <status>" from an in-place
 * decode without scratch.
 * Usage: test_conformance file.rv565 */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#include "rv565.h"

/* SHA-256 (FIPS 180-4), enough for hashing test frames. */
typedef struct { uint32_t h[8]; uint8_t buf[64]; uint64_t len; size_t fill; } sha256_t;

static const uint32_t K256[64] = {
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
};

#define ROR(x, n) (((x) >> (n)) | ((x) << (32 - (n))))

static void sha256_block(sha256_t *s, const uint8_t *p)
{
    uint32_t w[64], a, b, c, d, e, f, g, h;
    for (int i = 0; i < 16; ++i)
        w[i] = (uint32_t)p[4 * i] << 24 | (uint32_t)p[4 * i + 1] << 16 | (uint32_t)p[4 * i + 2] << 8 | p[4 * i + 3];
    for (int i = 16; i < 64; ++i) {
        const uint32_t s0 = ROR(w[i - 15], 7) ^ ROR(w[i - 15], 18) ^ (w[i - 15] >> 3);
        const uint32_t s1 = ROR(w[i - 2], 17) ^ ROR(w[i - 2], 19) ^ (w[i - 2] >> 10);
        w[i] = w[i - 16] + s0 + w[i - 7] + s1;
    }
    a = s->h[0]; b = s->h[1]; c = s->h[2]; d = s->h[3];
    e = s->h[4]; f = s->h[5]; g = s->h[6]; h = s->h[7];
    for (int i = 0; i < 64; ++i) {
        const uint32_t t1 = h + (ROR(e, 6) ^ ROR(e, 11) ^ ROR(e, 25)) + ((e & f) ^ (~e & g)) + K256[i] + w[i];
        const uint32_t t2 = (ROR(a, 2) ^ ROR(a, 13) ^ ROR(a, 22)) + ((a & b) ^ (a & c) ^ (b & c));
        h = g; g = f; f = e; e = d + t1; d = c; c = b; b = a; a = t1 + t2;
    }
    s->h[0] += a; s->h[1] += b; s->h[2] += c; s->h[3] += d;
    s->h[4] += e; s->h[5] += f; s->h[6] += g; s->h[7] += h;
}

static void sha256_hex(const uint8_t *data, size_t n, char out[65])
{
    static const uint32_t init[8] = { 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
                                      0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19 };
    sha256_t s;
    memcpy(s.h, init, sizeof(init));
    s.len = (uint64_t)n * 8u;
    while (n >= 64) { sha256_block(&s, data); data += 64; n -= 64; }
    uint8_t tail[128] = { 0 };
    memcpy(tail, data, n);
    tail[n] = 0x80;
    const size_t blocks = n + 9 <= 64 ? 1 : 2;
    for (int i = 0; i < 8; ++i) tail[blocks * 64 - 1 - i] = (uint8_t)(s.len >> (8 * i));
    for (size_t b = 0; b < blocks; ++b) sha256_block(&s, tail + 64 * b);
    for (int i = 0; i < 8; ++i) sprintf(out + 8 * i, "%08x", s.h[i]);
}

static uint8_t *load(const char *path, size_t *size)
{
    FILE *f = fopen(path, "rb");
    if (f == NULL) { perror(path); exit(2); }
    fseek(f, 0, SEEK_END);
    *size = (size_t)ftell(f);
    fseek(f, 0, SEEK_SET);
    uint8_t *data = malloc(*size + 1);
    if (*size && fread(data, 1, *size, f) != *size) { perror("read"); exit(2); }
    fclose(f);
    return data;
}

static void emit(const char *mode, uint16_t i, rv565_status_t st, const uint8_t *frame, size_t fb)
{
    if (st != RV565_OK) {
        printf("%s-error %u %d\n", mode, i, (int)st);
        return;
    }
    char hex[65];
    sha256_hex(frame, fb, hex);
    printf("%s %u %s\n", mode, i, hex);
}

int main(int argc, char **argv)
{
    if (argc != 2) { fprintf(stderr, "usage: %s file.rv565\n", argv[0]); return 2; }
    size_t size;
    uint8_t *data = load(argv[1], &size);
    static uint32_t index[65536];
    rv565_clip_t clip;
    const rv565_status_t st = rv565_open(&clip, data, size, index, 65536, 0, 0);
    printf("open %d\n", (int)st);
    if (st != RV565_OK) { free(data); return 0; }

    const rv565_header_t *h = &clip.header;
    const size_t fb = rv565_frame_bytes(h);
    printf("header %u %u %u %u %u %u %u %u %u %zu\n", h->width, h->height, h->fps, h->frames,
           h->version, h->header_size, h->pixel_format, h->codec, h->keyframe_interval, fb);
    printf("types");
    for (uint16_t i = 0; i < h->frames; ++i) printf(" %d", rv565_frame_type(&clip, i));
    printf("\n");
    static rv565_line_run_t runs[65536];
    for (uint16_t i = 0; i < h->frames; ++i) {
        size_t count = 0, few = 0;
        const rv565_status_t s = rv565_changed_lines(&clip, i, runs, 65536, &count);
        printf("lines %u", i);
        if (s != RV565_OK) printf(" error:%d", (int)s);
        for (size_t r = 0; r < count; ++r) printf(" %u:%u", runs[r].first, runs[r].count);
        printf("\n");
        /* Too small an array: the count is still reported. */
        if (count > 0 && (rv565_changed_lines(&clip, i, runs, 0, &few) != RV565_ERR_ARG || few != count)) {
            printf("lines-error %u -1\n", i);  /* count not reported with a small array */
        }
    }
    static rv565_rect_t rects[65536];
    for (uint16_t i = 0; i < h->frames; ++i) {
        size_t count = 0, few = 0;
        const rv565_status_t s = rv565_changed_rects(&clip, i, rects, 65536, &count);
        printf("rects %u", i);
        if (s != RV565_OK) printf(" error:%d", (int)s);
        for (size_t r = 0; r < count; ++r) {
            printf(" %u:%u:%lu:%lu", rects[r].first, rects[r].count,
                   (unsigned long)rects[r].x0, (unsigned long)rects[r].xw);
            /* Every rect is whole pixels: its columns cover exactly its bytes. */
            uint16_t c0, nc;
            if (rv565_byte_columns(h->pixel_format, h->width, rects[r].x0, rects[r].xw, &c0, &nc) != RV565_OK ||
                    nc == 0 || (uint32_t)c0 + nc > h->width) {
                printf(" columns-error");
            }
        }
        printf("\n");
        if (count > 1 && (rv565_changed_rects(&clip, i, rects, count - 1, &few) != RV565_ERR_ARG || few != count)) {
            printf("rects-error %u -1\n", i);  /* count not reported with a small array */
        }
    }

    /* Odd offsets make the XOR take its bytewise path for one of the runs. */
    uint8_t *a = malloc(fb + 1), *b = malloc(fb + 1), *scratch = malloc(fb);
    for (uint16_t i = 0; i < h->frames; ++i) {
        const rv565_status_t s = rv565_decode(&clip, i, a, a, fb, scratch, fb);
        emit("seq", i, s, a, fb);
        if (s != RV565_OK) break;
    }
    uint8_t *buf[2] = { a, b + 1 };
    for (uint16_t i = 0; i < h->frames; ++i) {
        const rv565_status_t s = rv565_decode(&clip, i, buf[(i + 1) & 1], buf[i & 1], fb, NULL, 0);
        emit("pp", i, s, buf[i & 1], fb);
        if (s != RV565_OK) break;
    }
    /* In place without scratch: fine for everything but a zlib delta. */
    for (uint16_t i = 0; i < h->frames; ++i) {
        const int type = rv565_frame_type(&clip, i);
        if ((type == RV565_FRAME_DELTA || type == RV565_FRAME_PARTIAL || type == RV565_FRAME_REGION) &&
                h->codec == RV565_CODEC_ZLIB) {
            printf("noscratch %d\n", (int)rv565_decode_frame(&clip, i, a, fb));
            break;
        }
    }
    for (uint16_t i = h->frames; i-- > 0;) {
        memset(a, 0xA5, fb);  /* stale contents must not leak into the result */
        emit("seek", i, rv565_seek(&clip, i, a, fb, scratch, fb), a, fb);
    }
    free(a); free(b); free(scratch); free(data);
    return 0;
}
