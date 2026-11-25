/**
 * @file lv_rv565.c
 *
 * lv_rv565: an LVGL 9 widget that plays RV565 clips. See lv_rv565.h.
 *
 * MIT licence, part of RV565 (https://github.com/elixpo/rv565).
 */

#include "lv_rv565.h"

#if LV_USE_RV565

#if defined(LV_LVGL_H_INCLUDE_SIMPLE)
#include "src/core/lv_obj_class_private.h"
#include "src/widgets/image/lv_image_private.h"
#include "src/misc/cache/lv_cache.h"
#else
#include "lvgl/src/core/lv_obj_class_private.h"
#include "lvgl/src/widgets/image/lv_image_private.h"
#include "lvgl/src/misc/cache/lv_cache.h"
#endif

#include "rv565.h"

#include <string.h>

/*********************
 *      DEFINES
 *********************/
#define MY_CLASS (&lv_rv565_class)

/* LV_COLOR_FORMAT_RGB565_SWAPPED arrived in LVGL 9.4. */
#if LVGL_VERSION_MAJOR > 9 || (LVGL_VERSION_MAJOR == 9 && LVGL_VERSION_MINOR >= 4)
#define LV_RV565_HAVE_SWAPPED 1
#else
#define LV_RV565_HAVE_SWAPPED 0
#endif

/* Changed-line runs looked at per frame before falling back to redrawing
 * the whole widget. */
#define MAX_RUNS 8

/**********************
 *      TYPEDEFS
 **********************/
typedef struct {
    lv_image_t img;
    lv_image_dsc_t imgdsc;
    lv_timer_t * timer;
    rv565_clip_t clip;
    uint32_t * index;     /* clip.header.frames entries */
    uint8_t * frame;      /* the decoded frame; also the image data */
    size_t frame_len;
    size_t row_bytes;
    uint8_t * scratch;    /* only for zlib deltas, decoded in place */
    size_t scratch_len;
    uint8_t * file_data;  /* owned copy when loaded from a path */
    uint32_t cur;         /* frame on screen */
    uint32_t base;        /* frame shown at tick t0 */
    uint32_t t0;
    int32_t loop_count;   /* passes left; 0 = for ever */
    int32_t error;
    uint32_t loaded : 1;
    uint32_t swap : 1;    /* rgb565be clip on LVGL without RGB565_SWAPPED */
    uint32_t auto_pause : 1;  /* hold the frame while the object can't be seen */
    uint32_t hidden : 1;      /* auto-paused: not visible at the last tick */
} lv_rv565_t;

/**********************
 *  STATIC PROTOTYPES
 **********************/
static void lv_rv565_constructor(const lv_obj_class_t * class_p, lv_obj_t * obj);
static void lv_rv565_destructor(const lv_obj_class_t * class_p, lv_obj_t * obj);
static void unload(lv_rv565_t * p);
static bool load(lv_rv565_t * p, const void * src);
static void next_frame_cb(lv_timer_t * t);
static bool decode_frame(lv_rv565_t * p, uint32_t i, bool invalidate);

/**********************
 *  STATIC VARIABLES
 **********************/
const lv_obj_class_t lv_rv565_class = {
    .constructor_cb = lv_rv565_constructor,
    .destructor_cb = lv_rv565_destructor,
    .instance_size = sizeof(lv_rv565_t),
    .base_class = &lv_image_class,
    .name = "lv_rv565",
};

/**********************
 *   GLOBAL FUNCTIONS
 **********************/
lv_obj_t * lv_rv565_create(lv_obj_t * parent)
{
    LV_LOG_INFO("begin");
    lv_obj_t * obj = lv_obj_class_create_obj(MY_CLASS, parent);
    lv_obj_class_init_obj(obj);
    return obj;
}

void lv_rv565_set_src(lv_obj_t * obj, const void * src)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    unload(p);
    if(src == NULL) return;
    if(!load(p, src)) {
        LV_LOG_WARN("lv_rv565: couldn't load the clip: %s", rv565_strerror((rv565_status_t) p->error));
        unload(p);
        return;
    }
    lv_image_set_src(obj, &p->imgdsc);
    lv_timer_set_period(p->timer, LV_MAX(1, 1000 / p->clip.header.fps));
    p->t0 = lv_tick_get();
    lv_timer_resume(p->timer);
    lv_timer_reset(p->timer);
}

