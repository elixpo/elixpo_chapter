"""Operator-only Janitor CLI; intentionally not exposed through HTTP."""
from __future__ import annotations

import argparse
import json
import os

from graphMemory.client import GraphMemoryClient
from ipcService.coreServiceManager import get_core_embedding_service
from memoryJanitor import DeletionRequest, Janitor
from pipeline.config import (
    AGENT_STATE_REDIS_DB, CONVERSATION_ARCHIVE_DIR, GRAPH_MEMORY_REDIS_DB,
    SESSION_LEDGER_REDIS_DB, create_redis_client,
)


def build_janitor() -> Janitor:
    graph_redis = create_redis_client(db=GRAPH_MEMORY_REDIS_DB, decode_responses=True)
    return Janitor(
        lock_redis=graph_redis,
        ledger_redis=create_redis_client(db=SESSION_LEDGER_REDIS_DB, decode_responses=True),
        state_redis=create_redis_client(db=AGENT_STATE_REDIS_DB, decode_responses=True),
        graph_redis=graph_redis,
        graph_client=GraphMemoryClient(graph_redis, enabled=True),
        core_service=get_core_embedding_service(),
        artifact_dirs=(
            os.getenv("CONTENT_STORE_DIR", "/app/data/cache/content"),
            os.getenv("IMAGE_STORE_DIR", "/app/data/cache/images"),
        ),
        conversation_dir=CONVERSATION_ARCHIVE_DIR,
    )


def main() -> int:
    parser = argparse.ArgumentParser(description="OreoLook memory lifecycle Janitor")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--delete-tenant")
    parser.add_argument("--delete-user")
    parser.add_argument("--delete-session", help="Scoped memory session id, e.g. search:conv_123")
    parser.add_argument("--raw-session", help="Raw Redis/disk conversation id")
    args = parser.parse_args()
    janitor = build_janitor()
    if args.delete_tenant or args.delete_user:
        if not (args.delete_tenant and args.delete_user):
            parser.error("--delete-tenant and --delete-user must be supplied together")
        request = DeletionRequest.create(
            args.delete_tenant, args.delete_user,
            session_id=args.delete_session, raw_session_id=args.raw_session,
        )
        if args.dry_run:
            print(json.dumps(janitor.delete_now(request, dry_run=True).to_dict(), indent=2))
        else:
            print(json.dumps({"queued": janitor.request_deletion(request), "id": request.request_id}))
        return 0
    print(json.dumps(janitor.run(dry_run=args.dry_run).to_dict(), indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
