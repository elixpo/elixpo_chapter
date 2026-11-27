#!/usr/bin/env python3
"""Generate the Oreo badge KiCad project schematics and preliminary BOM.

The source is intentionally data driven: every placed component carries a
reference, value, footprint, and named electrical nets.  The generated
schematics are self-contained and can be opened without a custom symbol
library.  Regenerate after changing a part or GPIO assignment with:

    python3 circuit/elixpo/generate_badge_schematic.py
"""

from csv import writer
from pathlib import Path
from uuid import UUID, uuid5


OUT = Path(__file__).resolve().parent
PROJECT = "elixpo"
LIB = "oreo_badge"
NS = UUID("11dfb61c-f4a7-4db0-8a38-f7922f779140")


def uid(name):
    return str(uuid5(NS, name))


def fx(size=1.27, hide=False, justify=None, bold=False):
    font = f"(font (size {size} {size})" + (" (bold yes)" if bold else "") + ")"
    extra = (f" (justify {justify})" if justify else "") + (" (hide yes)" if hide else "")
    return f"(effects {font}{extra})"


def component(ref, value, footprint, pins, x, y, note=""):
    """pins: iterable of (pin name, package pin number, net name).

    A number written "A4/B4" stands for several pads on the same net; each
    becomes its own pin, so every footprint pad has a schematic pin."""
    snap = lambda value: round(value / 1.27) * 1.27
    expanded = []
    for name, number, net in pins:
        for pad in str(number).split("/"):
            expanded.append((name, pad, net))
    return dict(ref=ref, value=value, footprint=footprint, pins=expanded,
                x=snap(x), y=snap(y), note=note)


def _layout_pins(pins):
    split = (len(pins) + 1) // 2
    left, right = pins[:split], pins[split:]
    # 5.08 mm keeps every pin on KiCad's 50 mil electrical grid, including
    # even-sized pin groups whose first offset is a half pitch.
    pitch = 5.08
    half = max(12.0, (max(len(left), len(right)) - 1) * pitch / 2 + 5)
    pin_x = 10.16 if len(pins) <= 4 else 25.4
    body_x = pin_x - 2.54
    laid = []
    for side, group in (("left", left), ("right", right)):
        for index, (name, number, net) in enumerate(group):
            # Pads that share a name (GND, VBUS) get distinct pin names.
            if [n for n, _num, _net in pins].count(name) > 1:
                name = f"{name}_{number}"
            y = (len(group) - 1) * pitch / 2 - index * pitch
            laid.append(dict(name=name, number=str(number), net=net, side=side,
                             x=-pin_x if side == "left" else pin_x, y=y,
                             angle=0 if side == "left" else 180))
    return laid, half, body_x


def symbol_def(key, comp):
    pins, half, body_x = _layout_pins(comp["pins"])
    rows = [
        f'(symbol "{LIB}:{key}"',
        '  (pin_names (offset 1.016))',
        '  (exclude_from_sim no) (in_bom yes) (on_board yes)',
        f'  (property "Reference" "U" (at 0 {-half - 3.8} 0) {fx()})',
        f'  (property "Value" "{comp["value"]}" (at 0 {half + 3.8} 0) {fx()})',
        f'  (property "Footprint" "{comp["footprint"]}" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at 0 0 0) {fx(hide=True)})',
        f'  (property "Description" "{comp["note"]}" (at 0 0 0) {fx(hide=True)})',
        f'  (symbol "{key}_0_1"',
        f'    (rectangle (start {-body_x} {-half}) (end {body_x} {half})',
        '      (stroke (width 0.254) (type solid)) (fill (type background)))',
        f'    (text "{comp["value"]}" (at 0 0 0) {fx(1.05, bold=True)})',
        '  )',
        f'  (symbol "{key}_1_1"',
    ]
    for pin in pins:
        rows += [
            f'    (pin bidirectional line (at {pin["x"]} {pin["y"]} {pin["angle"]}) (length 2.54)',
            f'      (name "{pin["name"]}" {fx(0.9)})',
            f'      (number "{pin["number"]}" {fx(0.9)}))',
        ]
    rows += ['  )', '  (embedded_fonts no)', ')']
    return "\n".join(rows), pins, half


def placed(page, sheet_id, key, comp, pins, half):
    x, y, ref = comp["x"], comp["y"], comp["ref"]
    rows = [
        '(symbol', f'  (lib_id "{LIB}:{key}")', f'  (at {x} {y} 0) (unit 1)',
        '  (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)',
        f'  (uuid "{uid(page + ref)}")',
        f'  (property "Reference" "{ref}" (at {x} {y - half - 3.8} 0) {fx(1.1, bold=True)})',
        f'  (property "Value" "{comp["value"]}" (at {x} {y + half + 3.8} 0) {fx(1.0)})',
        f'  (property "Footprint" "{comp["footprint"]}" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Datasheet" "" (at {x} {y} 0) {fx(hide=True)})',
        f'  (property "Description" "{comp["note"]}" (at {x} {y} 0) {fx(hide=True)})',
    ]
    rows += [f'  (pin "{p["number"]}" (uuid "{uid(page + ref + p["number"])}"))' for p in pins]
    rows += ['  (instances', f'    (project "{PROJECT}"',
             f'      (path "/{sheet_id}/{uid(page + ref)}" (reference "{ref}") (unit 1)))',
             '  )', ')']
    return "\n".join(rows)


def endpoint(comp, pin):
    return comp["x"] + pin["x"], comp["y"] - pin["y"]


def global_label(page, ref, pin):
    net = pin["net"]
    x, y = endpoint(ref, pin)
    if net.endswith("_NC"):
        return (f'(no_connect (at {x} {y}) '
                f'(uuid "{uid(page + ref["ref"] + pin["number"] + "nc")}"))')
    angle = 180 if pin["side"] == "left" else 0
    justify = "right" if pin["side"] == "left" else "left"
    return (f'(global_label "{net}" (shape bidirectional) (at {x} {y} {angle}) '
            f'{fx(0.9, justify=justify)} (uuid "{uid(page + ref["ref"] + pin["number"] + net + "label")}"))')