void lv_rv565_pause(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_timer_pause(((lv_rv565_t *) obj)->timer);
}

void lv_rv565_resume(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    if(!p->loaded) return;
    p->base = p->cur;
    p->t0 = lv_tick_get();
    lv_timer_resume(p->timer);
    lv_timer_reset(p->timer);
}

void lv_rv565_restart(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    if(!p->loaded) return;
    if(!decode_frame(p, 0, true)) return;
    p->cur = 0;
    lv_rv565_resume(obj);
}

void lv_rv565_set_auto_pause_invisible(lv_obj_t * obj, bool auto_pause)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    p->auto_pause = auto_pause;
    if(!auto_pause && p->hidden) {
        /* Carry on from the held frame, not from where the clock got to. */
        p->hidden = 0;
        p->base = p->cur;
        p->t0 = lv_tick_get();
    }
}

bool lv_rv565_get_auto_pause_invisible(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    return ((lv_rv565_t *) obj)->auto_pause;
}

void lv_rv565_set_loop_count(lv_obj_t * obj, int32_t count)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    ((lv_rv565_t *) obj)->loop_count = count < 0 ? 0 : count;
}

int32_t lv_rv565_get_loop_count(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    return ((lv_rv565_t *) obj)->loop_count;
}

bool lv_rv565_is_loaded(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    return ((lv_rv565_t *) obj)->loaded;
}

uint32_t lv_rv565_get_frame(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    return ((lv_rv565_t *) obj)->cur;
}

uint32_t lv_rv565_get_frame_count(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    return p->loaded ? p->clip.header.frames : 0;
}

int32_t lv_rv565_get_error(lv_obj_t * obj)
{
    LV_ASSERT_OBJ(obj, MY_CLASS);
    return ((lv_rv565_t *) obj)->error;
}

/**********************
 *   STATIC FUNCTIONS
 **********************/
static void lv_rv565_constructor(const lv_obj_class_t * class_p, lv_obj_t * obj)
{
    LV_UNUSED(class_p);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    p->loop_count = LV_RV565_LOOP_FOREVER;
    p->timer = lv_timer_create(next_frame_cb, 40, obj);
    lv_timer_pause(p->timer);
}

static void lv_rv565_destructor(const lv_obj_class_t * class_p, lv_obj_t * obj)
{
    LV_UNUSED(class_p);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    unload(p);
    lv_timer_delete(p->timer);
}

static void unload(lv_rv565_t * p)
{
    if(p->loaded) lv_image_cache_drop(&p->imgdsc);
    lv_timer_pause(p->timer);
    lv_free(p->index);
    lv_free(p->frame);
    lv_free(p->scratch);
    lv_free(p->file_data);
    p->index = NULL;
    p->frame = NULL;
    p->scratch = NULL;
    p->file_data = NULL;
    p->scratch_len = 0;
    p->frame_len = 0;
    p->loaded = 0;
    p->swap = 0;
    p->cur = 0;
    p->base = 0;
    lv_memzero(&p->clip, sizeof(p->clip));
    lv_memzero(&p->imgdsc, sizeof(p->imgdsc));
}

/* Read a whole file through lv_fs into lv_malloc'd memory. */
static uint8_t * read_file(const char * path, size_t * size)
{
    lv_fs_file_t f;
    if(lv_fs_open(&f, path, LV_FS_MODE_RD) != LV_FS_RES_OK) return NULL;
    uint32_t len = 0;
    uint8_t * buf = NULL;
    if(lv_fs_seek(&f, 0, LV_FS_SEEK_END) == LV_FS_RES_OK && lv_fs_tell(&f, &len) == LV_FS_RES_OK &&
       len > 0 && lv_fs_seek(&f, 0, LV_FS_SEEK_SET) == LV_FS_RES_OK) {
        buf = lv_malloc(len);
        uint32_t got = 0;
        if(buf != NULL && (lv_fs_read(&f, buf, len, &got) != LV_FS_RES_OK || got != len)) {
            lv_free(buf);
            buf = NULL;
        }
    }
    lv_fs_close(&f);
    *size = len;
    return buf;
}

/* Swap the two bytes of every pixel in bytes lo .. hi - 1 (both even) of
 * rows first .. first + count - 1. */
