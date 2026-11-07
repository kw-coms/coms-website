# Recorded AVR DWARF fixtures

Recorded locally with **avr-g++ 7.3.0 / avr-readelf GNU binutils 2.26**, the Arduino `7.3.0-atmel3.6.1-arduino7` toolchain, targeting `atmega328p`.

`sketch.ino.cpp` models Arduino's generated prototype prefix and `#line` directives explicitly. The sketch declarations have lines 1–4; setup is sketch line 5, loop is line 6, and its statements are lines 7–9. A foreign `core/main.cpp` supplies main and a global that must be excluded. This is a controlled preprocessing fixture, not a recording of an arduino-cli invocation.

```sh
avr-g++ -g -Os -flto -mmcu=atmega328p sketch.ino.cpp -o sketch.ino.elf
avr-readelf --wide --debug-dump=info --debug-dump=rawline --debug-dump=decodedline sketch.ino.elf > avr-gcc7-lto.txt
avr-g++ -g -gdwarf-4 -Os -mmcu=atmega328p sketch.ino.cpp -o dwarf4.elf
avr-readelf --wide --debug-dump=info --debug-dump=rawline --debug-dump=decodedline dwarf4.elf > avr-gcc7-dwarf4.txt
avr-g++ -g -Os -mmcu=atmega328p pointers.cpp -o pointers.elf
avr-readelf --wide --debug-dump=info --debug-dump=rawline --debug-dump=decodedline pointers.elf > avr-gcc7-pointers.txt
```

Host checkout/toolchain directory strings were normalized to `/fixture/build` and `/fixture/toolchain`; source-level `/fixture/sketch/sketch.ino` and `/fixture/core/main.cpp` paths come directly from the `#line` directives. No ELF binary is committed. Optimized link addresses and producer paths can vary by toolchain release; use the pinned release to compare expected values.
