/** Intel HEX loader for the ATmega328P 32 KiB flash. Unwritten bytes remain 0xff. */
export function loadIntelHex(hex: string): Uint16Array {
  const flashBytes = new Uint8Array(32_768).fill(0xff);
  let baseAddress = 0;
  let reachedEnd = false;

  for (const rawLine of hex.trim().split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (!/^:[0-9a-fA-F]+$/.test(line) || (line.length - 1) % 2) {
      throw new Error('Intel HEX 형식이 잘못되었습니다.');
    }

    const record = Uint8Array.from(line.slice(1).match(/../g)!.map(value => parseInt(value, 16)));
    const count = record[0]!;
    const address = (record[1]! << 8) | record[2]!;
    const type = record[3]!;
    if (record.length !== count + 5 || record.reduce((sum, value) => sum + value, 0) % 256 !== 0) {
      throw new Error('Intel HEX 체크섬이 잘못되었습니다.');
    }
    if (reachedEnd) throw new Error('EOF 뒤에 데이터가 있습니다.');

    if (type === 0) {
      const offset = baseAddress + address;
      if (offset + count > flashBytes.length) {
        throw new Error('프로그램이 32 KB 플래시를 초과합니다.');
      }
      flashBytes.set(record.subarray(4, 4 + count), offset);
    } else if (type === 1) {
      reachedEnd = true;
    } else if (type === 2 || type === 4) {
      if (count !== 2) {
        throw new Error(type === 2 ? '잘못된 세그먼트 주소입니다.' : '잘못된 확장 주소입니다.');
      }
      const upper = (record[4]! << 8) | record[5]!;
      baseAddress = upper << (type === 2 ? 4 : 16);
    } else if (type !== 3 && type !== 5) {
      throw new Error('지원하지 않는 Intel HEX 레코드입니다.');
    }
  }

  if (!reachedEnd) throw new Error('Intel HEX EOF가 없습니다.');
  return new Uint16Array(flashBytes.buffer);
}

export function wordsToHex(words: number[]): string {
  const bytes = words.flatMap(word => [word & 255, (word >> 8) & 255]);
  const record = (address: number, type: number, data: number[]): string => {
    const body = [data.length, address >> 8, address & 255, type, ...data];
    const checksum = -body.reduce((sum, byte) => sum + byte, 0) & 255;
    return ':' + [...body, checksum]
      .map(byte => byte.toString(16).padStart(2, '0').toUpperCase())
      .join('');
  };
  return [record(0, 0, bytes), record(0, 1, [])].join('\n');
}