static void swap_span(lv_rv565_t * p, uint32_t first, uint32_t count, size_t lo, size_t hi)
{
    for(uint32_t y = first; y < first + count; y++) {
        uint8_t * b = p->frame + (size_t) y * p->row_bytes;
        for(size_t j = lo; j < hi; j += 2) {
            uint8_t t = b[j];
            b[j] = b[j + 1];
            b[j + 1] = t;
        }
    }
}

/* Swap the two bytes of every pixel in rows first .. first + count - 1. */
static void swap_rows(lv_rv565_t * p, uint32_t first, uint32_t count)
{
    swap_span(p, first, count, 0, p->row_bytes);
}

/* For a region delta whose rects (one per changed band, in band order) are
 * known: the bytes of each band's lines the delta reads or writes, as
 * lo[k] .. hi[k] - 1, even. A band writes its range x0 .. x0 + xw - 1 and
 * reads, from the previous frame, bytes j - dx of lines in the same band
 * (FORMAT.md, "Region delta"), i.e. max(0, x0 - dx) .. min(R, x0 + xw - dx) - 1;
 * the span is the hull of both. Returns false if the body doesn't match the
 * rects (not reached for a clip rv565_open accepted). */
static bool region_spans(lv_rv565_t * p, uint32_t i, const rv565_rect_t * rects, size_t n,
                         uint16_t * lo, uint16_t * hi)
{
    const uint8_t * body;
    uint32_t len;
    if(rv565_payload(&p->clip, (uint16_t) i, &body, &len) != RV565_OK || len < 1 || body[0] == 0) return false;
    uint32_t lines = p->clip.header.height;
    uint32_t bands = (lines + body[0] - 1) / body[0];
    size_t entries = 1 + (bands + 7) / 8;
    if(len < entries + 6 * n) return false;
    long r = (long) p->row_bytes;
    for(size_t k = 0; k < n; k++) {
        const uint8_t * e = body + entries + 6 * k;
        long dx = (int8_t) e[0];
        long x0 = e[2] | (e[3] << 8), xw = e[4] | (e[5] << 8);
        if(x0 != (long) rects[k].x0 || xw != (long) rects[k].xw) return false;
        long a = LV_MIN(x0, x0 - dx), b = LV_MAX(x0 + xw, x0 + xw - dx);
        a = LV_MAX(a, 0);
        b = LV_MIN(b, r);
        lo[k] = (uint16_t)(a & ~1L);
        hi[k] = (uint16_t)((b + 1) & ~1L);
    }
    return true;
}

static bool load(lv_rv565_t * p, const void * src)
{
    const uint8_t * data = NULL;
    size_t size = 0;
    p->error = RV565_OK;

    lv_image_src_t type = lv_image_src_get_type(src);
    if(type == LV_IMAGE_SRC_VARIABLE) {
        const lv_image_dsc_t * dsc = src;
        data = dsc->data;
        size = dsc->data_size;
    }
    else if(type == LV_IMAGE_SRC_FILE) {
        p->file_data = read_file(src, &size);
        data = p->file_data;
    }
    if(data == NULL || size == 0) {
        p->error = RV565_ERR_ARG;
        return false;
    }

    rv565_header_t h;
    rv565_status_t st = rv565_parse_header(data, size, 0, 0, &h);
    if(st != RV565_OK) {
        p->error = st;
        return false;
    }

    lv_color_format_t cf;
    switch(h.pixel_format) {
        case RV565_PIXEL_RGB565LE:
            cf = LV_COLOR_FORMAT_RGB565;
            break;
        case RV565_PIXEL_RGB565BE:
#if LV_RV565_HAVE_SWAPPED
            cf = LV_COLOR_FORMAT_RGB565_SWAPPED;
#else
            cf = LV_COLOR_FORMAT_RGB565;
            p->swap = 1;
#endif
            break;
        case RV565_PIXEL_GRAY8:
            cf = LV_COLOR_FORMAT_L8;
            break;
        default:
            p->error = RV565_ERR_UNSUPPORTED;
            return false;
    }

    p->index = lv_malloc(sizeof(uint32_t) * h.frames);
    if(p->index == NULL) {
        p->error = RV565_ERR_ARG;
        return false;
    }
    st = rv565_open(&p->clip, data, size, p->index, h.frames, 0, 0);
    if(st != RV565_OK) {
        p->error = st;
        return false;
    }

    p->frame_len = rv565_frame_bytes(&p->clip.header);
    p->row_bytes = rv565_row_bytes(h.pixel_format, h.width);
    p->frame = lv_malloc_zeroed(p->frame_len);
    if(p->frame == NULL) {
        p->error = RV565_ERR_ARG;
        return false;
    }

    /* Deltas decoded in place need scratch only when they are zlib. */
    if(h.codec == RV565_CODEC_ZLIB) {
        for(uint32_t i = 0; i < h.frames; i++) {
            int t = rv565_frame_type(&p->clip, (uint16_t) i);
            if(t == RV565_FRAME_DELTA || t == RV565_FRAME_PARTIAL || t == RV565_FRAME_REGION) {
                p->scratch_len = p->frame_len;
                p->scratch = lv_malloc(p->scratch_len);
                if(p->scratch == NULL) {
                    p->error = RV565_ERR_ARG;
                    return false;
                }
                break;
            }
        }
    }

    p->imgdsc.header.magic = LV_IMAGE_HEADER_MAGIC;
    p->imgdsc.header.flags = LV_IMAGE_FLAGS_MODIFIABLE;
    p->imgdsc.header.cf = cf;
    p->imgdsc.header.w = h.width;
    p->imgdsc.header.h = h.height;
    p->imgdsc.header.stride = (uint32_t) p->row_bytes;
    p->imgdsc.data_size = (uint32_t) p->frame_len;
    p->imgdsc.data = p->frame;

    p->loaded = 1;
    if(!decode_frame(p, 0, false)) {
        p->loaded = 0;
        return false;
    }
    p->cur = 0;
    p->base = 0;
    return true;
}

