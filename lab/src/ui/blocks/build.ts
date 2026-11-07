// Tiny builder for Blockly workspace JSON: used by the starter programs and the tests.
export interface N {
  type: string;
  fields?: Record<string, unknown>;
  /** value inputs: a block, or a number / text for a literal */
  in?: Record<string, N | number | string>;
  /** statement inputs: a stack of blocks */
  do?: Record<string, N[]>;
  extra?: Record<string, unknown>;
}
type J = Record<string, unknown>;

export function workspace(tops: N[], variables: string[] = []) {
  const vars = new Set(variables);
  const conv = (n: N): J => {
    const o: J = { type: n.type };
    if (n.fields) {
      o.fields = Object.fromEntries(Object.entries(n.fields).map(([k, v]) => {
        if (k === 'VAR' && typeof v === 'string') { vars.add(v); return [k, { id: `id_${v}` }]; }
        return [k, v];
      }));
    }
    if (n.extra) o.extraState = n.extra;
    const inputs: Record<string, J> = {};
    for (const [k, v] of Object.entries(n.in ?? {})) {
      inputs[k] = { block: typeof v === 'number' ? { type: 'math_number', fields: { NUM: v } } : typeof v === 'string' ? { type: 'text', fields: { TEXT: v } } : conv(v) };
    }
    for (const [k, stack] of Object.entries(n.do ?? {})) if (stack.length) inputs[k] = { block: chain(stack) };
    if (Object.keys(inputs).length) o.inputs = inputs;
    return o;
  };
  const chain = (stack: N[]): J => {
    const blocks = stack.map(conv);
    for (let i = blocks.length - 2; i >= 0; i--) blocks[i]!.next = { block: blocks[i + 1] };
    return blocks[0]!;
  };
  const top = tops.map(conv);
  return { blocks: { languageVersion: 0, blocks: top }, variables: [...vars].map((name) => ({ name, id: `id_${name}` })) };
}
