import { resolve, basename } from 'node:path';

export const MAX_DEBUG_OUTPUT = 4 * 1024 * 1024;
export const MAX_DEBUG_LINES = 4096;
export const MAX_DEBUG_GLOBALS = 128;
// ELF data VMA is biased by 0x800000. CPU data[0x100] is the first SRAM
// byte; subtracting 0x800100 would incorrectly point at the register file.
const DATA_BASE = 0x800000;
const number = value => /^(?:0x[\da-f]+|\d+)(?:\s|$)/i.test(value || '') ? Number(value.match(/^(?:0x[\da-f]+|\d+)/i)[0]) : NaN;
const ref = value => Number.parseInt(value?.match(/^<0x([\da-f]+)>/i)?.[1] || '', 16);
const string = value => (value || '').replace(/^\(indirect string, offset: (?:0x)?[\da-f]+\):\s*/i, '').trim();
const safeName = value => /^[A-Za-z_][A-Za-z_0-9]{0,95}$/.test(value);
const safeType = value => value.length <= 160 && /^[A-Za-z_][A-Za-z_0-9 :*\[\]]*$/.test(value);

/** Parse GNU AVR readelf's DWARF 2/4 dump (the pinned GCC 7 toolchain).
 * Paths stay internal. Unknown locations/types are omitted, never guessed.
 */
