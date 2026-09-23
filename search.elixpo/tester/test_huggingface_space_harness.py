import copy

import pytest

from tester.huggingface_space_harness import (
    SpaceStreamingContractError,
    validate_streaming_contract,
)


def valid_config():
    return {
        "protocol": "sse_v3",
        "components": [
            {"id": 9, "props": {"elem_id": "research-chat"}},
            {"id": 12, "props": {"elem_id": "research-send"}},
        ],
        "dependencies": [
            {
                "id": 1,
                "targets": [[12, "click"]],
                "outputs": [9, 1, 10, 12],
                "queue": False,
                "types": {"generator": False},
                "trigger_after": None,
                "stream_every": 0.5,
            },
            {
                "id": 2,
                "targets": [[None, "then"]],
                "outputs": [9, 1, 24, 26, 10, 12],
                "queue": True,
                "types": {"generator": True},
                "trigger_after": 1,
                "stream_every": 0.1,
            },
        ],
    }


def test_streaming_contract_accepts_immediate_stage_and_chained_generator():
    assert validate_streaming_contract(valid_config()) == {
        "protocol": "sse_v3",
        "stage_id": 1,
        "stream_id": 2,
        "stream_every": 0.1,
    }


@pytest.mark.parametrize(
    ("mutation", "message"),
    [
        (lambda value: value.update(protocol="http"), "expected SSE"),
        (
            lambda value: value["dependencies"][0].update(queue=True),
            "unqueued",
        ),
        (
            lambda value: value["dependencies"][1].update(stream_every=0.5),
            "cadence regressed",
        ),
        (
            lambda value: value["dependencies"][0].update(outputs=[1, 10, 12]),
            "paint the chat",
        ),
    ],
)
def test_streaming_contract_rejects_buffering_regressions(mutation, message):
    config = copy.deepcopy(valid_config())
    mutation(config)
    with pytest.raises(SpaceStreamingContractError, match=message):
        validate_streaming_contract(config)
