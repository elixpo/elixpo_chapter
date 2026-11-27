# Host tests for the portable core and player, and the format version 7 and
# 8 conformance vectors (data/v7, data/v8). Run from the repository root:
#   make -C tests
CC      ?= cc
CFLAGS  ?= -std=c99 -O2 -Wall -Wextra -Werror
SRC     := ../src/rv565.c ../src/rv565_player.c ../src/third_party/miniz_tinfl.c
BUILD   := build

# Extra containers to check, e.g. make -C tests CLIPS="w90.rv565 w360.rv565"
CLIPS   ?=

# rgb565be vectors with keyframes, deltas, repeats, partial and region deltas,
# plus one other format
# (which the player must reject).
PLAYER_CLIPS := data/testpattern.rv565 $(wildcard data/v7/rgb565be_*.rv565) $(wildcard data/v8/rgb565be_*.rv565) data/v7/rgb888_zlib_k4.rv565

.PHONY: all clean
all: $(BUILD)/test_host $(BUILD)/test_player $(BUILD)/test_panel $(BUILD)/test_conformance
	$(BUILD)/test_panel
	python3 -I check_host.py $(BUILD)/test_host data/testpattern.rv565
	python3 -I check_conformance.py $(BUILD)/test_conformance data/v7
	python3 -I check_conformance.py $(BUILD)/test_conformance data/v8
	$(BUILD)/test_player $(PLAYER_CLIPS)
	@for clip in $(CLIPS); do \
		python3 -I check_host.py $(BUILD)/test_host $$clip && $(BUILD)/test_player $$clip || exit 1; \
	done

$(BUILD)/test_host: test_host.c $(SRC) | $(BUILD)
	$(CC) $(CFLAGS) -I../src $^ -o $@

$(BUILD)/test_player: test_player.c $(SRC) | $(BUILD)
	$(CC) $(CFLAGS) -I../src $^ -o $@

$(BUILD)/test_conformance: test_conformance.c ../src/rv565.c ../src/third_party/miniz_tinfl.c | $(BUILD)
	$(CC) $(CFLAGS) -I../src $^ -o $@

$(BUILD)/test_panel: test_panel.c ../src/port/st7789_init.h ../src/rv565_panel.h | $(BUILD)
	$(CC) $(CFLAGS) -I../src $< -o $@

$(BUILD):
	mkdir -p $@

clean:
	rm -rf $(BUILD)