export function parseDebugInfo(output, { sketchPath, sketchLines }) {
  if (Buffer.byteLength(output) > MAX_DEBUG_OUTPUT) throw new Error('debug output limit');
  const rows = output.split(/\r?\n/), dies = new Map(), tables = new Map();
  let current, cu, stack = [], table, mode = '';
  for (const row of rows) {
    const die = row.match(/^\s*<(\d+)><([\da-f]+)>:.*?Abbrev Number:\s*\d+(?:\s+\((DW_TAG_\w+)\))?/i);
    if (die) {
      const depth = Number(die[1]);
      stack.length = depth;
      current = undefined;
      if (!die[3]) continue;
      current = { tag: die[3], attrs: {}, children: [], parent: stack[depth - 1], cu };
      if (depth === 0) { cu = current; current.cu = current; }
      current.parent?.children.push(current);
      stack.push(current);
      dies.set(Number.parseInt(die[2], 16), current);
      continue;
    }
    const attr = row.match(/^\s*<[\da-f]+>\s+DW_AT_(\w+)\s*:\s*(.*)$/i);
    if (attr && current) { current.attrs[attr[1]] = attr[2]; continue; }
    const offset = row.match(/^\s*Offset:\s*(0x[\da-f]+|\d+)\s*$/i);
    if (offset) { table = { dirs: new Map(), files: new Map() }; tables.set(Number(offset[1]), table); mode = ''; }
    if (/The Directory Table/.test(row)) mode = 'dirs';
    else if (/The File Name Table/.test(row)) mode = 'files';
    else if (/Line Number Statements|Decoded dump/.test(row)) mode = '';
    else if (table && mode === 'dirs') {
      const dir = row.match(/^\s*(\d+)\s+(.+?)\s*$/);
      if (dir) table.dirs.set(Number(dir[1]), dir[2]);
    } else if (table && mode === 'files') {
      const file = row.match(/^\s*(\d+)\s+(\d+)\s+\d+\s+\d+\s+(.+?)\s*$/);
      if (file) table.files.set(Number(file[1]), { dir: Number(file[2]), name: file[3] });
    }
  }
  const wanted = resolve(sketchPath);
  const validLine = line => Number.isInteger(line) && line >= 1 && line <= sketchLines;
  const lines = new Map();
  let decoded = false, filePath = '';
  for (const row of rows) {
    if (/Decoded dump of debug contents of section \.debug_line:|Contents of the \.debug_line section:/.test(row)) { decoded = true; continue; }
    if (!decoded) continue;
    const heading = row.match(/^(?:CU:\s*)?(.+):\s*$/);
    if (heading) { filePath = heading[1].trim(); continue; }
    const entry = row.match(/^\s*(\S+)\s+(\d+)\s+(0x[\da-f]+)(?:\s|$)/i);
    if (!entry || !filePath || resolve(filePath) !== wanted || entry[1] !== basename(wanted)) continue;
    const line = Number(entry[2]), addr = Number(entry[3]);
    if (validLine(line) && addr >= 0 && addr < 32768 && addr % 2 === 0 && lines.size < MAX_DEBUG_LINES) lines.set(addr, line);
  }
  // Attribute ownership matters: an abstract_origin/specification can live in
  // another CU whose DW_AT_decl_file uses a different line table.
  function attribute(node, key, seen = new Set()) {
    if (!node || seen.has(node) || seen.size > 32) return undefined;
    seen.add(node);
    if (node.attrs[key] !== undefined) return { value: node.attrs[key], owner: node };
    return attribute(dies.get(ref(node.attrs.abstract_origin)), key, seen)
      || attribute(dies.get(ref(node.attrs.specification)), key, seen);
  }
  function sourcePath(owner, index) {
    const unit = owner.cu;
    const files = tables.get(number(unit?.attrs.stmt_list));
    const file = files?.files.get(index);
    if (!file) return '';
    return resolve(string(unit.attrs.comp_dir) || '.', files.dirs.get(file.dir) || '.', file.name);
  }
  function globalScope(node) {
    for (let parent = node?.parent; parent; parent = parent.parent) {
      if (!['DW_TAG_compile_unit', 'DW_TAG_namespace'].includes(parent.tag)) return false;
    }
    return true;
  }
  function typeInfo(node, seen = new Set()) {
    if (!node || seen.has(node) || seen.size > 24) return undefined;
    seen = new Set(seen).add(node);
    const name = string(node.attrs.name), size = number(node.attrs.byte_size);
    const inner = () => typeInfo(dies.get(ref(node.attrs.type)), seen);
    switch (node.tag) {
      case 'DW_TAG_base_type':
      case 'DW_TAG_enumeration_type':
      case 'DW_TAG_structure_type':
      case 'DW_TAG_union_type':
      case 'DW_TAG_class_type': return safeType(name) && size > 0 ? { type: name, size } : undefined;
      case 'DW_TAG_pointer_type': {
        const target = inner();
        if (node.attrs.type !== undefined && (!target || target.array)) return undefined;
        return size > 0 ? { type: `${target?.type || 'void'} *`, size, pointer: true } : undefined;
      }
      case 'DW_TAG_typedef': {
        const target = inner();
        return target && safeName(name) ? { type: name, size: target.size } : undefined;
      }
      case 'DW_TAG_const_type':
      case 'DW_TAG_volatile_type':
      case 'DW_TAG_restrict_type': {
        const target = inner(), qualifier = node.tag.slice(7, -5);
        if (!target) return undefined;
        const type = target.pointer ? `${target.type} ${qualifier}`
          : target.type.startsWith(`${qualifier} `) ? target.type : `${qualifier} ${target.type}`;
        return { ...target, type };
      }
      case 'DW_TAG_array_type': {
        const target = inner();
        if (!target) return undefined;
        let count = 1, suffix = '';
        for (const range of node.children.filter(n => n.tag === 'DW_TAG_subrange_type')) {
          const length = range.attrs.count !== undefined ? number(range.attrs.count) : number(range.attrs.upper_bound) - (number(range.attrs.lower_bound) || 0) + 1;
          if (!Number.isSafeInteger(length) || length < 1 || length > 2048) return undefined;
          count *= length; suffix += `[${length}]`;
        }
        return suffix ? { type: target.type + suffix, size: target.size * count, array: true } : undefined;
      }
      default: return undefined;
    }
  }
  const globals = [], names = new Set();
  for (const node of dies.values()) {
    if (node.tag !== 'DW_TAG_variable' || !globalScope(node)) continue;
    const declared = attribute(node, 'decl_file');
    if (!declared || !globalScope(declared.owner) || sourcePath(declared.owner, number(declared.value)) !== wanted) continue;
    if (!validLine(number(attribute(node, 'decl_line')?.value))) continue;
    const name = string(attribute(node, 'name')?.value);
    // Only an absolute single-address location is safe for a live SRAM watch.
    const location = attribute(node, 'location')?.value.match(/\(DW_OP_addr: (?:0x)?([\da-f]+)\)\s*$/i);
    if (!safeName(name) || !location || names.has(name)) continue;
    const addr = Number.parseInt(location[1], 16) - DATA_BASE;
    const type = typeInfo(dies.get(ref(attribute(node, 'type')?.value)));
    if (!type || !safeType(type.type) || !Number.isInteger(type.size) || type.size < 1 || addr < 0x100 || addr + type.size > 0x900) continue;
    globals.push({ name, addr, size: type.size, type: type.type }); names.add(name);
    if (globals.length === MAX_DEBUG_GLOBALS) break;
  }
  return { lines: [...lines].sort(([a], [b]) => a - b).map(([addr, line]) => ({ addr, line })), globals };
}
