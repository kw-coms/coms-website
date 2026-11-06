#!/bin/sh
# Installed under fixed AVR tool names. No user-controlled executable selection.
case "${0##*/}" in
  avr-gcc|avr-g++|avr-gcc-ar|avr-ar|avr-objcopy|avr-size) ;;
  *) exit 126 ;;
esac
# Hard and soft limits; cc1/cc1plus, assembler, linker and LTO inherit these.
exec /usr/bin/prlimit --as=134217728:134217728 --cpu=10:10 \
  --fsize=16777216:16777216 --core=0:0 -- "/opt/avr-toolchain/bin/${0##*/}" "$@"
