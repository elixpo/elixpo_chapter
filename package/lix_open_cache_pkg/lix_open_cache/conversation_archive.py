import json
import os
import struct
import time
import threading
from typing import Dict, List, Optional, Any

from loguru import logger
from lix_open_cache.huffman_codec import HuffmanCodec

_MAGIC = b"CAv1"
_HEADER_SIZE = 4 + 8 + 8 + 4  # magic + created + updated + num_turns


class ConversationArchive:

    def __init__(self, archive_dir: str, session_ttl_days: int = 30):
        self.archive_dir = archive_dir
        self.session_ttl_days = session_ttl_days
        self._locks: Dict[str, threading.RLock] = {}
        self._meta_lock = threading.Lock()
        os.makedirs(archive_dir, exist_ok=True)
        logger.info(f"[ConversationArchive] dir={archive_dir}, ttl={session_ttl_days}d")

    def _path(self, session_id: str) -> str:
        return os.path.join(self.archive_dir, f"{session_id}.huff")

    def _get_lock(self, session_id: str) -> threading.RLock:
        with self._meta_lock:
            if session_id not in self._locks:
                self._locks[session_id] = threading.RLock()
            return self._locks[session_id]

    def append_turn(self, session_id: str, turn: Dict[str, Any]) -> bool:
        with self._get_lock(session_id):
            try:
                path = self._path(session_id)
                existing = self._read_raw(path)
                now = time.time()
                if existing is None:
                    turns = [turn]
                    created_at = now
                else:
                    turns, created_at, _ = existing
                    turns.append(turn)
                self._write_raw(path, turns, created_at, now)
                logger.debug(f"[ConversationArchive] session={session_id} appended turn #{len(turns)}")
                return True
            except Exception as e:
                logger.error(f"[ConversationArchive] session={session_id} append_turn failed: {e}")
                return False

    def append_turns(self, session_id: str, turns: List[Dict[str, Any]]) -> bool:
        with self._get_lock(session_id):
            try:
                path = self._path(session_id)
                existing = self._read_raw(path)
                now = time.time()
                if existing is None:
                    all_turns = list(turns)
                    created_at = now
                else:
                    existing_turns, created_at, _ = existing
                    all_turns = existing_turns + list(turns)
                self._write_raw(path, all_turns, created_at, now)
                logger.debug(f"[ConversationArchive] session={session_id} batch-appended {len(turns)} turns (total={len(all_turns)})")
                return True
            except Exception as e:
                logger.error(f"[ConversationArchive] session={session_id} append_turns failed: {e}")
                return False

    def load_all(self, session_id: str) -> Optional[List[Dict[str, Any]]]:
        with self._get_lock(session_id):
            try:
                result = self._read_raw(self._path(session_id))
                if result is None:
                    return None
                turns, _, _ = result
                return turns
            except Exception as e:
                logger.error(f"[ConversationArchive] session={session_id} load_all failed: {e}")
                return None

    def load_recent(self, session_id: str, n: int) -> List[Dict[str, Any]]:
        all_turns = self.load_all(session_id)
        if all_turns is None:
            return []
        return all_turns[-n:]

    def search_by_text(self, session_id: str, query: str, top_k: int = 5) -> List[Dict[str, Any]]:
        all_turns = self.load_all(session_id)
        if not all_turns:
            return []
        import re as _re
        _tok = lambda s: set(_re.split(r'\W+', s.lower()))
        query_tokens = _tok(query) - {""}
        scored = []
        for turn in all_turns:
            content = turn.get("content", "") or ""
            turn_tokens = _tok(content) - {""}
            overlap = len(query_tokens & turn_tokens)
            if overlap > 0:
                scored.append((overlap, turn))
        scored.sort(key=lambda x: x[0], reverse=True)
        return [t for _, t in scored[:top_k]]

    def search_by_embedding(self, session_id: str, query_embedding, top_k: int = 5) -> List[Dict[str, Any]]:
        try:
            import numpy as np
            all_turns = self.load_all(session_id)
            if not all_turns:
                return []
            q = np.array(query_embedding, dtype=np.float32)
            q_norm = q / (np.linalg.norm(q) + 1e-8)
            scored = []
            for turn in all_turns:
                emb = turn.get("embedding")
                if emb is None:
                    continue
                t = np.array(emb, dtype=np.float32)
                t_norm = t / (np.linalg.norm(t) + 1e-8)
                sim = float(np.dot(q_norm, t_norm))
                scored.append((sim, turn))
            scored.sort(key=lambda x: x[0], reverse=True)
            return [t for _, t in scored[:top_k]]
        except Exception as e:
            logger.warning(f"[ConversationArchive] session={session_id} embedding search failed: {e}")
            return []

    def delete_session(self, session_id: str) -> bool:
        with self._get_lock(session_id):
            path = self._path(session_id)
            if os.path.exists(path):
                try:
                    os.remove(path)
                    logger.info(f"[ConversationArchive] session={session_id} deleted")
                    return True
                except Exception as e:
                    logger.error(f"[ConversationArchive] session={session_id} delete failed: {e}")
            return False

    def session_exists(self, session_id: str) -> bool:
        return os.path.exists(self._path(session_id))

    def get_metadata(self, session_id: str) -> Optional[Dict[str, Any]]:
        path = self._path(session_id)
        if not os.path.exists(path):
            return None
        try:
            with open(path, "rb") as f:
                header = f.read(_HEADER_SIZE)
            if len(header) < _HEADER_SIZE:
                return None
            magic = header[:4]
            if magic != _MAGIC:
                return None
            created_at = struct.unpack_from("<d", header, 4)[0]
            updated_at = struct.unpack_from("<d", header, 12)[0]
            num_turns = struct.unpack_from("<I", header, 20)[0]
            size_bytes = os.path.getsize(path)
            return {
                "session_id": session_id,
                "created_at": created_at,
                "updated_at": updated_at,
                "num_turns": num_turns,
                "size_bytes": size_bytes,
            }
        except Exception:
            return None

    def cleanup_expired(self) -> int:
        cutoff = time.time() - self.session_ttl_days * 86400
        removed = 0
        try:
            for fname in os.listdir(self.archive_dir):
                if not fname.endswith(".huff"):
                    continue
                session_id = fname[:-5]
                try:
                    meta = self.get_metadata(session_id)
                    if meta and meta["updated_at"] < cutoff:
                        os.remove(os.path.join(self.archive_dir, fname))
                        removed += 1
                        logger.info(f"[ConversationArchive] TTL-expired session={session_id} removed")
                except Exception as e:
                    logger.warning(f"[ConversationArchive] cleanup error for {fname}: {e}")
        except Exception as e:
            logger.error(f"[ConversationArchive] cleanup_expired error: {e}")
        logger.info(f"[ConversationArchive] Cleanup complete: removed {removed} sessions")
        return removed

    def list_sessions(self) -> List[Dict[str, Any]]:
        result = []
        try:
            for fname in os.listdir(self.archive_dir):
                if not fname.endswith(".huff"):
                    continue
                session_id = fname[:-5]
                meta = self.get_metadata(session_id)
                if meta:
                    result.append(meta)
        except Exception as e:
            logger.error(f"[ConversationArchive] list_sessions error: {e}")
        return result

    def _write_raw(self, path: str, turns: List[Dict[str, Any]], created_at: float, updated_at: float) -> None:
        payload_json = json.dumps(turns, ensure_ascii=False, separators=(",", ":"))
        compressed = HuffmanCodec.encode(payload_json.encode("utf-8"))
        with open(path, "wb") as f:
            f.write(_MAGIC)
            f.write(struct.pack("<d", created_at))
            f.write(struct.pack("<d", updated_at))
            f.write(struct.pack("<I", len(turns)))
            f.write(compressed)

    def _read_raw(self, path: str) -> Optional[tuple]:
        if not os.path.exists(path):
            return None
        try:
            with open(path, "rb") as f:
                raw = f.read()
            if len(raw) < _HEADER_SIZE:
                return None
            magic = raw[:4]
            if magic != _MAGIC:
                logger.warning(f"[ConversationArchive] Bad magic in {path}")
                return None
            created_at = struct.unpack_from("<d", raw, 4)[0]
            updated_at = struct.unpack_from("<d", raw, 12)[0]
            compressed = raw[_HEADER_SIZE:]
            payload_bytes = HuffmanCodec.decode(compressed)
            turns = json.loads(payload_bytes.decode("utf-8"))
            return (turns, created_at, updated_at)
        except Exception as e:
            logger.error(f"[ConversationArchive] _read_raw failed for {path}: {e}")
            return None