def note(page, index, text, x, y, size=1.1, bold=False):
    return (f'(text "{text}" (exclude_from_sim no) (at {x} {y} 0) '
            f'{fx(size, justify="left bottom", bold=bold)} '
            f'(uuid "{uid(page + "note" + str(index))}"))')


def page(name, title, sheet_id, components, notes):
    definitions, instances, labels = [], [], []
    for comp in components:
        key = comp["ref"].replace("#", "PWR")
        definition, pins, half = symbol_def(key, comp)
        definitions.append(definition)
        instances.append(placed(name, sheet_id, key, comp, pins, half))
        labels.extend(global_label(name, comp, pin) for pin in pins)

    rows = ['(kicad_sch', '  (version 20250114)',
            '  (generator "oreo_badge_generator")', '  (generator_version "1.0")',
            f'  (uuid "{uid(name + "root")}")', '  (paper "A3")',
            f'  (title_block (title "{title}") (rev "0.1")',
            '    (company "OreoOS open hardware badge"))', '  (lib_symbols']
    rows += ['    ' + item.replace('\n', '\n    ') for item in definitions]
    rows += ['  )']
    rows += ['  ' + item for item in labels]
    rows += ['  ' + note(name, i, *args) for i, args in enumerate(notes, 1)]
    rows += ['  ' + item.replace('\n', '\n  ') for item in instances]
    rows += ['  (embedded_fonts no)', ')']
    return "\n".join(rows) + "\n"


def p2(ref, value, fp, a, b, x, y, note_text=""):
    return component(ref, value, fp, [("1", 1, a), ("2", 2, b)], x, y, note_text)


R0402 = "Resistor_SMD:R_0402_1005Metric"
C0402 = "Capacitor_SMD:C_0402_1005Metric"
C0603 = "Capacitor_SMD:C_0603_1608Metric"


C0805 = "Capacitor_SMD:C_0805_2012Metric"
LED0603 = "LED_SMD:LED_0603_1608Metric"
BUTTON = "Button_Switch_THT:SW_PUSH_6mm"          # 6x6 mm through-hole tact switch, hand-soldered
SIDE_BUTTON = "Button_Switch_SMD:SW_SPST_EVQP2_ShortPushTravel_H2.5mm"
TP = "TestPoint:TestPoint_Pad_D1.5mm"


def led(ref, value, anode, cathode, x, y, note_text=""):
    """KiCad LED footprints put the cathode on pad 1 and the anode on pad 2."""
    return component(ref, value, LED0603, [("K", 1, cathode), ("A", 2, anode)], x, y, note_text)


def testpoint(ref, net, x, y):
    return component(ref, f"TP {net}", TP, [("TP", 1, net)], x, y)


# ESP32-S3-WROOM-1-N16R8: pad numbers from KiCad's RF_Module symbol and the
# Espressif datasheet. IO35-IO37 carry the in-module octal PSRAM.
MODULE_PINS = [
    ("GND", 1, "GND"), ("3V3", 2, "+3V3"), ("EN", 3, "EN"),
    ("IO4", 4, "IMU_INT"), ("IO5", 5, "EXP_IO5"), ("IO6", 6, "I2C_SDA"),
    ("IO7", 7, "I2C_SCL"), ("IO15", 8, "LCD_DC"), ("IO16", 9, "LCD_RST"),
    ("IO17", 10, "LCD_BL"), ("IO18", 11, "IR_RX"), ("IO8", 12, "I2S_BCLK_MCU"),
    ("USB_D-/IO19", 13, "USB_D-"), ("USB_D+/IO20", 14, "USB_D+"), ("IO3", 15, "EXP_INT"),
    ("IO46 strap", 16, "STRAP46_NC"), ("IO9", 17, "I2S_LRCLK"), ("IO10", 18, "I2S_DIN"),
    ("IO11", 19, "LCD_MOSI"), ("IO12", 20, "LCD_SCK_MCU"), ("IO13", 21, "LCD_MISO"),
    ("IO14", 22, "LCD_CS"), ("IO21", 23, "TOUCH_IRQ"), ("IO47", 24, "EXP_IO47"),
    ("IO48", 25, "STATUS_LED"), ("IO45 strap", 26, "STRAP45_NC"), ("IO0", 27, "BOOT"),
    ("IO35 PSRAM", 28, "PSRAM35_NC"), ("IO36 PSRAM", 29, "PSRAM36_NC"),
    ("IO37 PSRAM", 30, "PSRAM37_NC"), ("IO38", 31, "SD_CLK_MCU"), ("IO39", 32, "SD_CMD"),
    ("IO40", 33, "SD_D0"), ("IO41", 34, "EXP_IO41"), ("IO42", 35, "EXP_IO42"),
    ("RXD0/IO44", 36, "UART_RX"), ("TXD0/IO43", 37, "UART_TX"), ("IO2", 38, "IR_TX"),
    ("IO1", 39, "VBAT_SENSE"), ("GND", 40, "GND"), ("GND/EP", 41, "GND"),
]

