from __future__ import annotations

import json
import threading
import unittest
from queue import Queue
from typing import Any

from websocket import create_connection

from modcdp.router.AutoSessionRouter import AutoSessionRouter
from modcdp.launcher.LocalBrowserLauncher import LocalBrowserLauncher


class AutoSessionRouterTests(unittest.TestCase):
    def test_tracks_real_target_sessions_and_execution_contexts(self) -> None:
        chrome = LocalBrowserLauncher({"headless": True}).launch()
        ws = create_connection(str(chrome["cdp_url"]), timeout=10)
        lock = threading.Lock()
        next_id = 0
        pending: dict[int, Queue[dict[str, Any]]] = {}
        closed = False

        def send(method: str, params: dict[str, Any] | None = None, session_id: str | None = None) -> dict[str, Any]:
            nonlocal next_id
            with lock:
                next_id += 1
                msg_id = next_id
                done: Queue[dict[str, Any]] = Queue()
                pending[msg_id] = done
            message = {"id": msg_id, "method": method, "params": params or {}}
            if session_id:
                message["sessionId"] = session_id
            ws.send(json.dumps(message))
            response = done.get(timeout=10)
            if response.get("error"):
                raise RuntimeError(json.dumps(response["error"]))
            result = response.get("result")
            return result if isinstance(result, dict) else {}

        router = AutoSessionRouter(send, lambda: 30_000)

        def reader() -> None:
            while not closed:
                try:
                    raw = ws.recv()
                except Exception:
                    return
                if not raw:
                    return
                try:
                    message = json.loads(raw)
                except json.JSONDecodeError:
                    return
                if isinstance(message.get("id"), int):
                    done = pending.pop(message["id"], None)
                    if done is not None:
                        done.put(message)
                    continue
                method = message.get("method")
                if isinstance(method, str):
                    session_id = message.get("sessionId")
                    router.recordProtocolEvent(method, message.get("params"), session_id if isinstance(session_id, str) else None)

        thread = threading.Thread(target=reader, daemon=True)
        thread.start()
        target_id: str | None = None
        pending_target_id: str | None = None
        try:
            send("Target.setAutoAttach", {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True})
            send("Target.setDiscoverTargets", {"discover": True})
            created = send("Target.createTarget", {"url": "about:blank#modcdp-auto-session-router"})
            created_target_id = str(created["targetId"])
            target_id = created_target_id
            session_id = _wait_for(lambda: router.sessionId_from_targetId.get(created_target_id))
            context_result: Queue[int | BaseException] = Queue()
            threading.Thread(
                target=lambda: _put_result(context_result, lambda: router.waitForExecutionContext(session_id, 30_000)),
                daemon=True,
            ).start()
            send("Runtime.enable", {}, session_id)
            context_id = context_result.get(timeout=35)
            if isinstance(context_id, BaseException):
                raise context_id
            self.assertIsInstance(context_id, int)
            self.assertEqual(router.execution_contexts[session_id], context_id)

            send("Target.detachFromTarget", {"sessionId": session_id})
            _wait_for(lambda: None if router.sessionId_from_targetId.get(created_target_id) else "detached")
            self.assertNotIn(session_id, router.execution_contexts)
            send("Target.closeTarget", {"targetId": created_target_id})
            target_id = None

            pending_created = send("Target.createTarget", {"url": "about:blank#modcdp-auto-session-router-pending-context"})
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
            send("Target.detachFromTarget", {"sessionId": pending_session_id})
            pending_error = pending_result.get(timeout=35)
            self.assertIsInstance(pending_error, RuntimeError)
            self.assertIn(
                f"Runtime execution context wait cancelled because session {pending_session_id} detached.",
                str(pending_error),
            )
            _wait_for(lambda: None if router.sessionId_from_targetId.get(created_pending_target_id) else "detached")
            self.assertNotIn(pending_session_id, router.execution_contexts)
            send("Target.closeTarget", {"targetId": created_pending_target_id})
            pending_target_id = None
        finally:
            if target_id:
                try:
                    send("Target.closeTarget", {"targetId": target_id})
                except Exception:
                    pass
            if pending_target_id:
                try:
                    send("Target.closeTarget", {"targetId": pending_target_id})
                except Exception:
                    pass
            closed = True
            ws.close()
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
