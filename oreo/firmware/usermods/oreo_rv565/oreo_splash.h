// SPDX-License-Identifier: MIT
// Native boot splash player (oreo_splash.c), exported through _oreo_rv565.
#ifndef OREO_SPLASH_H
#define OREO_SPLASH_H

#include "py/obj.h"

MP_DECLARE_CONST_FUN_OBJ_3(oreo_splash_load_obj);
MP_DECLARE_CONST_FUN_OBJ_KW(oreo_splash_start_obj);
MP_DECLARE_CONST_FUN_OBJ_VAR_BETWEEN(oreo_splash_progress_obj);
MP_DECLARE_CONST_FUN_OBJ_KW(oreo_splash_stop_obj);
MP_DECLARE_CONST_FUN_OBJ_0(oreo_splash_state_obj);

#endif // OREO_SPLASH_H
