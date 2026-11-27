/* Play an RV565 clip in LVGL 9, two ways: a clip compiled into flash, and a
 * clip on an SD card through LVGL's file system.
 *
 * Make a clip, for a 320x240 panel at 20 FPS, in LVGL's own RGB565 byte
 * order (rgb565le; rgb565be works too, see lv_rv565.h):
 *
 *   pip install rv565
 *   rv565 encode intro.mp4 intro.rv565 --size 320x240 --fps 20 --format rgb565le
 *   rv565 c-array intro.rv565 intro_rv565.h --name intro_rv565
 */

#include "lv_rv565.h"
#include "intro_rv565.h"   /* from `rv565 c-array`: the .rv565 file's bytes */

static void on_ready(lv_event_t * e)
{
    LV_UNUSED(e);
    LV_LOG_USER("clip finished a pass");
}

void lv_example_rv565_flash(void)
{
    /* The descriptor wraps the file's bytes; they stay in flash. */
    static lv_image_dsc_t src;
    src.header.magic = LV_IMAGE_HEADER_MAGIC;
    src.data = intro_rv565;
    src.data_size = sizeof(intro_rv565);

    lv_obj_t * player = lv_rv565_create(lv_screen_active());
    lv_rv565_set_src(player, &src);
    lv_obj_center(player);
    lv_obj_add_event_cb(player, on_ready, LV_EVENT_READY, NULL);
}

void lv_example_rv565_sd(void)
{
    /* Needs an LVGL file-system driver on letter S (e.g. LV_USE_FS_FATFS).
     * The clip is read into RAM whole. */
    lv_obj_t * player = lv_rv565_create(lv_screen_active());
    lv_rv565_set_src(player, "S:/videos/intro.rv565");
    lv_rv565_set_loop_count(player, 1);            /* play once, stop on the last frame */
    lv_obj_center(player);
    if(!lv_rv565_is_loaded(player)) {
        LV_LOG_WARN("rv565: %s", rv565_strerror((rv565_status_t) lv_rv565_get_error(player)));
    }
}