/* True when the image sits 1:1 at the top-left of the content area, so frame
 * rows map straight to screen rows. */
static bool rows_map_1to1(lv_rv565_t * p, lv_area_t * content)
{
    lv_obj_t * obj = (lv_obj_t *) p;
    if(lv_image_get_scale(obj) != LV_SCALE_NONE || lv_image_get_rotation(obj) != 0) return false;
    if(lv_image_get_offset_x(obj) != 0 || lv_image_get_offset_y(obj) != 0) return false;
    lv_obj_get_content_coords(obj, content);
    return lv_area_get_width(content) == p->clip.header.width &&
           lv_area_get_height(content) == p->clip.header.height;
}

/* Decode frame i in place over frame i-1 (or on its own for a keyframe) and,
 * if asked, invalidate what changed. */
static bool decode_frame(lv_rv565_t * p, uint32_t i, bool invalidate)
{
    lv_obj_t * obj = (lv_obj_t *) p;
    int type = rv565_frame_type(&p->clip, (uint16_t) i);
    if(type < 0) {
        p->error = type;
        return false;
    }

    rv565_line_run_t runs[MAX_RUNS];
    size_t nruns = 0;
    bool all_rows = true;
    if((type == RV565_FRAME_PARTIAL || type == RV565_FRAME_REGION) &&
       rv565_changed_lines(&p->clip, (uint16_t) i, runs, MAX_RUNS, &nruns) == RV565_OK) {
        all_rows = false;
    }

    /* Region delta: one rectangle per changed band. */
    rv565_rect_t rects[LV_RV565_MAX_RECTS];
    size_t nrects = 0;
    bool have_rects = type == RV565_FRAME_REGION &&
                      rv565_changed_rects(&p->clip, (uint16_t) i, rects, LV_RV565_MAX_RECTS, &nrects) == RV565_OK;

    /* rgb565be on older LVGL: the frame is held swapped for drawing; a delta
     * applies to the clip's own byte order, so swap back the bytes it reads
     * or writes before decoding, and swap them again afterwards. For a region
     * delta that is each band's span (region_spans), else the changed rows
     * (a band's prediction never leaves its band), else the whole frame. */
    bool delta = type == RV565_FRAME_DELTA || type == RV565_FRAME_PARTIAL || type == RV565_FRAME_REGION;
    uint16_t lo[LV_RV565_MAX_RECTS], hi[LV_RV565_MAX_RECTS];
    bool spans = p->swap && have_rects && region_spans(p, i, rects, nrects, lo, hi);
    for(int pass = 0; pass < 2; pass++) {
        if(pass == 1) {
            rv565_status_t st = rv565_decode(&p->clip, (uint16_t) i, p->frame, p->frame, p->frame_len,
                                             p->scratch, p->scratch_len);
            if(st != RV565_OK) {
                p->error = st;
                return false;
            }
        }
        if(!p->swap || type == RV565_FRAME_REPEAT || (pass == 0 && !delta)) continue;
        if(spans)
            for(size_t k = 0; k < nrects; k++) swap_span(p, rects[k].first, rects[k].count, lo[k], hi[k]);
        else if(!all_rows)
            for(size_t r = 0; r < nruns; r++) swap_rows(p, runs[r].first, runs[r].count);
        else
            swap_rows(p, 0, p->clip.header.height);   /* keyframe, delta, or too many runs */
    }

    if(!invalidate || type == RV565_FRAME_REPEAT) return true;
    lv_image_cache_drop(&p->imgdsc);
    lv_area_t content;
    if((have_rects || !all_rows) && rows_map_1to1(p, &content)) {
        if(have_rects) {
            for(size_t k = 0; k < nrects; k++) {
                uint16_t c0, nc;
                if(rv565_byte_columns(p->clip.header.pixel_format, p->clip.header.width,
                                      rects[k].x0, rects[k].xw, &c0, &nc) != RV565_OK) {
                    lv_obj_invalidate(obj);   /* not reached: rv565_open checked the ranges */
                    return true;
                }
                lv_area_t a;
                a.x1 = content.x1 + c0;
                a.x2 = a.x1 + nc - 1;
                a.y1 = content.y1 + rects[k].first;
                a.y2 = a.y1 + rects[k].count - 1;
                lv_obj_invalidate_area(obj, &a);
            }
        }
        else {
            for(size_t r = 0; r < nruns; r++) {
                lv_area_t a = content;
                a.y1 = content.y1 + runs[r].first;
                a.y2 = a.y1 + runs[r].count - 1;
                lv_obj_invalidate_area(obj, &a);
            }
        }
    }
    else {
        lv_obj_invalidate(obj);
    }
    return true;
}

