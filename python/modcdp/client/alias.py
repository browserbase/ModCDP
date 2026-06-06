from __future__ import annotations

import json
from collections.abc import Mapping, Sequence
from typing import Any, TypeVar

from pydantic import BaseModel

from .ModCDPClient import ModCDPClient

AliasSticky = dict[str, object]
AliasJSONObject = dict[str, object]
T = TypeVar("T")


class ModCDPAliasObject:
    def __init__(self, client: ModCDPClient, sticky: Mapping[str, object] | None = None) -> None:
        self.client = client
        self.sticky = _clone_alias_object(sticky or {})


def optional_alias_params(method: str, params: Sequence[T]) -> T | None:
    if len(params) > 1:
        raise ValueError(f"{method} accepts at most one params object")
    return params[0] if params else None


def send_alias_command_with_sticky_params(
    client: ModCDPClient,
    method: str,
    params: object,
    sticky: Mapping[str, object],
    sticky_param: str,
    sticky_params: Sequence[str],
    sticky_fields: Sequence[str],
    unwrap: str,
) -> object:
    raw_params = _params_to_alias_object(params)
    _merge_alias_sticky_params(raw_params, sticky, sticky_param, sticky_params, sticky_fields)
    return unwrap_alias_result(client._send_command(method, raw_params), unwrap)


def send_alias_command(
    client: ModCDPClient,
    method: str,
    params: object,
    sticky: Mapping[str, object],
    sticky_param: str,
    sticky_fields: Sequence[str],
    unwrap: str,
) -> object:
    return send_alias_command_with_sticky_params(
        client,
        method,
        params,
        sticky,
        sticky_param,
        [sticky_param] if sticky_param else [],
        sticky_fields,
        unwrap,
    )


def alias_sticky_from_result(result: object, unwrap: str, sticky_fields: Sequence[str]) -> AliasSticky:
    source = _params_to_alias_object(unwrap_alias_result(result, unwrap))
    if not sticky_fields:
        return _clone_alias_object(source)
    return {field: source[field] for field in sticky_fields if field in source}


def alias_array_from_result(result: object, unwrap: str) -> list[object]:
    unwrapped = unwrap_alias_result(result, unwrap)
    if isinstance(unwrapped, list):
        return unwrapped
    raise TypeError(f"alias unwrap {unwrap!r} expected array")


def unwrap_alias_result(result: object, unwrap: str) -> object:
    if not unwrap:
        return result
    current = result
    for part in unwrap.split("."):
        if not part:
            continue
        current_object = _params_to_alias_object(current)
        if part not in current_object:
            raise KeyError(f"alias unwrap {unwrap!r} missing {part!r}")
        current = current_object[part]
    return current


def _merge_alias_sticky_params(
    params: AliasJSONObject,
    sticky: Mapping[str, object],
    primary_sticky_param: str,
    sticky_params: Sequence[str],
    sticky_fields: Sequence[str],
) -> None:
    if not sticky_params:
        _merge_alias_sticky(params, sticky, primary_sticky_param, sticky_fields)
        return
    seen: set[str] = set()
    for sticky_param in sticky_params:
        if not sticky_param or sticky_param in seen:
            continue
        seen.add(sticky_param)
        if sticky_param != primary_sticky_param and sticky_param not in params:
            continue
        _merge_alias_sticky(params, sticky, sticky_param, sticky_fields)


def _merge_alias_sticky(
    params: AliasJSONObject,
    sticky: Mapping[str, object],
    sticky_param: str,
    sticky_fields: Sequence[str],
) -> None:
    if not sticky:
        return
    target = params
    if sticky_param:
        raw_target = params.get(sticky_param)
        target = dict(raw_target) if isinstance(raw_target, Mapping) else {}
        params[sticky_param] = target
    fields = sticky_fields or list(sticky.keys())
    for field in fields:
        if field in target:
            continue
        if field in sticky:
            target[field] = sticky[field]


def _params_to_alias_object(params: object) -> AliasJSONObject:
    if params is None:
        return {}
    if isinstance(params, BaseModel):
        return dict(params.model_dump(mode="json", exclude_none=True, by_alias=True))
    if isinstance(params, Mapping):
        return dict(params)
    return {}


def _clone_alias_object(source: Mapping[str, object]) -> AliasSticky:
    return json.loads(json.dumps(dict(source)))
