"""SSRF guard for user-supplied URLs (scrape, map, crawl, extract).

Only http/https URLs without embedded credentials are accepted, and every
address the hostname resolves to must be globally routable. That rejects
private, loopback, link-local (including the 169.254.169.254 metadata
endpoint), multicast, reserved and unspecified addresses. Callers must re-run
the check on every redirect hop and on every browser subrequest.
"""
from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

_BLOCKED_HOSTNAMES = {"localhost", "metadata", "metadata.google.internal"}
_BLOCKED_SUFFIXES = (".localhost", ".local", ".internal")


class UnsafeURLError(ValueError):
    """Raised when a URL is malformed or targets a non-public network."""


def _ip_is_public(address: str) -> bool:
    ip = ipaddress.ip_address(address.split("%", 1)[0])
    if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped is not None:
        ip = ip.ipv4_mapped
    return ip.is_global and not ip.is_multicast


def resolve_host(hostname: str, port: int) -> set[str]:
    try:
        return {item[4][0] for item in socket.getaddrinfo(hostname, port, type=socket.SOCK_STREAM)}
    except (socket.gaierror, UnicodeError) as exc:
        raise UnsafeURLError(f"Hostname could not be resolved: {hostname}") from exc


def check_public_url(url: str, *, resolve_dns: bool = True, max_chars: int = 2048) -> str:
    """Return the normalized URL or raise UnsafeURLError."""
    if not isinstance(url, str) or not url.strip():
        raise UnsafeURLError("URL must be a non-empty string")
    candidate = url.strip()
    if len(candidate) > max_chars:
        raise UnsafeURLError(f"URL exceeds {max_chars} characters")
    parsed = urlparse(candidate)
    if parsed.scheme.lower() not in ("http", "https"):
        raise UnsafeURLError("Only http and https URLs are allowed")
    if parsed.username or parsed.password:
        raise UnsafeURLError("URLs with embedded credentials are not allowed")
    hostname = (parsed.hostname or "").rstrip(".").lower()
    if not hostname:
        raise UnsafeURLError("URL has no hostname")
    if hostname in _BLOCKED_HOSTNAMES or hostname.endswith(_BLOCKED_SUFFIXES):
        raise UnsafeURLError("Local hostnames are not allowed")
    try:
        port = parsed.port or (443 if parsed.scheme.lower() == "https" else 80)
    except ValueError as exc:
        raise UnsafeURLError("URL has an invalid port") from exc

    literal = None
    try:
        literal = ipaddress.ip_address(hostname.strip("[]"))
    except ValueError:
        pass
    if literal is not None:
        if not _ip_is_public(str(literal)):
            raise UnsafeURLError("URL targets a private or non-routable address")
    elif resolve_dns:
        addresses = resolve_host(hostname, port)
        if not addresses:
            raise UnsafeURLError("Hostname resolved to no addresses")
        if not all(_ip_is_public(address) for address in addresses):
            raise UnsafeURLError("URL resolves to a private or non-routable address")
    return candidate


def connect_public(host: str, port: int, timeout=None, source_address=None, socket_options=None):
    """Resolve ``host`` and connect only to addresses that pass the public-IP check.

    Validating at connect time closes the DNS-rebinding window between
    ``check_public_url`` and the actual TCP connection.
    """
    from urllib3.util.connection import create_connection

    addresses = resolve_host(host.strip("[]"), port)
    if not addresses or not all(_ip_is_public(address) for address in addresses):
        raise UnsafeURLError("URL resolves to a private or non-routable address")
    last_error = None
    for address in addresses:
        try:
            return create_connection((address, port), timeout=timeout,
                                     source_address=source_address, socket_options=socket_options)
        except OSError as exc:
            last_error = exc
    raise last_error


def guarded_session():
    """requests.Session whose connections are pinned to validated public addresses."""
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.connection import HTTPConnection, HTTPSConnection
    from urllib3.connectionpool import HTTPConnectionPool, HTTPSConnectionPool

    class _GuardedHTTPConnection(HTTPConnection):
        def _new_conn(self):
            return connect_public(self._dns_host, self.port, self.timeout,
                                  self.source_address, self.socket_options)

    class _GuardedHTTPSConnection(HTTPSConnection):
        def _new_conn(self):
            return connect_public(self._dns_host, self.port, self.timeout,
                                  self.source_address, self.socket_options)

    class _GuardedHTTPPool(HTTPConnectionPool):
        ConnectionCls = _GuardedHTTPConnection

    class _GuardedHTTPSPool(HTTPSConnectionPool):
        ConnectionCls = _GuardedHTTPSConnection

    class _GuardedAdapter(HTTPAdapter):
        def init_poolmanager(self, *args, **kwargs):
            super().init_poolmanager(*args, **kwargs)
            self.poolmanager.pool_classes_by_scheme = {"http": _GuardedHTTPPool, "https": _GuardedHTTPSPool}

    session = requests.Session()
    session.trust_env = False  # never route user URLs through environment proxies
    adapter = _GuardedAdapter()
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


def is_public_url(url: str, *, resolve_dns: bool = True) -> bool:
    try:
        check_public_url(url, resolve_dns=resolve_dns)
        return True
    except UnsafeURLError:
        return False
