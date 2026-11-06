/** Intel HEX loader for the ATmega328P 32 KiB flash. Unwritten bytes remain 0xff. */
export function loadIntelHex(hex: string): Uint16Array {
 const bytes = new Uint8Array(32768).fill(0xff);
 let base = 0, eof = false;
 for (const raw of hex.trim().split(/\r?\n/)) {
  const line = raw.trim(); if (!line) continue;
  if (!/^:[0-9a-fA-F]+$/.test(line) || (line.length - 1) % 2) throw new Error('Intel HEX 형식이 잘못되었습니다.');
  const record = Uint8Array.from(line.slice(1).match(/../g)!.map(v => parseInt(v,16)));
  const count = record[0]!, addr = (record[1]! << 8) | record[2]!, type = record[3]!;
  if (record.length !== count + 5 || record.reduce((s,v)=>s+v,0)%256 !== 0) throw new Error('Intel HEX 체크섬이 잘못되었습니다.');
  if (eof) throw new Error('EOF 뒤에 데이터가 있습니다.');
  if (type === 0) { const offset = base + addr; if (offset + count > bytes.length) throw new Error('프로그램이 32 KB 플래시를 초과합니다.'); bytes.set(record.subarray(4,4+count), offset); }
  else if (type === 1) eof = true;
  else if (type === 2) { if (count !== 2) throw new Error('잘못된 세그먼트 주소입니다.'); base = ((record[4]! << 8) | record[5]!) << 4; }
  else if (type === 4) { if (count !== 2) throw new Error('잘못된 확장 주소입니다.'); base = ((record[4]! << 8) | record[5]!) << 16; }
  else if (type !== 3 && type !== 5) throw new Error('지원하지 않는 Intel HEX 레코드입니다.');
 }
 if (!eof) throw new Error('Intel HEX EOF가 없습니다.');
 return new Uint16Array(bytes.buffer);
}
export function wordsToHex(words: number[]): string {
 const bytes = words.flatMap(w => [w & 255, (w >> 8) & 255]);
 const rec = (addr:number,type:number,data:number[]) => { const body=[data.length,addr>>8,addr&255,type,...data]; return ':' + [...body, (-body.reduce((a,b)=>a+b,0))&255].map(x=>x.toString(16).padStart(2,'0').toUpperCase()).join(''); };
 return [rec(0,0,bytes),rec(0,1,[])].join('\n');
}
