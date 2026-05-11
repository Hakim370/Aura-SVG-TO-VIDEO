interface WebMChunk {
  buf: Uint8Array;
  ts: number;
  type: string;
}

export function buildWebM(chunks: WebMChunk[], W: number, H: number, fps: number, codecId: string): Uint8Array {
  function wv(n: number): Uint8Array {
    if (n < 0x80) return new Uint8Array([n | 0x80]);
    if (n < 0x4000) return new Uint8Array([(n >> 8) | 0x40, n & 0xff]);
    if (n < 0x200000) return new Uint8Array([(n >> 16) | 0x20, (n >> 8) & 0xff, n & 0xff]);
    return new Uint8Array([(n >> 24) | 0x10, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff]);
  }

  function wu(n: number, sz: number = 4): Uint8Array {
    const a = new Uint8Array(sz);
    for (let i = sz - 1; i >= 0; i--) {
      a[i] = n & 0xff;
      n >>= 8;
    }
    return a;
  }

  function wf(n: number): Uint8Array {
    const b = new ArrayBuffer(8);
    new DataView(b).setFloat64(0, n, false);
    return new Uint8Array(b);
  }

  function cc(...arrays: Uint8Array[]): Uint8Array {
    const t = arrays.reduce((s, b) => s + b.length, 0);
    const o = new Uint8Array(t);
    let x = 0;
    for (const a of arrays) {
      o.set(a, x);
      x += a.length;
    }
    return o;
  }

  function eb(id: number, data: Uint8Array): Uint8Array {
    let ib: Uint8Array;
    if (id > 0xffffff) ib = wu(id, 4);
    else if (id > 0xffff) ib = wu(id, 3);
    else if (id > 0xff) ib = wu(id, 2);
    else ib = wu(id, 1);
    return cc(ib, wv(data.length), data);
  }

  const tenc = new TextEncoder();
  const hdr = eb(0x1A45DFA3, cc(
    eb(0x4286, new Uint8Array([1])),
    eb(0x42F7, new Uint8Array([1])),
    eb(0x42F2, new Uint8Array([4])),
    eb(0x42F3, new Uint8Array([8])),
    eb(0x4282, tenc.encode('webm')),
    eb(0x4287, new Uint8Array([2])),
    eb(0x4285, new Uint8Array([2]))
  ));

  const durMs = chunks.length > 0 ? (chunks[chunks.length - 1].ts / 1000 + 1000 / fps) : 6000;
  const info = eb(0x1549A966, cc(
    eb(0x2AD7B1, wu(1000000, 4)),
    eb(0x4489, wf(durMs)),
    eb(0x4D80, tenc.encode('VECTRA')),
    eb(0x5741, tenc.encode('VECTRA'))
  ));

  const track = eb(0xAE, cc(
    eb(0xD7, new Uint8Array([1])),
    eb(0x73C5, wu(1, 4)),
    eb(0x83, new Uint8Array([1])),
    eb(0x86, tenc.encode(codecId)),
    eb(0x23E383, wu(Math.round(1e9 / fps), 4)),
    eb(0xE0, cc(
      eb(0xB0, wu(W, 2)),
      eb(0xBA, wu(H, 2)),
      eb(0x54B0, wu(W, 2)),
      eb(0x54BA, wu(H, 2))
    ))
  ));
  const tracks = eb(0x1654AE6B, track);

  const cls: Uint8Array[] = [];
  let cs = 0;
  let cf: WebMChunk[] = [];

  function fc() {
    if (!cf.length) return;
    const bs = cf.map(c => {
      const r = Math.round(c.ts / 1000) - cs;
      const fl = c.type === 'key' ? 0x80 : 0x00;
      const tb = new Uint8Array(2);
      new DataView(tb.buffer).setInt16(0, r, false);
      return eb(0xA3, cc(new Uint8Array([0x81]), tb, new Uint8Array([fl]), c.buf));
    });
    const blockGroup = cc(eb(0xE7, wu(cs, 4)), ...bs);
    cls.push(eb(0x1F43B675, blockGroup));
    cf = [];
  }

  for (const c of chunks) {
    const tm = c.ts / 1000;
    if (tm - cs >= 5000) {
      fc();
      cs = Math.floor(tm / 5000) * 5000;
    }
    cf.push(c);
  }
  fc();

  return cc(hdr, eb(0x18538067, cc(info, tracks, ...cls)));
}
