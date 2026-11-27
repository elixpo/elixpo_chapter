#!/usr/bin/env python3
"""Write the order files for the routed board.

    python3 circuit/elixpo/export_jlcpcb.py

build/jlcpcb/:
- oreo-badge-gerbers.zip: the copper layers, paste, silkscreen, mask,
  outline and the plated and unplated drill files (no drill maps).
- oreo-badge-BOM.csv and oreo-badge-CPL.csv: JLCPCB assembly of the parts
  in its *basic* library only (no extended-part fees), with LCSC numbers.
- oreo-badge-BOM-plus.csv and oreo-badge-CPL-plus.csv: the same plus the
  hard-to-hand-solder extended parts on the back (JLC_PLUS).

circuit/elixpo/BOM_ORDER.csv: everything a badge needs, in four groups:
  A  JLCPCB assembles (basic parts)
  B  buy and solder by hand, SMD
  C  buy and solder by hand, through-hole
  D  off-board parts and mechanical
with an LCSC number wherever LCSC lists the part (handy even when buying
elsewhere) and LCSC's single-unit price on PRICE_DATE.

Every part value on the board must have a row in PARTS; the script stops
if one is missing, so a schematic change cannot slip past the order.
"""

import csv
import subprocess
import zipfile
from collections import OrderedDict
from pathlib import Path

HERE = Path(__file__).resolve().parent
BOARD = HERE / "elixpo.kicad_pcb"
OUT = HERE / "build" / "jlcpcb"
GERBERS = OUT / "gerbers"
ORDER = HERE / "BOM_ORDER.csv"
INNER = ("In1.Cu,In2.Cu,In3.Cu,In4.Cu" if '"In4.Cu"' in BOARD.read_text()
         else "In1.Cu,In2.Cu")                      # 6 or 4 copper layers
LAYERS = ("F.Cu," + INNER + ",B.Cu,F.Paste,B.Paste,"
          "F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts")
PRICE_DATE = "2026-11-17"
# Extended parts on the back that are hard to solder by hand (pads under the
# chip, 0.5 mm pitch, tiny 0402s next to them). oreo-badge-BOM-plus.csv and
# oreo-badge-CPL-plus.csv add them to the basic parts, for when JLCPCB
# assembles them too (about $3 feeder fee per unique extended part).
JLC_PLUS = {"BQ24074RGT", "TPS63031DSK", "AW9523B", "MAX98357A", "TPS61023 5V boost",
            "1.5uH 2A shielded", "USB-C USB2 device", "150k 1%", "2.2nF 50V"}

A, B, C, D = ("A JLCPCB assembles (basic)", "B Buy, hand-solder SMD",
              "C Buy, hand-solder through-hole", "D Off-board / mechanical")
JLC = A

