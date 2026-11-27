# HTTPS on the badge: verified certificates

Every HTTPS connection the badge makes (OTA updates, the App Store, GitHub
data, location, weather, the Wi-Fi speed test) goes through one function,
`oreoOS._http.tls_wrap()`. Since #110 it **verifies the server's
certificate**: the chain must end at one of the root CAs in
`oreoOS/tls_roots.py`, the certificate must name the host, and its dates
must contain the badge's clock. A connection that fails any check is
refused. There is no fallback to an unverified connection.

## How it works

```python
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
for der in tls_roots.ROOTS:                  # one DER certificate per call
    ctx.load_verify_locations(cadata=der)
ctx.verify_mode = ssl.CERT_REQUIRED
sock = ctx.wrap_socket(raw, server_hostname=host)
```

What MicroPython 1.28 does with this (`extmod/modtls_mbedtls.c` and the
`ssl` wrapper in micropython-lib, read from the v1.28 source):

- `ssl.SSLContext` starts at `CERT_NONE`; the code sets `CERT_REQUIRED`
  explicitly.
- `load_verify_locations(cadata=...)` parses **one** DER certificate per
  call (mbedTLS 3.x rejects trailing bytes after a DER certificate) and
  adds it to the context's trust list, so the roots are loaded one by one.
- `server_hostname` sets SNI **and** the name mbedTLS checks against the
  certificate's subjectAltName/CN (`mbedtls_ssl_set_hostname`). With
  `CERT_REQUIRED` and no `server_hostname`, `wrap_socket` refuses to run.
- A rejected certificate raises `ValueError` with mbedTLS's reason (for
  example "The certificate validity has expired"), or
  `OSError(-0x2700)` without it. `tls_wrap` turns either into
  `oreoOS._http.TLSError`, an `OSError` with a short `reason`.
- Certificate dates are compared with the RTC through
  `mbedtls_platform_set_time` (ESP32 port, `main.c`), so the clock must be
  set first (below).

The roots module is imported on the first TLS connection, not at boot,
and then stays loaded. A fresh `SSLContext` per connection keeps
background fetches on worker threads independent.

## Hosts and roots

Hosts the badge talks to over TLS (`tools/gen_ca_bundle.py` `HOSTS`; a
host test fails when the code gains an `https://` host not listed there):

| Host | Used by | Chain today (2026-11-11) |
|---|---|---|
| api.github.com | OTA tags, Contents API, profile | Sectigo DV E36 → Sectigo Root E46 → USERTrust ECC |
| github.com | release downloads, contributions | Sectigo DV E36 → Sectigo Root E46 → USERTrust ECC |
| codeload.github.com | archive redirects | Sectigo DV E36 → Sectigo Root E46 → USERTrust ECC |
| raw.githubusercontent.com | App Store catalogue and app files | Let's Encrypt YR1 → ISRG Root YR → ISRG Root X1 |
| release-assets.githubusercontent.com | OTA release assets (302 target) | Let's Encrypt YR1 → ISRG Root YR → ISRG Root X1 |
| objects.githubusercontent.com | older release asset CDN | Let's Encrypt YR1 → ISRG Root YR → ISRG Root X1 |
| ipwho.is, ipapi.co | `oreoOS.geo` | Google Trust Services WE1 → GTS Root R4 |
| api.openweathermap.org | Weather app | Sectigo OV R36 → Sectigo Root R46 → USERTrust RSA |
| speed.cloudflare.com | Wi-Fi speed test | Google Trust Services WE1 → GTS Root R4 |

NTP (`pool.ntp.org`, UDP) is not TLS.

Roots in the bundle: the root each chain ends at today, a backup from the
same CA family, and GitHub's previous CA (DigiCert), so a CA switching to
its other root, or GitHub moving back, does not break updates. 10 roots,
9,484 bytes of DER.

