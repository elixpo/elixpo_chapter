/**
 * @file lv_rv565.h
 *
 * lv_rv565: an LVGL 9 widget that plays RV565 clips, modelled on lv_gif.
 *
 * RV565 stores every frame in the display's own pixel format, so playing a
 * frame is an inflate and nothing else, and it is lossless. The widget is an
 * lv_image whose image descriptor points at one decoded frame; a timer at
 * the clip's frame rate decodes the next frame into it in place. For version
 * 7 partial deltas it invalidates only the bands of lines that changed, and
 * for version 8 region deltas only each changed band's rectangle, so LVGL
 * redraws and flushes just those areas.
 *
 * Supported pixel formats:
 *   rgb565le -> LV_COLOR_FORMAT_RGB565
 *   rgb565be -> LV_COLOR_FORMAT_RGB565_SWAPPED (LVGL 9.4+); on older LVGL the
 *               widget swaps the bytes of each decoded row into RGB565
 *   gray8    -> LV_COLOR_FORMAT_L8
 * Other formats fail to load (lv_rv565_get_error() == RV565_ERR_UNSUPPORTED).
 *
 * RAM: the frame (width x height x bytes per pixel), the frame index
 * (4 bytes per frame), and, only for clips whose deltas are zlib-compressed,
 * a scratch buffer of up to one frame. A clip given as a file path is read
 * into RAM whole.
 *
 * MIT licence, part of RV565 (https://github.com/elixpo/rv565).
 */

#ifndef LV_RV565_H
#define LV_RV565_H

#ifdef __cplusplus
extern "C" {
#endif

#if defined(LV_LVGL_H_INCLUDE_SIMPLE)
#include "lvgl.h"
#else
#include "lvgl/lvgl.h"
#endif

#ifndef LV_USE_RV565
#define LV_USE_RV565 1
#endif

#if LV_USE_RV565

#include <stdbool.h>
#include <stdint.h>

#include "rv565.h"   /* rv565_status_t and rv565_strerror() for lv_rv565_get_error() */

/** Play the clip over and over (the default). */
#define LV_RV565_LOOP_FOREVER 0

/**
 * The most frames the widget decodes in one timer call to catch up after
 * LVGL fell behind; beyond that it slows the clip down instead of stalling
 * the UI.
 */
#ifndef LV_RV565_MAX_CATCHUP
#define LV_RV565_MAX_CATCHUP 4
#endif

/**
 * The most rectangles of a region delta (format version 8) the widget
 * invalidates one by one; a frame with more invalidates the whole widget.
 * Each costs 12 bytes of stack while a frame is decoded.
 */
#ifndef LV_RV565_MAX_RECTS
#define LV_RV565_MAX_RECTS 32
#endif

extern const lv_obj_class_t lv_rv565_class;

/**
 * Create an RV565 player.
 * @param parent  the parent object
 * @return        the new object
 */
lv_obj_t * lv_rv565_create(lv_obj_t * parent);

/**
 * Load a clip and start playing it from frame 0.
 * @param obj  an lv_rv565 object
 * @param src  a path for LVGL's file system (e.g. "S:clip.rv565"), read into
 *             RAM whole, or an lv_image_dsc_t whose data and data_size are the
 *             .rv565 file's bytes (they must stay valid while it plays)
 */
void lv_rv565_set_src(lv_obj_t * obj, const void * src);

/** Pause playback; the current frame stays on screen. */
void lv_rv565_pause(lv_obj_t * obj);

/** Resume playback from the current frame. */
void lv_rv565_resume(lv_obj_t * obj);

/** Go back to frame 0 and play, with the loop count reset. */
void lv_rv565_restart(lv_obj_t * obj);

/**
 * Hold the current frame while the object can't be seen (hidden, or scrolled
 * or clipped out of view), and carry on from it when it can, without
 * catching up on the time it was away. Off by default, as in lv_gif.
 */
void lv_rv565_set_auto_pause_invisible(lv_obj_t * obj, bool auto_pause);

/** Whether auto-pause while invisible is on. */
bool lv_rv565_get_auto_pause_invisible(lv_obj_t * obj);

/**
 * Play the clip `count` times, then stop on its last frame and send
 * LV_EVENT_READY. LV_RV565_LOOP_FOREVER (0) loops for ever; LV_EVENT_READY
 * is then sent at the end of every pass.
 */
void lv_rv565_set_loop_count(lv_obj_t * obj, int32_t count);

/** The passes left (0 = for ever). */
int32_t lv_rv565_get_loop_count(lv_obj_t * obj);

/** true once a clip has loaded. */
bool lv_rv565_is_loaded(lv_obj_t * obj);

/** The frame on screen, 0-based. */
uint32_t lv_rv565_get_frame(lv_obj_t * obj);

/** The clip's frame count (0 when nothing is loaded). */
uint32_t lv_rv565_get_frame_count(lv_obj_t * obj);

/** The last error as an rv565_status_t (0 = none); see rv565_strerror(). */
int32_t lv_rv565_get_error(lv_obj_t * obj);

#endif /*LV_USE_RV565*/

#ifdef __cplusplus
} /*extern "C"*/
#endif

#endif /*LV_RV565_H*/
