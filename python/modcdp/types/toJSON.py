# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/types/toJSON.ts
# - ./go/modcdp/types/toJSON.go
from __future__ import annotations

from collections.abc import Mapping
from typing import Any, Protocol

from pydantic import BaseModel


class ModCDPJSONChild(Protocol):
    def toJSON(self) -> object: ...


def modCDPToJSON(instance: object, config: Mapping[str, Any] | None = None) -> dict[str, object]:
    json_config = dict(config or {})
    children: dict[str, object] = {}
    for key, child in dict(json_config.get("children") or {}).items():
        if child is not None:
            children[str(key)] = child.toJSON()
    result: dict[str, object] = {
        "type": type(instance).__name__,
        "config": _jsonable(json_config.get("config", getattr(instance, "config", {}))),
        "state": {
            **_simple_state(vars(instance)),
            **_simple_state(dict(json_config.get("state") or {})),
        },
    }
    if children:
        result["children"] = children
    return result


def _jsonable(value: object) -> object:
    if isinstance(value, BaseModel):
        return value.model_dump(mode="json")
    if isinstance(value, Mapping):
        return {str(key): _jsonable(item) for key, item in value.items()}
    if isinstance(value, list):
        return [_jsonable(item) for item in value]
    return value


def _simple_state(input: Mapping[str, object]) -> dict[str, str | int | float | bool]:
    state: dict[str, str | int | float | bool] = {}
    for key, value in input.items():
        if key.startswith("_") or key == "config" or "token" in key or "secret" in key or "api_key" in key:
            continue
        if isinstance(value, str | int | float | bool):
            state[key] = value
    return state
