import heapq
import struct
from typing import Dict, List, Optional, Tuple


class _HNode:
    __slots__ = ("freq", "sym", "left", "right")

    def __init__(self, freq: int, sym: Optional[int], left=None, right=None):
        self.freq = freq
        self.sym = sym
        self.left = left
        self.right = right

    def __lt__(self, other: "_HNode") -> bool:
        return self.freq < other.freq


def _build_lengths(data: bytes) -> Dict[int, int]:
    freq: Dict[int, int] = {}
    for b in data:
        freq[b] = freq.get(b, 0) + 1
    if not freq:
        return {}
    heap: List[_HNode] = [_HNode(f, s) for s, f in freq.items()]
    heapq.heapify(heap)
    if len(heap) == 1:
        return {heap[0].sym: 1}
    while len(heap) > 1:
        a = heapq.heappop(heap)
        b = heapq.heappop(heap)
        heapq.heappush(heap, _HNode(a.freq + b.freq, None, a, b))
    root = heap[0]
    lengths: Dict[int, int] = {}

    def _walk(node: _HNode, depth: int) -> None:
        if node.sym is not None:
            lengths[node.sym] = depth
        else:
            if node.left:
                _walk(node.left, depth + 1)
            if node.right:
                _walk(node.right, depth + 1)

    _walk(root, 0)
    return lengths


def _canonical_codes(lengths: Dict[int, int]) -> Dict[int, Tuple[int, int]]:
    sorted_syms: List[Tuple[int, int]] = sorted(lengths.items(), key=lambda x: (x[1], x[0]))
    codes: Dict[int, Tuple[int, int]] = {}
    canon = 0
    prev_len = 0
    for sym, length in sorted_syms:
        if length > prev_len:
            canon <<= (length - prev_len)
            prev_len = length
        codes[sym] = (canon, length)
        canon += 1
    return codes


MAGIC = b"HCv1"


class HuffmanCodec:

    @staticmethod
    def encode(data: bytes) -> bytes:
        if not data:
            return MAGIC + struct.pack("<I", 0) + b"\x00\x00"
        lengths = _build_lengths(data)
        if not lengths:
            return MAGIC + struct.pack("<I", 0) + b"\x00\x00"
        codes = _canonical_codes(lengths)

        out_bytes = bytearray()
        bit_buf = 0
        bit_len = 0
        for b in data:
            code, length = codes[b]
            bit_buf = (bit_buf << length) | code
            bit_len += length
            while bit_len >= 8:
                bit_len -= 8
                out_bytes.append((bit_buf >> bit_len) & 0xFF)
        padding = 0
        if bit_len > 0:
            padding = 8 - bit_len
            out_bytes.append((bit_buf << padding) & 0xFF)

        sorted_syms = sorted(lengths.items(), key=lambda x: (x[1], x[0]))
        num_symbols = len(sorted_syms)
        header = bytearray()
        header += MAGIC
        header += struct.pack("<I", len(data))
        header += struct.pack("<H", num_symbols)
        for sym, length in sorted_syms:
            header += bytes([sym, length])
        header += struct.pack("<I", padding)
        return bytes(header) + bytes(out_bytes)

    @staticmethod
    def decode(data: bytes) -> bytes:
        if not data:
            return b""
        offset = 0
        magic = data[offset:offset + 4]; offset += 4
        if magic != MAGIC:
            raise ValueError(f"Invalid Huffman magic: {magic!r}")
        orig_len = struct.unpack_from("<I", data, offset)[0]; offset += 4
        if orig_len == 0:
            return b""
        num_symbols = struct.unpack_from("<H", data, offset)[0]; offset += 2

        sym_lengths: List[Tuple[int, int]] = []
        for _ in range(num_symbols):
            sym = data[offset]
            length = data[offset + 1]
            sym_lengths.append((sym, length))
            offset += 2

        padding = struct.unpack_from("<I", data, offset)[0]; offset += 4
        compressed = data[offset:]

        decode_table: Dict[Tuple[int, int], int] = {}
        canon = 0
        prev_len = 0
        for sym, length in sym_lengths:
            if length > prev_len:
                canon <<= (length - prev_len)
                prev_len = length
            decode_table[(canon, length)] = sym
            canon += 1

        result = bytearray()
        total_bits = len(compressed) * 8 - padding
        byte_idx = 0
        bit_in_byte = 7
        code_acc = 0
        code_len = 0

        for _ in range(total_bits):
            bit = (compressed[byte_idx] >> bit_in_byte) & 1
            code_acc = (code_acc << 1) | bit
            code_len += 1
            bit_in_byte -= 1
            if bit_in_byte < 0:
                bit_in_byte = 7
                byte_idx += 1
            key = (code_acc, code_len)
            if key in decode_table:
                result.append(decode_table[key])
                code_acc = 0
                code_len = 0
                if len(result) >= orig_len:
                    break
        return bytes(result)


def encode_str(text: str) -> bytes:
    return HuffmanCodec.encode(text.encode("utf-8"))


def decode_bytes(data: bytes) -> str:
    return HuffmanCodec.decode(data).decode("utf-8")
