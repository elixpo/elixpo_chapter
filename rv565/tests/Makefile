# Host tests for the portable core and player. Run from the repository root:
#   make -C tests
CC      ?= cc
CFLAGS  ?= -std=c99 -O2 -Wall -Wextra -Werror
SRC     := ../src/rv565.c ../src/rv565_player.c ../src/third_party/miniz_tinfl.c
BUILD   := build

# Extra containers to check, e.g. make -C tests CLIPS="w90.rv565 w360.rv565"
CLIPS   ?=

.PHONY: all clean
all: $(BUILD)/test_host $(BUILD)/test_player $(BUILD)/test_panel
	$(BUILD)/test_panel
	python3 -I check_host.py $(BUILD)/test_host data/testpattern.rv565
	$(BUILD)/test_player data/testpattern.rv565
	@for clip in $(CLIPS); do \
		python3 -I check_host.py $(BUILD)/test_host $$clip && $(BUILD)/test_player $$clip || exit 1; \
	done

$(BUILD)/test_host: test_host.c $(SRC) | $(BUILD)
	$(CC) $(CFLAGS) -I../src $^ -o $@

$(BUILD)/test_player: test_player.c $(SRC) | $(BUILD)
	$(CC) $(CFLAGS) -I../src $^ -o $@

$(BUILD)/test_panel: test_panel.c ../src/port/st7789_init.h ../src/rv565_panel.h | $(BUILD)
	$(CC) $(CFLAGS) -I../src $< -o $@

$(BUILD):
	mkdir -p $@

clean:
	rm -rf $(BUILD)
