# MODCDP_TRANSLATE_TEST: KEEP THIS TEST FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# All test cases, descriptions, covered edge cases, and setup should be kept perfectly 1:1 in sync between:
# - ./js/test/test.AutoSessionRouter.ts
# - ./go/modcdp/router/AutoSessionRouter_test.go
# NO MOCKING, NO MONKEY PATCHING, NO SIMULATING, NO FAKING, NO SKIPPING ALLOWED.
# USE REAL USER-FACING CODE PATHS WITH REAL BROWSERS, REAL CLASSES, REAL URLS, etc. Hard fail if keys or other env requirements are missing.
from __future__ import annotations

import threading
import unittest
from queue import Queue

from modcdp.router.AutoSessionRouter import AutoSessionRouter
from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher
from modcdp.transport.WSUpstreamTransport import WSUpstreamTransport


class AutoSessionRouterTests(unittest.TestCase):
    def test_tracks_real_target_sessions_and_execution_contexts(self) -> None:
        chrome = LocalBrowserLauncher({"launcher_local_headless": True}).launch()
        upstream = WSUpstreamTransport({"upstream_ws_cdp_url": str(chrome["cdp_url"])})
        upstream.connect()
        router = AutoSessionRouter(upstream, {"loopback_execution_context_timeout_ms": 30_000})
        router.start()
        target_id: str | None = None
        pending_target_id: str | None = None
        try:
            created = upstream.send("Target.createTarget", {"url": "about:blank#modcdp-auto-session-router"})
            created_target_id = str(created["targetId"])
            target_id = created_target_id
            session_id = _wait_for(lambda: router.sessionId_from_targetId.get(created_target_id))
            context_result: Queue[int | BaseException] = Queue()
            threading.Thread(
                target=lambda: _put_result(context_result, lambda: router.waitForExecutionContext(session_id, 30_000)),
                daemon=True,
            ).start()
            upstream.send("Runtime.enable", {}, session_id)
            context_id = context_result.get(timeout=35)
            if isinstance(context_id, BaseException):
                raise context_id
            self.assertIsInstance(context_id, int)
            self.assertTrue(
                any(
                    context.get("sessionId") == session_id and context.get("id") == context_id
                    for context in router.contexts.values()
                )
            )

            upstream.send("Target.detachFromTarget", {"sessionId": session_id})
            _wait_for(lambda: None if router.sessionId_from_targetId.get(created_target_id) else "detached")
            self.assertFalse(any(context.get("sessionId") == session_id for context in router.contexts.values()))
            upstream.send("Target.closeTarget", {"targetId": created_target_id})
            target_id = None

            pending_created = upstream.send("Target.createTarget", {"url": "about:blank#modcdp-auto-session-router-pending-context"})
            created_pending_target_id = str(pending_created["targetId"])
            pending_target_id = created_pending_target_id
            pending_session_id = _wait_for(lambda: router.sessionId_from_targetId.get(created_pending_target_id))
            pending_result: Queue[int | BaseException] = Queue()
            threading.Thread(
                target=lambda: _put_result(
                    pending_result,
                    lambda: router.waitForExecutionContext(pending_session_id, 30_000),
                ),
                daemon=True,
            ).start()
            upstream.send("Target.detachFromTarget", {"sessionId": pending_session_id})
            pending_error = pending_result.get(timeout=35)
            self.assertIsInstance(pending_error, RuntimeError)
            self.assertIn(
                f"Runtime execution context wait cancelled because session {pending_session_id} detached.",
                str(pending_error),
            )
            _wait_for(lambda: None if router.sessionId_from_targetId.get(created_pending_target_id) else "detached")
            self.assertFalse(any(context.get("sessionId") == pending_session_id for context in router.contexts.values()))
            upstream.send("Target.closeTarget", {"targetId": created_pending_target_id})
            pending_target_id = None
        finally:
            if target_id:
                try:
                    upstream.send("Target.closeTarget", {"targetId": target_id})
                except Exception:
                    pass
            if pending_target_id:
                try:
                    upstream.send("Target.closeTarget", {"targetId": pending_target_id})
                except Exception:
                    pass
            router.stop()
            upstream.close()
            chrome["close"]()


def _put_result(queue: Queue[int | BaseException], fn) -> None:
    try:
        queue.put(fn())
    except BaseException as error:
        queue.put(error)


def _wait_for(fn, timeout_s: float = 5) -> str:
    deadline = threading.Event()
    timer = threading.Timer(timeout_s, deadline.set)
    timer.start()
    try:
        while not deadline.is_set():
            value = fn()
            if value:
                return value
            deadline.wait(0.05)
    finally:
        timer.cancel()
    raise TimeoutError("timed out waiting for condition")


if __name__ == "__main__":
    unittest.main()