CORE = [
    component("U1", "ESP32-S3-WROOM-1-N16R8", "RF_Module:ESP32-S3-WROOM-1", MODULE_PINS, 150, 140,
              "Wi-Fi/BLE module, 16 MB flash, 8 MB octal PSRAM, PCB antenna"),
    p2("C1", "22uF 10V", C0805, "+3V3", "GND", 45, 45, "Module bulk decoupling, at pin 2"),
    p2("C2", "100nF", C0402, "+3V3", "GND", 95, 45, "Module HF decoupling, at pin 2"),
    p2("R1", "10k", R0402, "+3V3", "EN", 45, 80),
    p2("C3", "1uF", C0402, "EN", "GND", 95, 80, "EN delay: 10k x 1uF, per Espressif"),
    p2("SW1", "RESET", SIDE_BUTTON, "EN", "GND", 45, 112),
    p2("R2", "10k", R0402, "+3V3", "BOOT", 95, 112),
    p2("SW2", "BOOT", SIDE_BUTTON, "BOOT", "GND", 45, 144),
    p2("R3", "22R", R0402, "LCD_SCK_MCU", "LCD_SCK", 270, 45, "Source termination: damps ringing on the 40 MHz display clock"),
    p2("R4", "22R", R0402, "SD_CLK_MCU", "SD_CLK", 270, 80, "Source termination for the SDMMC clock"),
    p2("R5", "33R", R0402, "I2S_BCLK_MCU", "I2S_BCLK", 270, 112, "Source termination for the I2S bit clock"),
    testpoint("TP1", "UART_TX", 45, 200),
    testpoint("TP2", "UART_RX", 95, 200),
    testpoint("TP3", "GND", 45, 230),
    testpoint("TP4", "+3V3", 95, 230),
    testpoint("TP5", "VBAT", 45, 260),
    testpoint("TP6", "EXP_P17", 95, 260),
]


POWER = [
    component("J1", "USB-C USB2 device", "Connector_USB:USB_C_Receptacle_GCT_USB4105-xx-A_16P_TopMnt_Horizontal",
              [("VBUS", "A4/B4/A9/B9", "VBUS_5V"), ("D-", "A7/B7", "USB_CONN_D-"),
               ("D+", "A6/B6", "USB_CONN_D+"), ("CC1", "A5", "USB_CC1"),
               ("CC2", "B5", "USB_CC2"), ("SBU1", "A8", "USB_SBU1_NC"), ("SBU2", "B8", "USB_SBU2_NC"),
               ("GND", "A1/B1/A12/B12", "GND"), ("SHIELD", "SH", "CHASSIS")], 42, 72),
    p2("R10", "5.1k", R0402, "USB_CC1", "GND", 95, 42, "Type-C sink Rd"),
    p2("R11", "5.1k", R0402, "USB_CC2", "GND", 95, 70, "Type-C sink Rd"),
    component("U3", "USBLC6-2SC6", "Package_TO_SOT_SMD:SOT-23-6",
              [("I/O1", "1/6", "USB_CONN_D-"), ("GND", 2, "GND"), ("I/O2", "3/4", "USB_CONN_D+"),
               ("VBUS", 5, "VBUS_5V")], 150, 54, "USB ESD array, at the connector"),
    p2("R12", "22R", R0402, "USB_CONN_D-", "USB_D-", 205, 42),
    p2("R13", "22R", R0402, "USB_CONN_D+", "USB_D+", 205, 70),
    p2("R19", "1M", R0402, "CHASSIS", "GND", 255, 42, "Shield bleed"),
    p2("C23", "1nF 50V", C0402, "CHASSIS", "GND", 255, 70, "Shield HF return"),
    component("U4", "BQ24074RGT", "Package_DFN_QFN:VQFN-16-1EP_3x3mm_P0.5mm_EP1.6x1.6mm",
              [("TS", 1, "BAT_TS"), ("BAT", "2/3", "VBAT"), ("~CE", 4, "GND"),
               ("EN2", 5, "VSYS"), ("EN1", 6, "GND"), ("~PGOOD", 7, "CHG_PG"),
               ("VSS", 8, "GND"), ("~CHG", 9, "CHG_STAT"), ("OUT", "10/11", "VSYS"),
               ("ILIM", 12, "USB_ILIM"), ("IN", 13, "VBUS_5V"), ("TMR", 14, "CHG_TMR"),
               ("ITERM", 15, "CHG_ITERM"), ("ISET", 16, "CHG_ISET"), ("VSS/EP", 17, "GND")], 95, 150,
              "1-cell Li-ion charger with power path; EN2=1 EN1=0: input limit set by ILIM"),
    p2("R14", "2.0k 1% (445 mA)", R0402, "CHG_ISET", "GND", 42, 205, "Charge current 890/R = 0.45 A = 0.45C for 1000 mAh"),
    p2("R15", "2.0k 1% (800 mA)", R0402, "USB_ILIM", "GND", 95, 205, "Input current limit 1610/R"),
    p2("R22", "47k 1%", R0402, "CHG_TMR", "GND", 150, 205, "Safety timer 10 x 48 s/k x R = 6.3 h"),
    p2("R25", "3.3k 1%", R0402, "CHG_ITERM", "GND", 205, 205, "Termination current 0.030 x R / R14 = 50 mA"),
    p2("R16", "10k 1%", R0402, "BAT_TS", "GND", 260, 205, "TS fixed at 10k: 2-wire cell with its own protection board"),
    p2("C24", "1uF 25V", C0603, "VBUS_5V", "GND", 42, 240),
    p2("C25", "4.7uF 10V", C0603, "VSYS", "GND", 95, 240),
    p2("C26", "4.7uF 10V", C0603, "VBAT", "GND", 150, 240),
    p2("R23", "1k", R0402, "VBUS_5V", "CHG_PG_LED_A", 330, 115),
    led("D20", "green, power good", "CHG_PG_LED_A", "CHG_PG", 330, 150, "Lit while USB power is good, even when the badge is off"),
    p2("R24", "1k", R0402, "VBUS_5V", "CHG_STAT_LED_A", 330, 190),
    led("D21", "amber, charging", "CHG_STAT_LED_A", "CHG_STAT", 330, 225, "Lit while charging, even when the badge is off"),
    component("J2", "LiPo JST-PH 2-pin", "Connector_JST:JST_PH_S2B-PH-SM4-TB_1x02-1MP_P2.00mm_Horizontal",
              [("BAT+", 1, "BAT_IN"), ("BAT-", 2, "GND"), ("MP", "MP", "GND")], 42, 110,
              "Protected 1S LiPo, 1000 mAh 603450; Q3 blocks a reversed pack"),
    component("Q3", "AO3401A", "Package_TO_SOT_SMD:SOT-23",
              [("G", 1, "BAT_FET_G"), ("S", 2, "VBAT"), ("D", 3, "BAT_IN")], 150, 110,
              "Reverse-battery protection: P-FET, gate to GND. A correct pack turns it on "
              "(conducts both ways, so charging works); a reversed pack leaves it off"),
    p2("R27", "10k", R0402, "BAT_FET_G", "GND", 205, 85, "Q3 gate to GND"),
    component("SW3", "MAIN POWER", "Button_Switch_SMD:SW_SPDT_CK_JS102011SAQN",
              [("ON", 1, "VSYS_SW"), ("COM", 2, "VSYS"), ("OFF", 3, "POWER_OFF_NC")], 205, 110,
              "Disconnects the system; charging stays powered"),
    component("U5", "TPS63031DSK", "Package_SON:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm",
              [("VOUT", 1, "+3V3"), ("L2", 2, "BUCK_L2"), ("PGND", 3, "GND"), ("L1", 4, "BUCK_L1"),
               ("VIN", 5, "VSYS_SW"), ("EN", 6, "VSYS_SW"), ("PS/SYNC", 7, "GND"),
               ("VINA", 8, "BUCK_VINA"), ("GND", 9, "GND"), ("FB", 10, "+3V3"), ("PGND/EP", 11, "GND")], 260, 150,
              "Fixed 3.3 V buck-boost; holds 3.3 V across the LiPo's 3.0-4.2 V"),
    p2("L1", "1.5uH 2A shielded", "Inductor_SMD:L_Taiyo-Yuden_NR-30xx", "BUCK_L1", "BUCK_L2", 310, 270),
    p2("R26", "10R", R0402, "VSYS_SW", "BUCK_VINA", 205, 270, "VINA RC filter"),
    p2("C27", "100nF", C0402, "BUCK_VINA", "GND", 255, 270),
    p2("C20", "10uF 10V", C0805, "VSYS_SW", "GND", 360, 240),
    p2("C21", "22uF 10V", C0805, "+3V3", "GND", 360, 270),
    p2("C28", "22uF 10V", C0805, "+3V3", "GND", 360, 205),
    p2("R17", "100k 1%", R0402, "VBAT", "VBAT_SENSE", 42, 270, "Battery voltage divider for the ADC (OreoOS battery.py)"),
    p2("R18", "100k 1%", R0402, "VBAT_SENSE", "GND", 95, 270),
    p2("C22", "100nF", C0402, "VBAT_SENSE", "GND", 150, 270),
]