# value on the board: (group, part, LCSC number, LCSC unit price USD, note)
PARTS = {
    "22uF 10V": (A, "Samsung CL21A226MAQNNNE, 22 uF 25 V X5R 0805", "C45783", 0.1084,
                 "LCSC's store ran out in Nov 2026: Samsung CL21A226MAYNNNE (C602037) was bought"),
    "100nF": (A, "Samsung CL05B104KO5NNNC, 100 nF 16 V X7R 0402", "C1525", 0.0024, ""),
    "1uF": (A, "Samsung CL05A105KA5NQNC, 1 uF 25 V X5R 0402", "C52923", 0.0057, ""),
    "10uF 10V": (A, "Samsung CL21A106KAYNNNE, 10 uF 25 V X5R 0805", "C15850", 0.0311, ""),
    "1nF 50V": (A, "FH 0402B102K500NT, 1 nF 50 V X7R 0402", "C1523", 0.0036, ""),
    "1uF 25V": (A, "Samsung CL10A105KB8NNNC, 1 uF 50 V X5R 0603", "C15849", 0.0083,
                "USB input: needs 25 V or more. LCSC's store ran out: Taiyo Yuden UMK107BJ105KA-T (C92848) was bought"),
    "4.7uF 10V": (A, "Samsung CL10A475KO8NNNC, 4.7 uF 16 V X5R 0603", "C19666", 0.015, ""),
    "4.7uF": (A, "Samsung CL10A475KO8NNNC, 4.7 uF 16 V X5R 0603", "C19666", 0.015, ""),
    "10k": (A, "UNI-ROYAL 0402WGF1002TCE, 10 k 1% 0402", "C25744", 0.001,
            "LCSC's store ran out: YAGEO RC0402JR-0710KL (C60489) was bought"),
    "10k 1%": (A, "UNI-ROYAL 0402WGF1002TCE, 10 k 1% 0402", "C25744", 0.001,
               "LCSC's store ran out: YAGEO RC0402JR-0710KL (C60489) was bought"),
    "22R": (A, "UNI-ROYAL 0402WGF220JTCE, 22 R 0402", "C25092", 0.001,
            "LCSC's store ran out: YAGEO RC0402FR-0722RL (C114765) was bought"),
    "33R": (A, "UNI-ROYAL 0402WGF330JTCE, 33 R 0402", "C25105", 0.0011, ""),
    "5.1k": (A, "UNI-ROYAL 0402WGF5101TCE, 5.1 k 1% 0402", "C25905", 0.0014, ""),
    "2.0k 1% (445 mA)": (A, "UNI-ROYAL 0402WGF2001TCE, 2 k 1% 0402", "C4109", 0.0019, "Sets the charge current"),
    "2.0k 1% (800 mA)": (A, "UNI-ROYAL 0402WGF2001TCE, 2 k 1% 0402", "C4109", 0.0019, "Sets the USB input limit"),
    "100k": (A, "UNI-ROYAL 0402WGF1003TCE, 100 k 1% 0402", "C25741", 0.0009, ""),
    "100k 1%": (A, "UNI-ROYAL 0402WGF1003TCE, 100 k 1% 0402", "C25741", 0.0009, ""),
    "1M": (A, "UNI-ROYAL 0402WGF1004TCE, 1 M 1% 0402", "C26083", 0.0012, ""),
    "20k 1%": (A, "UNI-ROYAL 0402WGF2002TCE, 20 k 1% 0402", "C25765", 0.001, "Sets the 5 V with R20"),
    "47k 1%": (A, "UNI-ROYAL 0402WGF4702TCE, 47 k 1% 0402", "C25792", 0.0019, "Charger safety timer"),
    "1k": (A, "UNI-ROYAL 0402WGF1001TCE, 1 k 1% 0402", "C11702", 0.0013, ""),
    "3.3k 1%": (A, "UNI-ROYAL 0402WGF3301TCE, 3.3 k 1% 0402", "C25890", 0.0036, "Charge termination current"),
    "10R": (A, "UNI-ROYAL 0402WGF100JTCE, 10 R 0402", "C25077", 0.001, ""),
    "2.2k": (A, "UNI-ROYAL 0402WGF2201TCE, 2.2 k 1% 0402", "C25879", 0.0011, ""),
    "100R": (A, "UNI-ROYAL 0402WGF1000TCE, 100 R 1% 0402", "C25076", 0.0012, ""),
    "330R": (A, "UNI-ROYAL 0402WGF3300TCE, 330 R 1% 0402", "C25104", 0.0011, ""),
    "47R 0.25W": (A, "UNI-ROYAL 0805W8F470JT5E, 47 R 0805", "C17714", 0.0027,
                  "125 mW part: enough for the IR LED's short pulses"),
    "MMBT2222A": (A, "CJ MMBT2222A, NPN SOT-23", "C8512", 0.0182, ""),
    "AO3401A": (A, "AOS AO3401A, P-MOSFET SOT-23", "C15127", 0.0814, ""),

    "2.2nF 50V": (B, "FH 0402B222K500NT, 2.2 nF 50 V X7R 0402", "C1531", 0.0025,
                  "No basic 2.2 nF in 0402; MPU-6050 charge pump"),
    "amber corner LED": (B, "KENTO KT-0603O, orange (598 nm) 0603", "C111340", 0.0117,
                         "Front corners. Basic red KT-0603R (C2286) would let JLCPCB fit it, but changes the look"),
    "amber edge LED": (B, "KENTO KT-0603O, orange (598 nm) 0603", "C111340", 0.0117,
                       "Back corner curves. Same red option as the corner LEDs"),
    "amber, charging": (B, "KENTO KT-0603O, orange (598 nm) 0603", "C111340", 0.0117, "Front, charging"),
    "green, power good": (B, "KENTO KT-0603G, green 0603", "C12624", 0.0119,
                          "Front. Basic white KT-0603W (C2290) works too"),
    "940nm IR LED": (B, "Vishay VSMY2940GX01, 940 nm 1206", "C3202699", 0.7625, "Front, IR emitter"),
    "USB-C USB2 device": (B, "GCT USB4105-GF-A, USB-C receptacle", "C3020560", 1.021, "Solder the shell pegs too"),
    "LiPo JST-PH 2-pin": (B, "XYECONN XY-S2B-PH-SM4-TB, JST-PH 2-pin side entry", "C54582899", 0.0472,
                          "Equivalent of JST S2B-PH-SM4-TB(LF)(SN)"),
    "microSD push-push": (B, "Hirose DM3AT-SF-PEJM5, microSD", "C114218", 1.3908, ""),
    "Qwiic / STEMMA QT": (B, "JST SM04B-SRSS-TB(LF)(SN), SH 4-pin", "C51940130", 0.0393,
                          "LCSC part is the XYECONN equivalent; JST original at Mouser"),
    "Speaker, 8R 0.7W 1511": (B, "JST SM02B-SRSS-TB(LF)(SN), SH 2-pin (speaker plug)", "C160402", 0.1322, ""),
    "1.5uH 2A shielded": (B, "TDK VLS3015ET-1R5N, 1.5 uH 3x3 mm, 1.5 A, 75 mOhm", "C3221497", 0.0632,
                          "On LCSC's store (min. 10); Sunlord SWPA3015S1R5NT (C56594) is the JLCPCB-assembly "
                          "stand-in; Taiyo Yuden NR3015T1R5N is out of stock"),
    "RESET": (B, "Panasonic EVQP2P02W, side-push tact, 2.5 mm", "C512395", 0.5638, "EVQ-P2 series; EVQ-P2002W fits too"),
    "BOOT": (B, "Panasonic EVQP2P02W, side-push tact, 2.5 mm", "C512395", 0.5638, ""),
    "MAIN POWER": (B, "C&K JS102011SAQN, slide switch", "C221660", 0.8541, ""),
    "ESP32-S3-WROOM-1-N16R8": (B, "Espressif ESP32-S3-WROOM-1-N16R8", "C2913202", 5.3485,
                               "Solder the ground pad through its vias from the front"),
    "USBLC6-2SC6": (B, "ST USBLC6-2SC6, USB ESD", "C7519", 0.157, ""),
    "BQ24074RGT": (B, "TI BQ24074RGTR, charger, VQFN-16", "C54313", 2.1188, "Exposed pad: hot air or hot plate"),
    "TPS63031DSK": (B, "TI TPS63031DSKR, 3.3 V buck-boost, WSON-10", "C15516", 1.1568, "Exposed pad: hot air or hot plate"),
    "MPU-6050": (B, "TDK InvenSense MPU-6050, QFN-24", "C24112", 21.0013,
                 "Costly as a genuine bare chip. Cheaper: Robu SKU 162123, generic, Rs 426 incl. GST "
                 "(Rs 369 at 10+): confirm it ships in the 4 x 4 mm QFN-24 (a 3 x 3 mm chip will not fit)"),
    "WS2812B-2020": (B, "Worldsemi WS2812B-2020-V6, status LED", "C52917434", 0.0923,
                     "Same footprint as WS2812B-2020 (C965555, out of stock); pads underneath: hot air"),
    "TPS61023 5V boost": (B, "TI TPS61023DRLR, 5 V boost for the display, SOT-563", "C919459", 0.233,
                          "Small 0.5 mm pitch: stencil and hot air"),
    "150k 1%": (B, "UNI-ROYAL 0402WGF1503TCE, 150 k 1% 0402", "C25755", 0.002, "No basic 150 k; sets the 5 V"),
    "AW9523B": (B, "Awinic AW9523BTQR, I2C expander, QFN-24", "C148077", 0.3266, "Exposed pad: hot air or hot plate"),
    "MAX98357A": (B, "ADI MAX98357AETE+T, I2S amplifier, TQFN-16", "C910544", 1.3089, "Exposed pad: hot air or hot plate"),

    "UP": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, "Any 6x6 THT tact fits"),
    "DOWN": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "LEFT": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "RIGHT": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "A": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "B": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "C": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "HOME": (C, "SHOU HAN TS665CJ, 6 x 6 x 5 mm tactile switch, 4-pin through-hole", "C393938", 0.0196, ""),
    "2.8in ILI9341 SPI module (MSP2807)": (C, "1x14 female header, 2.54 mm, 8.5 mm tall", "C41417326", 0.2363,
                                          "The display module plugs into it"),
    "Expansion: 3V3 GND IO5 IO41 IO42 IO47": (C, "XFCN PZ254V-11-06P, 1x6 male header, 2.54 mm (optional)", "C492405", 0.0431,
                                              "Any 2.54 mm header; or solder wires straight to the pads"),
    "TSOP38238": (C, "Vishay TSOP38238, 38 kHz IR receiver", "C141632", 0.648, "Front, lying flat, lens facing out"),
}
SKIP = {"Fiducial_1mm_Mask2mm"}
OFF_BOARD = [
    ("LCD1", 1, "2.8in 240x320 ILI9341 SPI module with touch, 14-pin header (LCDwiki MSP2807 type)",
     "Check its header reads VCC, GND, CS ... T_IRQ from pin 1"),
    ("BT1", 1, "LiPo 3.7 V with protection PCB and a JST-PH 2.0 lead, up to 6 x 34 x 50 mm "
     "(603450 about 1000 mAh; KP-603048 fits too)",
     "Check the plug is JST-PH 2.0 and the red wire goes to J2's + pin before plugging in"),
    ("LS1", 1, "Speaker 8 ohm, 15 x 11 mm (1511), e.g. XHXDZ 1511-L60MM (LCSC C50387185)",
     "Wire leads: solder them to J7's pads, or crimp a JST-SH 1.0 2-pin plug. Foam tape around the rim"),
    ("HW1-HW4", 4, "M3 standoff, female-female, about 11 mm", "Match the socket + header stack"),
    ("HW5-HW12", 8, "M3 x 5 mm screw", "Four from the back, four through the module"),
    ("BH1", 1, "Battery holder, L-shaped, 3D printed (50 mm long, 6 mm wall, 10-12 mm lip)",
     "Outline on the back silkscreen"),
    ("HW13-HW14", 2, "M2 x 6 mm screw", "Holds the battery holder in H5-H6"),
]


