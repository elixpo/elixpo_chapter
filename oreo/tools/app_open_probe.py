"""On-badge timing of opening each app. Runs ON the badge:

    falera run tools/app_open_probe.py

For every installed app (or the ones in ONLY) it does what the launcher
does when you press A, one step at a time, and prints:

  import     ms to import apps.<name>.main the first time this run,
             with the FaleraOS modules it pulled in that were not loaded
             yet (those stay loaded afterwards, as on the badge)
  again      ms for a second import with those modules already loaded:
             the app's own cost on every later open
  compile    ms of `again` spent reading and compiling the app's own .py
             source (what shipping precompiled .mpy would save)
  enter      ms in on_enter()
  frame      ms for the first update() + draw()
  flush      ms for the first display.present()
  heap       KB the open keeps (after a collect) and KB it allocated

then the time of a full gc.collect(), which the launcher runs between
two apps. Each app is closed with on_exit() and unloaded again; nothing
is written to flash by this script (an app's own on_enter may still save
its state, as it does on every open). FaleraOS starts again when the CLI
finishes. Paste the whole output into the pull request.
"""

import gc
import sys
import time

ONLY = None              # e.g. ("store", "gallery") to probe just those
# Transfer opens the USB link this script talks over; the drawer stays
# loaded all the time on the badge.
SKIP = ("transfer",)


def ms(t0):
    return time.ticks_diff(time.ticks_ms(), t0)


def heap():
    gc.collect()
    return gc.mem_free()


def sources(root, app_dir):
    """The app's .py files (main.py and src/), not its assets: those are
    imported later, if at all."""
    out = []

    def walk(d):
        try:
            names = __import__("os").listdir(d)
        except OSError:
            return
        for n in names:
            p = d + "/" + n
            if n.endswith(".py"):
                out.append(p)
            elif "." not in n:
                walk(p)
    out.append("%s/%s/main.py" % (root, app_dir))
    walk("%s/%s/src" % (root, app_dir))
    return out


def compile_ms(paths):
    try:
        compile
    except NameError:
        return -1
    t0 = time.ticks_ms()
    for p in paths:
        try:
            with open(p) as f:
                src = f.read()
            compile(src, p, "exec")
            src = None
        except OSError:
            pass
        except Exception as e:
            print("  compile %s: %s" % (p, e))
    return ms(t0)


def probe(L, os_obj, app_dir):
    root = L.app_root(app_dir)
    L.unload_app(app_dir)
    free0 = heap()
    before = set(sys.modules)
    alloc0 = gc.mem_alloc()

    t0 = time.ticks_ms()
    app = L.load_app(app_dir)
    t_import = ms(t0)
    pulled = sorted(m for m in sys.modules
                    if m not in before and not m.startswith("apps."))
    alloc_import = gc.mem_alloc() - alloc0

    # The app's own cost on a later open: import again, OS modules loaded.
    app = None
    L.unload_app(app_dir)
    gc.collect()
    t0 = time.ticks_ms()
    app = L.load_app(app_dir)
    t_again = ms(t0)
    t_compile = compile_ms(sources(root, app_dir))
    gc.collect()

    t_enter = t_frame = t_flush = -1
    err = None
    try:
        t0 = time.ticks_ms()
        app.on_enter(os_obj)
        t_enter = ms(t0)
        t0 = time.ticks_ms()
        app.update(0.033)
        app.draw(os_obj.display)
        t_frame = ms(t0)
        t0 = time.ticks_ms()
        os_obj.display.present()
        t_flush = ms(t0)
    except Exception as e:
        err = e
    finally:
        try:
            app.on_exit()
        except Exception as e:
            err = err or e
    kept = free0 - heap()
    app = None
    if app_dir not in L.RESIDENT_APPS:
        L.unload_app(app_dir)
    return {
        "import": t_import, "again": t_again, "compile": t_compile,
        "enter": t_enter, "frame": t_frame, "flush": t_flush,
        "kept_kb": kept // 1024, "alloc_kb": alloc_import // 1024,
        "pulled": pulled, "error": err,
    }


def main():
    from oreoOS import launcher as L
    from oreoWare.os import OS
    os_obj = OS()
    try:
        from oreoOS import busy
        busy.bind(os_obj.display)
    except Exception:
        pass
    apps = [a["dir"] for a in L.list_apps()]
    if "launcher" not in apps:
        apps.insert(0, "launcher")
    if ONLY:
        apps = [a for a in apps if a in ONLY]
    apps = [a for a in apps if a not in SKIP]

    print("app open probe: %d apps, heap free %d KB" % (
        len(apps), heap() // 1024))
    print("%-10s %7s %6s %7s %6s %6s %6s %8s %9s" % (
        "app", "import", "again", "compile", "enter", "frame", "flush",
        "kept KB", "alloc KB"))
    total = 0
    for app_dir in apps:
        try:
            r = probe(L, os_obj, app_dir)
        except Exception as e:
            print("%-10s import failed: %r" % (app_dir[:10], e))
            L.unload_app(app_dir)
            continue
        print("%-10s %7d %6d %7d %6d %6d %6d %8d %9d" % (
            app_dir[:10], r["import"], r["again"], r["compile"],
            r["enter"], r["frame"], r["flush"], r["kept_kb"],
            r["alloc_kb"]))
        if r["pulled"]:
            print("           +", " ".join(r["pulled"]))
        if r["error"] is not None:
            print("           error:", repr(r["error"]))
        total += r["again"] + max(0, r["enter"]) + max(0, r["frame"])
        time.sleep_ms(50)

    t0 = time.ticks_ms()
    gc.collect()
    print("gc.collect: %d ms, heap free %d KB" % (ms(t0),
                                                 gc.mem_free() // 1024))
    print("sum of later opens (again + enter + frame): %d ms" % total)
    try:
        from oreoOS import opening
        t0 = time.ticks_ms()
        rect = opening.ack(os_obj.display, "Probe")
        if rect:
            os_obj.display.present_rect(*rect)
        print("open chip: %d ms" % ms(t0))
    except ImportError:
        print("open chip: this FaleraOS has no oreoOS.opening")


main()
