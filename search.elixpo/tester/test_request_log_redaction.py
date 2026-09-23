from starlette.requests import Request

from commons.requestID import _request_log_target


def test_request_logs_never_include_query_values():
    request = Request({
        "type": "http",
        "http_version": "1.1",
        "method": "GET",
        "scheme": "https",
        "path": "/api/search",
        "raw_path": b"/api/search",
        "query_string": b"query=private+prompt&key=secret-token&session_id=private-session",
        "headers": [],
        "client": ("127.0.0.1", 1234),
        "server": ("search.elixpo.com", 443),
    })

    target = _request_log_target(request)
    assert target == "/api/search"
    assert "secret-token" not in target
    assert "private+prompt" not in target
    assert "private-session" not in target


def test_nginx_access_logs_exclude_query_referrer_and_session_values():
    config = open("nginx.conf", encoding="utf-8").read()
    log_section = config.split("access_log /var/log/nginx/access.log main;", 1)[0]
    assert '"$request"' not in log_section
    assert "$request_uri" not in log_section
    assert "$http_referer" not in log_section
    assert "$http_x_session_id" not in log_section
    assert "$request_method $uri $server_protocol" in log_section