| # | Subject | SHA-256 | Expires | Why |
|---|---|---|---|---|
| 1 | C=US, O=The USERTRUST Network, CN=USERTrust ECC Certification Authority | `4FF460D54B9C86DABFBCFC5712E0400D2BED3FBC4D4FBDAA86E06ADCD2A9AD7A` | Jan 18 23:59:59 2038 GMT | GitHub (api.github.com, github.com, codeload): Sectigo E46 chain |
| 2 | C=GB, O=Sectigo Limited, CN=Sectigo Public Server Authentication Root E46 | `C90F26F0FB1B4018B22227519B5CA2B53E2CA5B3BE5CF18EFE1BEF47380C5383` | Mar 21 23:59:59 2046 GMT | GitHub: the same chain ends here when the cross-sign is not sent |
| 3 | C=US, O=The USERTRUST Network, CN=USERTrust RSA Certification Authority | `E793C9B02FD8AA13E21C31228ACCB08119643B749C898964B1746D46C3D4CBD2` | Jan 18 23:59:59 2038 GMT | api.openweathermap.org (Sectigo R46 chain); Sectigo RSA backup |
| 4 | C=GB, O=Sectigo Limited, CN=Sectigo Public Server Authentication Root R46 | `7BB647A62AEEAC88BF257AA522D01FFEA395E0AB45C73F93F65654EC38F25A06` | Mar 21 23:59:59 2046 GMT | api.openweathermap.org without the cross-sign; Sectigo RSA backup |
| 5 | C=US, O=Internet Security Research Group, CN=ISRG Root X1 | `96BCEC06264976F37460779ACF28C5A7CFE8A3C0AAE11A8FFCEE05C0BDDF08C6` | Jun  4 11:04:38 2035 GMT | raw/release-assets/objects.githubusercontent.com (Let's Encrypt) |
| 6 | C=US, O=Internet Security Research Group, CN=ISRG Root X2 | `69729B8E15A86EFC177A57AFB7171DFC64ADD28C2FCA8CF1507E34453CCB1470` | Sep 17 16:00:00 2040 GMT | Let's Encrypt ECDSA chains (backup) |
| 7 | C=US, O=Google Trust Services LLC, CN=GTS Root R4 | `349DFA4058C5E263123B398AE795573C4E1313C83FE68F93556CD5E8031B3C7D` | Jun 22 00:00:00 2036 GMT | ipwho.is, ipapi.co, speed.cloudflare.com (Google Trust Services) |
| 8 | C=US, O=Google Trust Services LLC, CN=GTS Root R1 | `D947432ABDE7B7FA90FC2E6B59101B1280E0E1C7E4E40FA3C6887FFF57A7F4CF` | Jun 22 00:00:00 2036 GMT | Google Trust Services RSA chains (backup) |
| 9 | C=US, O=DigiCert Inc, OU=www.digicert.com, CN=DigiCert Global Root G2 | `CB3CCBB76031E5E0138F8DD39A23F9DE47FFC35E43C1144CEA27D46A5AB1CB5F` | Jan 15 12:00:00 2038 GMT | GitHub's previous CA, RSA (backup) |
| 10 | C=US, O=DigiCert Inc, OU=www.digicert.com, CN=DigiCert Global Root G3 | `31AD6648F8104138C738F39EA4320133393E3A18CC02296EF97C2AC9EF6731D0` | Jan 15 12:00:00 2038 GMT | GitHub's previous CA, ECDSA (backup) |

The SHA-256 is of the DER certificate (what `openssl x509 -fingerprint
-sha256` prints). Root certificates are public.

### Updating the bundle

```bash
python3 tools/gen_ca_bundle.py --check-hosts   # every host, bundle only
python3 tools/gen_ca_bundle.py                 # regenerate oreoOS/tls_roots.py
python3 tools/gen_ca_bundle.py --docs          # the table above
```

`--check-hosts` handshakes with every host trusting only the bundle. Run
it before each release; a `FAIL` means a host moved to a CA that is not in
the bundle. Add its root to `ROOTS` in the tool, regenerate, update the
table and ship it in an OTA release **before** the old root stops being
used where possible. Roots are read from the computer's CA store
(`/etc/ssl/certs`, Mozilla's list).

## The clock

The RTC starts at 2000-01-01 after a power cycle, and every certificate
would look "not yet valid". Before verifying, `tls_wrap` calls
`_http.ensure_clock()`:

1. Clock already set (year ≥ `MIN_CLOCK_YEAR`, 2026): go on.
2. A time sync is running (netsvc starts one on every link-up): wait for
   it, up to 6 s.
3. Otherwise run one NTP sync (`timeutil.sync_from_ntp`, DNS plus a
   2.5 s UDP timeout), at most once every 30 s.
4. Still not set: refuse with `TLS: clock not set`. Verification is
   never skipped.

The RTC holds local time (the profile's `TIMEZONE_OFFSET` is applied on
sync) and mbedTLS reads it as UTC, so the badge's idea of "now" can be off
by the timezone offset (at most 14 hours). Certificates are valid for
months and are issued well before they are deployed, so this only matters
within hours of a certificate's start or end.

## What the user sees

A refused connection shows a short reason instead of a generic network
error:

| Screen | Shows |
|---|---|
| Updates | `TLS: untrusted certificate` (or `clock not set`, `certificate date invalid`, `certificate name mismatch`, `certificate rejected`, `CA bundle failed to load`) instead of "no network" / "manifest fetch failed" / "download failed" |
| App Store | header `TLS ERROR`; an empty Discover page says "Secure connection failed" and the reason; a failed install says `Install failed: TLS: ...` |
| Commits | pill `TLS ERROR`, "Secure link failed, A to retry." |
| Weather | "not secure", "certificate check failed, A=retry" |

Code that only sees "the request failed" asks `_http` why:

```python
from oreoOS import _http
mark = _http.tls_mark()
body = _http.get_url(url)
if body is None:
    msg = _http.tls_error_since(mark) or "no network"   # 'TLS: <reason>'
```

## Debug escape hatch

`oreoOS._http.INSECURE_DEBUG` is `False`. For debugging a TLS problem from
the REPL only:

```python
import oreoOS._http as h
h.INSECURE_DEBUG = True      # until the next reset; never saved
```

Every connection then prints `WARNING: certificate verification OFF`. Do
not ship code that sets it.

## Testing on a badge

```bash
falera run tools/tls_probe.py
```

prints, with verification on: the clock before and after the sync, the
cost of importing the roots, and per host the handshake time and the
Python (gc) and ESP-IDF heap used during the handshake; then checks that
a wrong server name is refused and fetches the OTA tag list. It ends with
`RESULT: PASS`.

Cost measured on the host: the roots module holds 9,484 bytes of DER and
adds about 10 KB to the Python heap once imported (`.py` source 30 KB,
`.mpy` 9.6 KB). Each connection's context also holds the parsed roots in
the ESP-IDF heap (a copy of the DER plus parsed fields, roughly 15 KB) until
the socket is closed and
collected.

## Connecting: address fallback

GitHub serves release assets, raw files and its asset CDN from four anycast
addresses (185.199.108.133 to 185.199.111.133), and some networks black-hole
one of them: a TCP connection to it never opens. The badge's resolver (lwIP)
returns one address and caches it for the DNS TTL, so a badge that drew the
dead one used to time out on every OTA file and App Store download. Every
connection (`_http._connect`) now tries each address it knows with a 6 s
connect timeout, remembers the ones that failed for 10 minutes and tries
them last, and, when all of them fail, asks the network's DNS server
directly for every A record and tries the rest. Request failures are kept in
plain words (`_http.last_error()`, `error_since(mark)`), for example
`release-assets.githubusercontent.com: timed out`.

To see what a badge gets, and to dry-run an update without installing it:

```bash
falera run tools/ota_probe.py
```

It lists, per GitHub host, the resolver's address, every address DNS lists
and whether a TCP connection to each opens; then it checks for the latest
release and downloads and verifies every file of it into `/_ota_probe`
(deleted at the end), printing host, redirects, size, time and hash result
per file, and the first error in full. It never touches the installed OS or
an update staged in `/_ota`.

## Not covered here

TLS protects the connection, not the update itself. Signing OTA bundles,
so an update stays trustworthy even if TLS were bypassed or GitHub
compromised, is a separate follow-up (#110).