# 2.8" ILI9341 SPI module (LCDwiki MSP2807 type, 50 x 86 mm, 240x320) on its
# 14-pin 2.54 mm header, with an XPT2046 resistive touch controller. The
# module has its own regulator and backlight transistor: LED is a logic input
# (high = on), so GPIO17 drives it directly and can PWM it. The touch
# controller shares the display's SPI bus; T_CS comes from the expander's
# spare pin and T_IRQ goes to GPIO21. The display's own SDO stays unconnected:
# on many of these modules it does not release MISO when CS is high, which
# would corrupt touch reads, and nothing reads the display back.
LCD_PINS = [
    ("VCC", 1, "LCD_5V"), ("GND", 2, "GND"), ("CS", 3, "LCD_CS"), ("RESET", 4, "LCD_RST"),
    ("DC", 5, "LCD_DC"), ("SDI (MOSI)", 6, "LCD_MOSI"), ("SCK", 7, "LCD_SCK"),
    ("LED", 8, "LCD_BL"), ("SDO (MISO)", 9, "LCD_SDO_NC"), ("T_CLK", 10, "LCD_SCK"),
    ("T_CS", 11, "EXP_P17"), ("T_DIN", 12, "LCD_MOSI"), ("T_DO", 13, "LCD_MISO"),
    ("T_IRQ", 14, "TOUCH_IRQ"),
]

DISPLAY = [
    component("J3", "2.8in ILI9341 SPI module (MSP2807)", "Connector_PinSocket_2.54mm:PinSocket_1x14_P2.54mm_Vertical",
              LCD_PINS, 120, 150, "1x14 2.54 mm socket for the module's header; hand-soldered"),
    p2("C30", "10uF 10V", C0805, "LCD_5V", "GND", 230, 75, "Bulk for the module's backlight, at J3 pin 1"),
    # 5 V for the display module, so its backlight stays equally bright from a
    # full cell (4.2 V) down to the cut-off. TPS61023DRLR pins per TI SLVSF14B:
    # 1 FB, 2 EN, 3 VIN, 4 GND, 5 SW, 6 VOUT. VOUT = 0.595 V x (1 + R20/R21).
    component("U6", "TPS61023 5V boost", "Package_TO_SOT_SMD:SOT-563",
              [("FB", 1, "LCD_FB"), ("EN", 2, "VSYS_SW"), ("VIN", 3, "VSYS_SW"), ("GND", 4, "GND"),
               ("SW", 5, "LCD_BOOST_SW"), ("VOUT", 6, "LCD_5V")], 320, 100,
              "5 V boost for the display module; output disconnected from the input when off"),
    p2("L2", "1.5uH 2A shielded", "Inductor_SMD:L_Taiyo-Yuden_NR-30xx", "VSYS_SW", "LCD_BOOST_SW", 320, 45,
       "Same part as L1; the TPS61023 takes 0.37-2.9 uH"),
    p2("C31", "10uF 10V", C0805, "VSYS_SW", "GND", 380, 45, "Boost input"),
    p2("C32", "22uF 10V", C0805, "LCD_5V", "GND", 380, 100, "Boost output (10 uF effective minimum)"),
    p2("R20", "150k 1%", R0402, "LCD_5V", "LCD_FB", 270, 150, "Sets 5.06 V with R21"),
    p2("R21", "20k 1%", R0402, "LCD_FB", "GND", 320, 150),
]
button_nets = (("UP", "BTN_UP"), ("DOWN", "BTN_DOWN"), ("LEFT", "BTN_LEFT"),
               ("RIGHT", "BTN_RIGHT"), ("A", "BTN_A"), ("B", "BTN_B"),
               ("C", "BTN_C"), ("HOME", "BTN_HOME"))