def run(*args):
    subprocess.run(["kicad-cli", *args], check=True, stdout=subprocess.DEVNULL)


def gerbers():
    for old in GERBERS.glob("*"):
        old.unlink()
    GERBERS.mkdir(parents=True, exist_ok=True)
    run("pcb", "export", "gerbers", "--layers", LAYERS, "--no-protel-ext", "-o", f"{GERBERS}/", str(BOARD))
    run("pcb", "export", "drill", "--format", "excellon", "--excellon-separate-th",
        "--excellon-units", "mm", "--generate-map", "-o", f"{GERBERS}/", str(BOARD))
    with zipfile.ZipFile(OUT / "oreo-badge-gerbers.zip", "w", zipfile.ZIP_DEFLATED) as z:
        for f in sorted(GERBERS.iterdir()):
            if f.suffix in (".gbr", ".drl") and "-drl_map" not in f.name:
                z.write(f, f.name)
    return sorted(zipfile.ZipFile(OUT / "oreo-badge-gerbers.zip").namelist())


def order(ref):
    head = "".join(c for c in ref if c.isalpha())
    return head, int(ref[len(head):] or 0)


def assembly():
    pos = OUT / "positions.csv"
    run("pcb", "export", "pos", "--format", "csv", "--units", "mm", "--side", "both", "-o", str(pos), str(BOARD))
    rows = [r for r in csv.DictReader(pos.open()) if r["Val"] not in SKIP]
    missing = sorted({r["Val"] for r in rows} - set(PARTS))
    if missing:
        raise SystemExit(f"no sourcing row for: {missing}")

    jlc = [r for r in rows if PARTS[r["Val"]][0] == JLC]
    plus = [r for r in rows if PARTS[r["Val"]][0] == JLC or
            (r["Val"] in JLC_PLUS and r["Side"] == "bottom")]

    # group by the part bought, not the value text
    lines = OrderedDict()
    for r in sorted(rows, key=lambda r: order(r["Ref"])):
        group, part, lcsc, price, note = PARTS[r["Val"]]
        key = (group, part, lcsc)
        line = lines.setdefault(key, dict(refs=[], pkg=r["Package"], price=price, notes=[]))
        line["refs"].append(r["Ref"])
        if note and note not in line["notes"]:
            line["notes"].append(note)

    def write_jlc(chosen, suffix):
        refs = {r["Ref"] for r in chosen}
        with (OUT / f"oreo-badge-CPL{suffix}.csv").open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(("Designator", "Mid X", "Mid Y", "Layer", "Rotation"))
            for r in chosen:
                w.writerow((r["Ref"], f'{float(r["PosX"]):.4f}mm', f'{float(r["PosY"]):.4f}mm',
                            "Top" if r["Side"] == "top" else "Bottom", f'{float(r["Rot"]):.1f}'))
        with (OUT / f"oreo-badge-BOM{suffix}.csv").open("w", newline="") as f:
            w = csv.writer(f)
            w.writerow(("Comment", "Designator", "Footprint", "Quantity", "Manufacturer Part", "LCSC Part #"))
            for (group, part, lcsc), line in lines.items():
                mine = [x for x in line["refs"] if x in refs]
                if mine:
                    w.writerow((part.split(", ", 1)[-1], ",".join(mine), line["pkg"], len(mine),
                                part.split(",")[0], lcsc))

    write_jlc(jlc, "")
    write_jlc(plus, "-plus")

    totals = {}
    with ORDER.open("w", newline="") as f:
        w = csv.writer(f)
        w.writerow(("Group", "Designators", "Qty per badge", "Part", "Footprint", "LCSC #",
                    f"LCSC unit USD ({PRICE_DATE})", "Line USD", "Notes"))
        for (group, part, lcsc), line in sorted(lines.items(), key=lambda kv: kv[0][0]):
            n = len(line["refs"])
            cost = round(n * line["price"], 4) if line["price"] is not None else None
            totals[group] = totals.get(group, 0) + (cost or 0)
            w.writerow((group, " ".join(line["refs"]), n, part, line["pkg"], lcsc,
                        "" if line["price"] is None else line["price"], "" if cost is None else cost,
                        "; ".join(line["notes"])))
        for refs, n, part, note in OFF_BOARD:
            w.writerow((D, refs, n, part, "", "", "", "", note))
    return len(jlc), sum(1 for k in lines if k[0] == JLC), totals


if __name__ == "__main__":
    files = gerbers()
    parts, lines, totals = assembly()
    print(f"Gerber zip: {len(files)} files")
    print(f"JLCPCB assembly: {parts} placements, {lines} BOM lines, all basic -> {OUT}")
    print(f"  oreo-badge-BOM-plus.csv / -CPL-plus.csv add the hard chips: {', '.join(sorted(JLC_PLUS))}")
    for group, usd in sorted(totals.items()):
        print(f"  {group}: about ${usd:.2f} per badge at LCSC single-unit prices (where listed)")
    print(f"Full order list: {ORDER}")
