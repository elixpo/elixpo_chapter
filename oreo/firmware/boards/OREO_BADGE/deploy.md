Flash the complete OreoOS image with `./deploy --full` from the OreoOS
repository, which writes this firmware and installs the OS files. To write
only the firmware:

```bash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 erase-flash
python -m esptool --chip esp32s3 --port /dev/ttyACM0 write-flash 0 firmware.bin
```