for i, (label, net) in enumerate(button_nets, 1):
    DISPLAY.append(p2(f"SW{10 + i}", label, BUTTON, net, "GND",
                      42 + ((i - 1) % 4) * 60, 230 + ((i - 1) // 4) * 30))


EXPANDER = [
    component("U11", "AW9523B", "Package_DFN_QFN:QFN-24-1EP_4x4mm_P0.5mm_EP2.7x2.7mm",
              [("P1_0", 1, "LED_TL_K"), ("P1_1", 2, "LED_TR_K"), ("P1_2", 3, "LED_BL_K"),
               ("P1_3", 4, "LED_BR_K"), ("P0_0", 5, "BTN_UP"), ("P0_1", 6, "BTN_DOWN"),
               ("P0_2", 7, "BTN_LEFT"), ("P0_3", 8, "BTN_RIGHT"), ("GND", 9, "GND"),
               ("P0_4", 10, "BTN_A"), ("P0_5", 11, "BTN_B"), ("P0_6", 12, "BTN_C"),
               ("P0_7", 13, "BTN_HOME"), ("P1_4", 14, "AMP_EN"), ("P1_5", 15, "SD_DET"),
               ("P1_6", 16, "AUX_ON_N"), ("P1_7", 17, "EXP_P17"), ("AD0", 18, "GND"),
               ("SCL", 19, "I2C_SCL"), ("SDA", 20, "I2C_SDA"), ("VCC", 21, "+3V3"),
               ("~INT", 22, "EXP_INT"), ("~RST", 23, "EXP_RST"), ("AD1", 24, "GND"),
               ("GND/EP", 25, "GND")], 150, 140,
              "I2C GPIO expander at 0x58: 8 buttons, 4 constant-current corner LEDs, amp enable, card detect"),
    p2("C40", "100nF", C0402, "+3V3", "GND", 45, 45),
    p2("R40", "2.2k", R0402, "I2C_SDA", "+3V3", 45, 75, "I2C pull-up, 400 kHz"),
    p2("R41", "2.2k", R0402, "I2C_SCL", "+3V3", 95, 75, "I2C pull-up, 400 kHz"),
    p2("R42", "10k", R0402, "EXP_INT", "+3V3", 45, 105),
    p2("R43", "10k", R0402, "EXP_RST", "+3V3", 95, 105),
    p2("R45", "10k", R0402, "EXP_P17", "+3V3", 95, 135, "Keeps the touch controller deselected (T_CS high) until the OS drives it"),
    component("Q4", "AO3401A", "Package_TO_SOT_SMD:SOT-23",
              [("G", 1, "AUX_ON_N"), ("S", 2, "+3V3"), ("D", 3, "+3V3_AUX")], 45, 180,
              "Switches 3.3 V to the IR receiver and the status LED: P1_6 low = on"),
    p2("R46", "100k", R0402, "AUX_ON_N", "+3V3", 95, 180, "Keeps +3V3_AUX off until the OS turns it on"),
]
for i, (_label, net) in enumerate(button_nets):
    EXPANDER.append(p2(f"R{50 + i}", "10k", R0402, net, "+3V3", 255 + (i % 2) * 50, 45 + (i // 2) * 30,
                       "Button pull-up: the AW9523B has none"))
for i, corner in enumerate(("TL", "TR", "BL", "BR"), 1):
    EXPANDER.append(led(f"D{i}", "amber corner LED", "+3V3", f"LED_{corner}_K",
                        255 + ((i - 1) % 2) * 50, 180 + ((i - 1) // 2) * 30,
                        "Driven by the AW9523B constant-current sink; amber for headroom from 3.3 V"))
for i, corner in enumerate(("TL", "TR", "BL", "BR")):
    for j in range(2):
        n = 30 + i * 2 + j
        EXPANDER.append(led(f"D{n}", "amber edge LED", "+3V3", f"LED_{corner}_K",
                            355 + j * 50, 45 + i * 30,
                            "Back edge light on the corner's curve, in parallel with the front corner LED"))


PERIPHERALS = [
    component("U12", "MAX98357A", "Package_DFN_QFN:TQFN-16-1EP_3x3mm_P0.5mm_EP1.23x1.23mm",
              [("DIN", 1, "I2S_DIN"), ("GAIN_SLOT", 2, "GND"), ("GND", 3, "GND"),
               ("~SD_MODE", 4, "AMP_SDMODE"), ("NC", 5, "AMP5_NC"), ("NC", 6, "AMP6_NC"),
               ("VDD", "7/8", "VSYS_SW"), ("OUTP", 9, "SPK_P"), ("OUTN", 10, "SPK_N"),
               ("GND", 11, "GND"), ("NC", 12, "AMP12_NC"), ("NC", 13, "AMP13_NC"),
               ("LRCLK", 14, "I2S_LRCLK"), ("GND", 15, "GND"), ("BCLK", 16, "I2S_BCLK"),
               ("PAD", 17, "GND")], 60, 75, "I2S class-D amplifier, 12 dB gain, (L+R)/2 mono"),
    p2("R60", "1M", R0402, "AMP_EN", "AMP_SDMODE", 120, 45, "With the internal 100k: 0.3 V = (L+R)/2 when enabled, shutdown when low"),
    p2("C60", "10uF 10V", C0805, "VSYS_SW", "GND", 120, 75),
    p2("C61", "100nF", C0402, "VSYS_SW", "GND", 120, 105),
    component("J7", "Speaker, 8R 0.7W 1511", "Connector_JST:JST_SH_SM02B-SRSS-TB_1x02-1MP_P1.00mm_Horizontal",
              [("SPK+", 1, "SPK_P"), ("SPK-", 2, "SPK_N"), ("MP", "MP", "GND")], 60, 140,
              "Small mobile speaker beside the name card"),
    component("U7", "MPU-6050", "Sensor_Motion:InvenSense_QFN-24_4x4mm_P0.5mm",
              [("CLKIN", 1, "GND"), ("NC", 2, "IMU2_NC"), ("NC", 3, "IMU3_NC"), ("NC", 4, "IMU4_NC"),
               ("NC", 5, "IMU5_NC"), ("AUX_DA", 6, "IMU6_NC"), ("AUX_CL", 7, "IMU7_NC"),
               ("VLOGIC", 8, "+3V3"), ("AD0", 9, "+3V3"), ("REGOUT", 10, "IMU_REGOUT"),
               ("FSYNC", 11, "GND"), ("INT", 12, "IMU_INT"), ("VDD", 13, "+3V3"),
               ("NC", 14, "IMU14_NC"), ("NC", 15, "IMU15_NC"), ("NC", 16, "IMU16_NC"),
               ("NC", 17, "IMU17_NC"), ("GND", 18, "GND"), ("RESV", 19, "IMU19_NC"),
               ("CPOUT", 20, "IMU_CPOUT"), ("RESV", 21, "IMU21_NC"), ("RESV", 22, "IMU22_NC"),
               ("SCL", 23, "I2C_SCL"), ("SDA", 24, "I2C_SDA")], 200, 75, "IMU at 0x68"),
    p2("C62", "100nF", C0402, "IMU_REGOUT", "GND", 260, 45),
    p2("C63", "2.2nF 50V", C0402, "IMU_CPOUT", "GND", 260, 75),
    p2("C64", "100nF", C0402, "+3V3", "GND", 260, 105),
    component("J4", "microSD push-push", "Connector_Card:microSD_HC_Hirose_DM3AT-SF-PEJM5",
              [("DAT2", 1, "SD_D2"), ("DAT3", 2, "SD_D3"), ("CMD", 3, "SD_CMD"), ("VDD", 4, "+3V3"),
               ("CLK", 5, "SD_CLK"), ("VSS", 6, "GND"), ("DAT0", 7, "SD_D0"), ("DAT1", 8, "SD_D1"),
               ("DET_B", 9, "SD_DET"), ("DET_A", 10, "GND"), ("SHIELD", "SH", "GND")], 60, 210,
              "1-bit SDMMC (CLK, CMD, D0) on its own bus; DAT1-DAT3 pulled up keep the card in SD mode"),
    p2("C67", "10uF 10V", C0805, "+3V3", "GND", 120, 180),
    p2("C68", "100nF", C0402, "+3V3", "GND", 120, 210),
    p2("R62", "10k", R0402, "SD_DET", "+3V3", 120, 240),
    component("J6", "Expansion: 3V3 GND IO5 IO41 IO42 IO47", "Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical",
              [("3V3", 1, "+3V3"), ("GND", 2, "GND"), ("IO5", 3, "EXP_IO5"), ("IO41", 4, "EXP_IO41"),
               ("IO42", 5, "EXP_IO42"), ("IO47", 6, "EXP_IO47")], 340, 75,
              "Four free GPIOs for add-ons: I2C, SPI or plain GPIO through the GPIO matrix"),
]
for i, net in enumerate(("SD_CMD", "SD_D0", "SD_D1", "SD_D2", "SD_D3")):
    PERIPHERALS.append(p2(f"R{63 + i}", "10k", R0402, net, "+3V3", 170 + (i % 3) * 45, 180 + (i // 3) * 30,
                          "SDMMC pull-up"))
PERIPHERALS += [
    component("U8", "TSOP38238", "OptoDevice:Vishay_MINICAST-3Pin",
              [("OUT", 1, "IR_RX"), ("GND", 2, "GND"), ("Vs", 3, "IR_RX_VCC")], 200, 150, "38 kHz IR receiver"),
    p2("R70", "100R", R0402, "+3V3_AUX", "IR_RX_VCC", 260, 140),
    p2("C70", "4.7uF", C0603, "IR_RX_VCC", "GND", 260, 170),
    component("Q1", "MMBT2222A", "Package_TO_SOT_SMD:SOT-23",
              [("B", 1, "IR_BASE"), ("E", 2, "GND"), ("C", 3, "IR_LED_K")], 340, 150, "IR LED pulse driver"),
    p2("R71", "1k", R0402, "IR_TX", "IR_BASE", 390, 140),
    p2("R72", "100k", R0402, "IR_BASE", "GND", 390, 170),
    component("D10", "940nm IR LED", "LED_SMD:LED_1206_3216Metric",
              [("K", 1, "IR_LED_K"), ("A", 2, "IR_LED_A")], 340, 210),
    p2("R73", "47R 0.25W", "Resistor_SMD:R_0805_2012Metric", "VSYS_SW", "IR_LED_A", 390, 210, "IR pulse current limit"),
    component("U9", "WS2812B-2020", "LED_SMD:LED_WS2812B-2020_PLCC4_2.0x2.0mm",
              [("DOUT", 1, "STATUS_DOUT_NC"), ("VSS", 2, "GND"), ("DIN", 3, "STATUS_DIN"),
               ("VDD", 4, "+3V3_AUX")], 200, 240, "Status LED, on the switched +3V3_AUX"),
    p2("R74", "330R", R0402, "STATUS_LED", "STATUS_DIN", 260, 230),
    p2("C71", "100nF", C0402, "+3V3_AUX", "GND", 260, 260),
    component("J5", "Qwiic / STEMMA QT", "Connector_JST:JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal",
              [("GND", 1, "GND"), ("3V3", 2, "+3V3"), ("SDA", 3, "I2C_SDA"), ("SCL", 4, "I2C_SCL"),
               ("MP", "MP", "GND")], 340, 260, "I2C accessory port, Qwiic pin order"),
]


PAGES = [
    ("core_compute", "Oreo badge — ESP32-S3-WROOM-1 module, buttons and debug", CORE,
     [("ESP32-S3-WROOM-1-N16R8 MODULE", 18, 18, 2.0, True),
      ("IO35-IO37 carry the module's octal PSRAM and stay unconnected; IO45/IO46 are strapping pins.", 18, 25, 1.15, False),
      ("Keep the module's antenna over the copper-free name-card area, on every layer.", 18, 285, 1.05, False)]),
    ("power_usb", "Oreo badge — USB-C, charger, battery sense and 3.3 V rail", POWER,
     [("USB-C + BATTERY MANAGEMENT", 18, 18, 2.0, True),
      ("BQ24074 runs the badge from USB while it charges; SW3 cuts the system, not charging; R17/R18 read the battery on GPIO1.", 18, 25, 1.1, False),
      ("Charge current 0.45 A suits a 1000 mAh cell (0.45C); recheck R14 for any other cell.", 18, 285, 1.05, False)]),
    ("display_controls", "Oreo badge — 2.8 inch ILI9341 SPI module and buttons", DISPLAY,
     [("DISPLAY + BUTTONS", 18, 18, 2.0, True),
      ("4-line SPI module on a 14-pin header, powered from its own 5 V boost; touch shares the bus, T_CS on EXP_P17, T_IRQ on GPIO21.", 18, 25, 1.1, False),
      ("Buttons are read through the AW9523B expander (sheet expander_leds).", 18, 285, 1.05, False)]),
    ("expander_leds", "Oreo badge — AW9523B expander, I2C bus and corner LEDs", EXPANDER,
     [("I2C EXPANDER + CORNER AND EDGE LEDS", 18, 18, 2.0, True),
      ("I2C addresses: AW9523B 0x58, MPU-6050 0x69 (AD0 high).", 18, 25, 1.1, False),
      ("The expander interrupt (GPIO3) is an RTC GPIO, so a button press can wake the badge.", 18, 285, 1.05, False)]),
    ("peripherals_expansion", "Oreo badge — speaker, motion, microSD, infrared and expansion", PERIPHERALS,
     [("AUDIO, SENSORS AND STORAGE", 18, 18, 2.0, True),
      ("microSD uses 1-bit SDMMC on GPIO38-40; J6 brings out GPIO5, 41, 42 and 47 for add-ons.", 18, 25, 1.1, False),
      ("The amplifier runs from VSYS (switched), never from the 3.3 V regulator.", 18, 285, 1.05, False)]),
]


SOURCING = {
    "U1": ("Espressif Systems", "ESP32-S3-WROOM-1-N16R8", "Active", "Module with PCB antenna; keep-out per datasheet"),
    "J1": ("GCT", "USB4105-GF-A", "Active", "USB 2.0 Type-C receptacle"),
    "U3": ("STMicroelectronics", "USBLC6-2SC6", "Active", "USB ESD array"),
    "U4": ("Texas Instruments", "BQ24074RGTR", "Active", "Power-path single-cell Li-ion charger"),
    "U5": ("Texas Instruments", "TPS63031DSKR", "Active", "Fixed 3.3 V buck-boost"),
    "L1": ("Taiyo Yuden", "NR3015T1R5N", "Verify current", "1.5 uH shielded, >=1.5 A saturation"),
    "SW3": ("C&K", "JS102011SAQN", "Active", "Main system disconnect"),
    "J2": ("JST", "S2B-PH-SM4-TB(LF)(SN)", "Active", "Battery connector; pack polarity varies by vendor"),
    "U6": ("Texas Instruments", "TPS61023DRLR", "Active", "Synchronous 5 V boost for the display module"),
    "J3": ("Generic", "1x14 female header, 2.54 mm, 8.5 mm", "Active", "Through-hole, hand-soldered; the module plugs in"),
    "Q3": ("Alpha & Omega", "AO3401A", "Active", "Reverse-battery protection, -30 V P-FET, about 50 mOhm at -4.5 V"),
    "U11": ("Awinic", "AW9523BTQR", "Active", "16-bit I2C expander with LED current drive"),
    "U12": ("Analog Devices / Maxim", "MAX98357AETE+T", "Active", "I2S class-D amplifier"),
    "J7": ("JST", "SM02B-SRSS-TB(LF)(SN)", "Active", "Speaker lead connector"),
    "U7": ("TDK InvenSense", "MPU-6050", "Sourcing risk", "Firmware-compatible; buy traceable stock or qualify a successor"),
    "J4": ("Hirose", "DM3AT-SF-PEJM5", "Active", "Push-push microSD with card detect"),
    "U8": ("Vishay", "TSOP38238", "Active", "38 kHz demodulating IR receiver"),
    "Q1": ("onsemi", "MMBT2222ALT1G", "Active", "IR LED pulse driver"),
    "D10": ("Vishay", "VSMY2940GX01", "Active", "940 nm IR emitter"),
    "U9": ("Worldsemi", "WS2812B-2020", "Verify source", "3.3 V operation as on the DevKit"),
    "J5": ("JST", "SM04B-SRSS-TB(LF)(SN)", "Active", "Qwiic / STEMMA QT port"),
}


def sourcing_for(comp):
    if comp["ref"] in SOURCING:
        return SOURCING[comp["ref"]]
    prefix = ''.join(ch for ch in comp["ref"] if ch.isalpha())
    if prefix in ("R", "C"):
        return ("Qualified commodity", "", "Select by rating",
                "Use 1% resistors; X7R capacitors with voltage derating")
    if prefix in ("D", "L", "FB"):
        return ("Qualified commodity", "", "Select by rating", "Confirm current, power and package")
    if prefix == "SW":
        return ("E-Switch / C&K equivalent", "", "Mechanical check", "Confirm actuator height and force")
    return ("TBD", "", "Select", "Confirm availability and mechanical fit")


def root_schematic():
    root = uid("elixporoot")
    rows = ['(kicad_sch', '  (version 20250114)', '  (generator "oreo_badge_generator")',
            '  (generator_version "1.0")', f'  (uuid "{root}")', '  (paper "A3")',
            '  (title_block (title "Oreo badge complete hardware") (rev "0.1")',
            '    (company "OreoOS open hardware badge"))', '  (lib_symbols)',
            '  ' + note("root", 1, "OREO BADGE — COMPLETE HARDWARE", 25, 25, 2.5, True),
            '  ' + note("root", 2, "ESP32-S3-WROOM-1-N16R8 / 2.8 inch ILI9341 / 1000 mAh LiPo / 4-layer PCB", 25, 34, 1.35),
            '  ' + note("root", 3, "Open each sheet for component-level wiring and assigned footprints.", 25, 42, 1.15)]
    positions = ((25, 60), (150, 60), (275, 60), (25, 160), (150, 160))
    for page_no, ((name, title, _components, _notes), (x, y)) in enumerate(zip(PAGES, positions), 2):
        sid = uid(name + "sheet")
        rows += ['  (sheet', f'    (at {x} {y})', '    (size 110 60)',
                 '    (exclude_from_sim no) (in_bom yes) (on_board yes) (dnp no)',
                 '    (stroke (width 0.4) (type solid))', '    (fill (color 245 230 220 1))',
                 f'    (uuid "{sid}")',
                 f'    (property "Sheetname" "{title}" (at {x} {y - 1} 0) {fx(1.15, justify="left bottom", bold=True)})',
                 f'    (property "Sheetfile" "{name}.kicad_sch" (at {x} {y + 61} 0) {fx(1.0, justify="left top")})',
                 '    (instances', f'      (project "{PROJECT}"',
                 f'        (path "/{sid}" (page "{page_no}")))', '    )', '  )']
    rows += ['  (sheet_instances (path "/" (page "1")))', '  (embedded_fonts no)', ')']
    return "\n".join(rows) + "\n"


def write_bom():
    with (OUT / "BOM_PRELIMINARY.csv").open("w", newline="") as stream:
        csv = writer(stream, lineterminator="\n")
        csv.writerow(("Reference", "Value / part", "Footprint", "Sheet", "Design note"))
        for name, _title, components, _notes in PAGES:
            for comp in components:
                csv.writerow((comp["ref"], comp["value"], comp["footprint"], name, comp["note"]))

    with (OUT / "BOM_PROCUREMENT.csv").open("w", newline="") as stream:
        csv = writer(stream, lineterminator="\n")
        csv.writerow(("Reference", "Qty", "Value / function", "Manufacturer",
                      "Manufacturer part", "Footprint", "Populate", "Status", "Notes"))
        for name, _title, components, _notes in PAGES:
            for comp in components:
                manufacturer, mpn, status, sourcing_note = sourcing_for(comp)
                populate = "DNP" if comp["value"].startswith("DNP") else "YES"
                csv.writerow((comp["ref"], 1, comp["value"], manufacturer, mpn,
                              comp["footprint"], populate, status,
                              "; ".join(x for x in (comp["note"], sourcing_note) if x)))
        csv.writerow(("BT1", 1, "Protected 1S LiPo 1000 mAh, 603450 (6x34x50 mm)",
                      "Qualified battery vendor", "TBD", "Off-board / JST-PH 2-wire",
                      "YES", "Safety-critical",
                      "Must include a protection PCB; check the lead polarity against J2"))
        csv.writerow(("LCD1", 1, "2.8 inch 240x320 ILI9341 SPI module with XPT2046 touch, 14-pin header",
                      "LCDwiki", "MSP2807", "Off-board / J3", "YES", "Active",
                      "50 x 86 mm module; check the header pin order matches J3 before soldering"))
        csv.writerow(("LS1", 1, "Speaker 8 ohm 0.7 W, 15x11 mm, with leads",
                      "Qualified vendor", "TBD", "Off-board / J7", "YES", "Select", "Mobile-phone type"))
        csv.writerow(("HW1-HW4", 4, "M3 standoff, 11 mm, female-female", "Qualified vendor", "TBD",
                      "Mechanical / H1-H4", "YES", "Select",
                      "Holds the module at the height of its header in J3; check against the parts"))
        csv.writerow(("HW5-HW12", 8, "M3 x 5 mm screw", "Qualified vendor", "TBD",
                      "Mechanical / H1-H4", "YES", "Select", "Four from the back, four through the module"))
        csv.writerow(("BH1", 1, "Battery holder, L-shaped, 3D printed", "3D print", "TBD",
                      "Mechanical / H5-H6", "YES", "Design",
                      "Runs the battery's 50 mm edge, as tall as the cell (6 mm), with a 10-12 mm lip over it; "
                      "two M2 screws in H5-H6, outline on the back silkscreen"))
        csv.writerow(("HW13-HW14", 2, "M2 x 6 mm screw", "Qualified vendor", "TBD",
                      "Mechanical / H5-H6", "YES", "Select", "Fixes the battery holder"))


def write_symbol_library():
    definitions = []
    for _name, _title, components, _notes in PAGES:
        for comp in components:
            key = comp["ref"].replace("#", "PWR")
            definition, _pins, _half = symbol_def(key, comp)
            definitions.append(definition.replace(
                f'(symbol "{LIB}:', '(symbol "', 1))
    text = ('(kicad_symbol_lib\n  (version 20251024)\n'
            '  (generator "oreo_badge_generator")\n'
            '  (generator_version "1.0")\n' +
            '\n'.join('  ' + item.replace('\n', '\n  ')
                      for item in definitions) +
            '\n)\n')
    (OUT / "oreo_badge.kicad_sym").write_text(text)
    (OUT / "sym-lib-table").write_text(
        '(sym_lib_table\n'
        '  (version 7)\n'
        '  (lib (name "oreo_badge")(type "KiCad")'
        '(uri "${KIPRJMOD}/oreo_badge.kicad_sym")(options "")(descr ""))\n'
        ')\n')


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "elixpo.kicad_sch").write_text(root_schematic())
    for name, title, components, notes in PAGES:
        (OUT / f"{name}.kicad_sch").write_text(
            page(name, title, uid(name + "sheet"), components, notes))
    write_bom()
    write_symbol_library()
    print("Generated Oreo badge schematics and BOM in", OUT)


if __name__ == "__main__":
    main()
