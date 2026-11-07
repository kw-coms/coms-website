# Sketch debug information

POST `/lab/api/compile` with `{ "sketch": "...", "debug": true }`.
Successful responses retain `hex`, `warnings`, and `sizeBytes`, and add:

```json
{
  "debug": {
    "lines": [{ "addr": 150, "line": 5 }, { "addr": 162, "line": 7 }],
    "globals": [{ "name": "counter", "addr": 265, "size": 2, "type": "volatile int" }]
  }
}
```

- `lines.addr`: **flash byte address**, not AVR word PC. Lines are 1-based in the original sketch, taken from DWARF after the preprocessor's `#line` mapping. Same-address rows collapse to the last sketch row; results sort by address.
- `globals.addr`: AVR **CPU data-space index**, usable with the simulator SRAM/data view. ELF `0x800100` maps to `0x100` (256), not zero. Only Uno SRAM `[0x100, 0x900)` is exposed, with a validated byte size.
- Globals must be declared in the exact sketch file, outside function scope, and have a fixed absolute SRAM location. DWARF types support scalars, typedefs, const/volatile qualifiers, simple pointers, arrays and named aggregates. Optimized-out variables, registers, EEPROM, stack locals, dynamic location expressions, and unsupported types (including function pointers/pointers to arrays) are omitted. Names are bounded C identifiers. No paths, source excerpts, ELF bytes, or raw tool output enter the response.
- Optimization remains `-Os` with the platform's LTO settings. Explicit C/C++/link extra flags `-g` retain DWARF. Optimized code can omit or reorder lines/variables; this is not a source-level execution trace. Header/library line rows are excluded.
- Extraction uses only the image's fixed `avr-readelf` executable, GNU DWARF 2/4 `info`, `rawline`, and `decodedline` output. The compiler and extractor share the existing 20-second deadline; process-group termination, clean environment, CPU/file limits and temporary-directory cleanup apply to both. Extractor address space is 128 MiB and text output is capped at 4 MiB.
- Debug payload: at most 4,096 line rows and 128 globals (name ≤96, type ≤160 characters), bounded below 192 KiB JSON. Entries beyond these limits are omitted. HEX retains its existing independent 192 KiB cap. Extraction failures return the normal sanitized failure response, with no partial ELF output.
- Omitting `debug`, or setting it to `false`, skips extraction and preserves the old response shape. Non-boolean values are rejected before invoking the compiler. Request validation, queue/rate limits, authentication and include allowlist remain in force.

## Verification

`node --test 'lab/compiler/test/*.test.mjs'` runs without AVR tools. Recorded tool output fixtures exercise GCC 7.3 with `-Os -flto` / DWARF2 and `-Os -gdwarf-4`, plus pointer qualifier cases. Integration tests inject only the CLI/tool runners and use real temporary artifacts to verify output filtering and cleanup.

`test/fixtures/debug/README.md` explains fixture provenance and reproduction. Actual arduino-cli/Docker preprocessing and frontend debugger integration are separate orchestrator acceptance checks.

References: [Arduino AVR platform flags](https://github.com/arduino/ArduinoCore-avr/blob/1.8.8/platform.txt), [CLI build properties](https://docs.arduino.cc/arduino-cli/commands-reference/arduino-cli_compile), [GNU readelf](https://sourceware.org/binutils/docs/binutils/readelf.html).
