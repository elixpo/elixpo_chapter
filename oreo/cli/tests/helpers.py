"""Shared helpers: run the CLI against a FakeTransport and capture output."""

import io

from fake import FakeTransport, ScriptedInput, badge_port  # noqa: F401

from oreo_cli.main import main
from oreo_cli.ui import UI


class Run:
    def __init__(self, rc, out, links, fake, ui):
        self.rc = rc
        self.out = out
        self.links = links
        self.fake = fake
        self.ui = ui


class FakeClock:
    """time.sleep / time.monotonic stand-ins: sleeping advances the clock."""

    def __init__(self):
        self.now = 0.0
        self.slept = []

    def sleep(self, s):
        self.slept.append(s)
        self.now += s

    def monotonic(self):
        return self.now


def run_cli(argv, fake=None, ports=None, inputs=(), secret=None, interactive=False,
            runner=None, clock=None):
    buf = io.StringIO()
    secret_calls = []

    def default_secret(prompt):
        secret_calls.append(prompt)
        raise AssertionError("unexpected password prompt")
    ui = UI(file=buf, color=False, width=200, input_fn=ScriptedInput(*inputs),
            secret_fn=secret or default_secret, interactive=interactive)
    links = []

    def factory(port):
        links.append(port)
        if fake is None:
            raise AssertionError("the badge was touched")
        return fake
    clock = clock or FakeClock()
    rc = main(argv, ui=ui,
              comports=ports if callable(ports) else
              (lambda: list(ports)) if ports is not None else (lambda: [badge_port()]),
              link_factory=factory, runner=runner, sleep=clock.sleep, monotonic=clock.monotonic)
    return Run(rc, buf.getvalue(), links, fake, ui)