static void next_frame_cb(lv_timer_t * t)
{
    lv_obj_t * obj = lv_timer_get_user_data(t);
    lv_rv565_t * p = (lv_rv565_t *) obj;
    if(!p->loaded) return;

    /* Auto-pause: decode nothing while the object can't be seen (hidden, or
     * scrolled or clipped out of view); once it can, carry on from the held
     * frame rather than catching up on the time it was away. The timer keeps
     * running, so this needs nothing from the application. */
    if(p->auto_pause) {
        if(!lv_obj_is_visible(obj)) {
            p->hidden = 1;
            return;
        }
        if(p->hidden) {
            p->hidden = 0;
            p->base = p->cur;
            p->t0 = lv_tick_get();
            return;
        }
    }

    uint32_t frames = p->clip.header.frames;
    uint32_t fps = p->clip.header.fps;
    uint32_t due = p->base + (uint32_t)(((uint64_t) lv_tick_elaps(p->t0) * fps) / 1000);
    uint32_t steps = due > p->cur ? due - p->cur : 0;
    if(steps == 0) return;
    if(steps > LV_RV565_MAX_CATCHUP) {
        /* Too far behind: slow the clip down rather than stall the UI. */
        steps = LV_RV565_MAX_CATCHUP;
        p->base = p->cur + steps;
        p->t0 = lv_tick_get();
    }

    while(steps--) {
        uint32_t next = p->cur + 1;
        if(next >= frames) {
            lv_result_t res = lv_obj_send_event(obj, LV_EVENT_READY, NULL);
            if(res != LV_RESULT_OK) return;          /* the object was deleted */
            if(p->loop_count > 0 && --p->loop_count == 0) {
                lv_timer_pause(t);                    /* stay on the last frame */
                return;
            }
            next = 0;
            p->base = 0;
            p->t0 = lv_tick_get();
            steps = 0;                                /* start the new pass on time */
        }
        if(!decode_frame(p, next, true)) {
            LV_LOG_WARN("lv_rv565: frame %u: %s", (unsigned) next,
                        rv565_strerror((rv565_status_t) p->error));
            lv_timer_pause(t);
            return;
        }
        p->cur = next;
    }
}

#endif /*LV_USE_RV565*/
