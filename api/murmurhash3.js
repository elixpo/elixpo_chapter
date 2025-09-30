
function murmurhash3_32_gc(key, seed) {
  var remainder, bytes, h1, h1b, c1, c1b, c2, c2b, k1, i;

  remainder = key.length & 3; // key.length % 4
  bytes = key.length - remainder;
  h1 = seed;
  c1 = 0xcc9e2d51;
  c2 = 0x1b873593;
  i = 0;

  while (i < bytes) {
    k1 = ((key.charCodeAt(i) & 0xff)) | ((key.charCodeAt(++i) & 0xff) << 8) | ((key.charCodeAt(++i) & 0xff) << 16) | ((key.charCodeAt(++i) & 0xff) << 24);
    ++i;

    k1 = ((((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16))) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = ((((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16))) & 0xffffffff;

    h1 ^= k1;
    h1 = (h1 << 13) | (h1 >>> 19);
    h1b = ((((h1 & 0xffff) * 5) + ((((h1 >>> 16) * 5) & 0xffff) << 16))) & 0xffffffff;
    h1 = (((h1b & 0xffff) + 0x6b64) + ((((h1b >>> 16) + 0xe654) & 0xffff) << 16));
  }

  k1 = 0;

  switch (remainder) {
  case 3:
    k1 ^= (key.charCodeAt(i + 2) & 0xff) << 16;
  case 2:
    k1 ^= (key.charCodeAt(i + 1) & 0xff) << 8;
  case 1:
    k1 ^= (key.charCodeAt(i) & 0xff);

    k1 = (((k1 & 0xffff) * c1) + ((((k1 >>> 16) * c1) & 0xffff) << 16)) & 0xffffffff;
    k1 = (k1 << 15) | (k1 >>> 17);
    k1 = (((k1 & 0xffff) * c2) + ((((k1 >>> 16) * c2) & 0xffff) << 16)) & 0xffffffff;
    h1 ^= k1;
  }

  h1 ^= key.length;

  h1 ^= h1 >>> 16;
  h1 = (((h1 & 0xffff) * 0x85ebca6b) + ((((h1 >>> 16) * 0x85ebca6b) & 0xffff) << 16)) & 0xffffffff;
  h1 ^= h1 >>> 13;
  h1 = ((((h1 & 0xffff) * 0xc2b2ae35) + ((((h1 >>> 16) * 0xc2b2ae35) & 0xffff) << 16))) & 0xffffffff;
  h1 ^= h1 >>> 16;

  return h1 >>> 0;
}

var MurmurHash3 = {
  mul32: function(m, n) {
    var nlo = n & 0xffff;
    var nhi = n - nlo;
    return ((nhi * m | 0) + (nlo * m | 0)) | 0;
  },

  hashBytes: function(data, len, seed) {
    var c1 = 0xcc9e2d51,
        c2 = 0x1b873593;

    var h1 = seed;
    var roundedEnd = len & ~0x3;

    for (var i = 0; i < roundedEnd; i += 4) {
      var k1 = (data.charCodeAt(i) & 0xff) | ((data.charCodeAt(i + 1) & 0xff) << 8) | ((data.charCodeAt(i + 2) & 0xff) << 16) | ((data.charCodeAt(i + 3) & 0xff) << 24);

      k1 = this.mul32(k1, c1);
      k1 = ((k1 & 0x1ffff) << 15) | (k1 >>> 17); // ROTL32(k1,15);
      k1 = this.mul32(k1, c2);

      h1 ^= k1;
      h1 = ((h1 & 0x7ffff) << 13) | (h1 >>> 19); // ROTL32(h1,13);
      h1 = (h1 * 5 + 0xe6546b64) | 0;
    }

    k1 = 0;

    switch (len % 4) {
    case 3:
      k1 = (data.charCodeAt(roundedEnd + 2) & 0xff) << 16;
      // fallthrough
    case 2:
      k1 |= (data.charCodeAt(roundedEnd + 1) & 0xff) << 8;
      // fallthrough
    case 1:
      k1 |= (data.charCodeAt(roundedEnd) & 0xff);
      k1 = this.mul32(k1, c1);
      k1 = ((k1 & 0x1ffff) << 15) | (k1 >>> 17); // ROTL32(k1,15);
      k1 = this.mul32(k1, c2);
      h1 ^= k1;
    }

    // finalization
    h1 ^= len;

    // fmix(h1);
    h1 ^= h1 >>> 16;
    h1 = this.mul32(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = this.mul32(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1;
  },

  hashString: function(data, len, seed) {
    var c1 = 0xcc9e2d51,
        c2 = 0x1b873593;

    var h1 = seed;
    var roundedEnd = len & ~0x1;

    for (var i = 0; i < roundedEnd; i += 2) {
      var k1 = data.charCodeAt(i) | (data.charCodeAt(i + 1) << 16);

      k1 = this.mul32(k1, c1);
      k1 = ((k1 & 0x1ffff) << 15) | (k1 >>> 17); // ROTL32(k1,15);
      k1 = this.mul32(k1, c2);

      h1 ^= k1;
      h1 = ((h1 & 0x7ffff) << 13) | (h1 >>> 19); // ROTL32(h1,13);
      h1 = (h1 * 5 + 0xe6546b64) | 0;
    }

    if ((len % 2) == 1) {
      k1 = data.charCodeAt(roundedEnd);
      k1 = this.mul32(k1, c1);
      k1 = ((k1 & 0x1ffff) << 15) | (k1 >>> 17); // ROTL32(k1,15);
      k1 = this.mul32(k1, c2);
      h1 ^= k1;
    }

    // finalization
    h1 ^= (len << 1);

    // fmix(h1);
    h1 ^= h1 >>> 16;
    h1 = this.mul32(h1, 0x85ebca6b);
    h1 ^= h1 >>> 13;
    h1 = this.mul32(h1, 0xc2b2ae35);
    h1 ^= h1 >>> 16;

    return h1;
  }
};

var SipHash = (function() {
    function _add(a, b) {
        var rl = a.l + b.l,
            a2 = { h: a.h + b.h + (rl / 2 >>> 31) >>> 0,
                   l: rl >>> 0 };
        a.h = a2.h; a.l = a2.l;
    }

    function _xor(a, b) {
        a.h ^= b.h; a.h >>>= 0;
        a.l ^= b.l; a.l >>>= 0;
    }

    function _rotl(a, n) {
        var a2 = {
            h: a.h << n | a.l >>> (32 - n),
            l: a.l << n | a.h >>> (32 - n)
        };
        a.h = a2.h; a.l = a2.l;
    }

    function _rotl32(a) {
        var al = a.l;
        a.l = a.h; a.h = al;
    }

    function _compress(v0, v1, v2, v3) {
        _add(v0, v1);
        _add(v2, v3);
        _rotl(v1, 13);
        _rotl(v3, 16);
        _xor(v1, v0);
        _xor(v3, v2);
        _rotl32(v0);
        _add(v2, v1);
        _add(v0, v3);
        _rotl(v1, 17);
        _rotl(v3, 21);
        _xor(v1, v2);
        _xor(v3, v0);
        _rotl32(v2);
    }

    function _get_int(a, offset) {
        return a.charCodeAt(offset + 3) << 24 |
               a.charCodeAt(offset + 2) << 16 |
               a.charCodeAt(offset + 1) << 8 |
               a.charCodeAt(offset);
    }

    function hash(key, m) {
        var k0 = { h: key[1] >>> 0, l: key[0] >>> 0 },
            k1 = { h: key[3] >>> 0, l: key[2] >>> 0 },
            v0 = { h: k0.h, l: k0.l }, v2 = k0,
            v1 = { h: k1.h, l: k1.l }, v3 = k1,
            mi, mp = 0, ml = m.length, ml7 = ml - 7,
            buf = new Uint8Array(new ArrayBuffer(8));

        _xor(v0, { h: 0x736f6d65, l: 0x70736575 });
        _xor(v1, { h: 0x646f7261, l: 0x6e646f6d });
        _xor(v2, { h: 0x6c796765, l: 0x6e657261 });
        _xor(v3, { h: 0x74656462, l: 0x79746573 });
        while (mp < ml7) {
            mi = { h: _get_int(m, mp + 4), l: _get_int(m, mp) };
            _xor(v3, mi);
            _compress(v0, v1, v2, v3);
            _compress(v0, v1, v2, v3);
            _xor(v0, mi);
            mp += 8;
        }
        buf[7] = ml;
        var ic = 0;
        while (mp < ml) {
            buf[ic++] = m.charCodeAt(mp++);
        }
        while (ic < 7) {
            buf[ic++] = 0;
        }
        mi = { h: buf[7] << 24 | buf[6] << 16 | buf[5] << 8 | buf[4],
               l: buf[3] << 24 | buf[2] << 16 | buf[1] << 8 | buf[0] };
       _xor(v3, mi);
       _compress(v0, v1, v2, v3);
       _compress(v0, v1, v2, v3);
       _xor(v0, mi);
       _xor(v2, { h: 0, l: 0xff });
       _compress(v0, v1, v2, v3);
       _compress(v0, v1, v2, v3);
       _compress(v0, v1, v2, v3);
       _compress(v0, v1, v2, v3);

       var h = v0;
       _xor(h, v1);
       _xor(h, v2);
       _xor(h, v3);

       return h;
    }

    function string16_to_key(a) {
        return [_get_int(a, 0), _get_int(a, 4),
                _get_int(a, 8), _get_int(a, 12)];
    }

    function hash_hex(key, m) {
        var r = hash(key, m);
        return ("0000000" + r.h.toString(16)).substr(-8) +
               ("0000000" + r.l.toString(16)).substr(-8);
    }

    function hash_uint(key, m) {
        var r = hash(key, m);
        return (r.h & 0x1fffff) * 0x100000000 + r.l;
    }

    return {
        string16_to_key: string16_to_key,
        hash: hash,
        hash_hex: hash_hex,
        hash_uint: hash_uint
    };
})();

var module = module || { }, exports = module.exports = SipHash;

var JavaHashCode = function( str ) {
   var hash = 0, len = str.length;

            if( len === 0 ) {
                return hash;
            }

            for( var i = 0; i < len; i++ ) {
                hash = ( (hash << 5) - hash ) + str.charCodeAt( i );
                hash = hash & hash; // Convert to 32bit integer
            }

            return hash + '';
};

var goog_string_hashCode = function(str) {
  var result = 0;
  for (var i = 0; i < str.length; ++i) {
    result = 31 * result + str.charCodeAt(i);
    // Normalize to 4 byte range, 0 ... 2^32.
    result %= 0x100000000;
  }
  return result;
};

// let  hash = murmurhash3_32_gc("hello", 42); 
// console.log("murmurhash3_32_gc", hash);
export { murmurhash3_32_gc };