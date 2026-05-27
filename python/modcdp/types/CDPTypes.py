# MODCDP_TRANSLATE: KEEP THIS FILE TRANSLATED ACROSS TYPESCRIPT, PYTHON, AND GO.
# Keep all shapes, signatures, behavior, and tests 1:1 in sync with:
# - ./js/src/types/CDPTypes.ts
# - ./go/modcdp/client/CDPTypes.go
from __future__ import annotations

import re
import threading
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal, TypeAlias

from pydantic import BaseModel, ConfigDict, Field, RootModel, TypeAdapter, ValidationError
from pydantic_core import to_jsonable_python

from ..types.generated import cdp as generated_cdp
from ..types.generated.cdp import CDPEvent, CDPModel, CDPParams
from ..types.jsonschema import type_adapter_from_json_schema
from ..types.modcdp import (
    JsonObject,
    JsonValue,
    ModCDPAddCustomCommandParams,
    ModCDPAddCustomEventObjectParams,
    ModCDPAddCustomEventParams,
    ModCDPAddMiddlewareParams,
    ModCDPPayloadSchemaSpec,
    ProtocolParams,
    ProtocolPayload,
    ProtocolResult,
)
from ..types.toJSON import modCDPToJSON

JsonSchema: TypeAlias = dict[str, JsonValue]
CustomCommandConfig: TypeAlias = Mapping[str, ModCDPPayloadSchemaSpec | str | None]
CustomEventConfig: TypeAlias = Mapping[str, ModCDPPayloadSchemaSpec | str | None]
CustomMiddlewareConfig: TypeAlias = Mapping[str, object]
CustomCommandRegistrations: TypeAlias = Sequence[ModCDPAddCustomCommandParams] | dict[str, object]
CustomEventRegistrations: TypeAlias = Sequence[ModCDPAddCustomEventParams] | dict[str, object]
CustomMiddlewareRegistrations: TypeAlias = Sequence[ModCDPAddMiddlewareParams | CustomMiddlewareConfig]


class _ModCDPAddCustomCommand(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    expression: str | None = None
    params_schema: object = None
    result_schema: object = None


class _ModCDPAddCustomEvent(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str
    event_schema: object = None


class _CustomCommandConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    expression: str | None = None
    params_schema: object = None
    result_schema: object = None


class _CustomCommandConfigMap(RootModel[dict[str, _CustomCommandConfig]]):
    pass


class _CustomEventConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_schema: object = None


class _CustomEventConfigMap(RootModel[dict[str, _CustomEventConfig]]):
    pass


class _ModCDPAddMiddleware(BaseModel):
    model_config = ConfigDict(extra="forbid")

    phase: Literal["request", "response", "event"]
    expression: str
    name: str | None = None


@dataclass(frozen=True)
class _AdapterRegistration:
    adapter: TypeAdapter[object] | None = None
    json_schema: dict[str, JsonValue] | None = None


@dataclass(frozen=True)
class CommandPreparation:
    params: Mapping[str, object]
    local_result: ProtocolResult | None = None
    custom_command_name: str | None = None


JSON_SCHEMA_OBJECT: JsonSchema = {"type": "object"}
JSON_SCHEMA_ANY: JsonSchema = {}
MOD_ADD_CUSTOM_COMMAND_PARAMS_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "expression": {"type": ["string", "null"]},
        "params_schema": {"type": ["object", "null"]},
        "result_schema": {"type": ["object", "null"]},
    },
    "required": ["name"],
    "additionalProperties": False,
}
MOD_ADD_CUSTOM_EVENT_PARAMS_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "event_schema": {"type": ["object", "null"]},
    },
    "required": ["name"],
    "additionalProperties": False,
}
MOD_ADD_MIDDLEWARE_PARAMS_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": ["string", "null"]},
        "phase": {"enum": ["request", "response", "event"]},
        "expression": {"type": "string"},
    },
    "required": ["phase", "expression"],
    "additionalProperties": False,
}
MOD_COMMAND_REGISTRATION_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "expression": {"type": ["string", "null"]},
        "params_schema": {"type": ["object", "null"]},
        "result_schema": {"type": ["object", "null"]},
    },
    "required": ["name"],
    "additionalProperties": False,
}
MOD_EVENT_REGISTRATION_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": "string"},
        "event_schema": {"type": ["object", "null"]},
    },
    "required": ["name"],
    "additionalProperties": False,
}
MOD_MIDDLEWARE_REGISTRATION_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "name": {"type": ["string", "null"]},
        "phase": {"enum": ["request", "response", "event"]},
        "expression": {"type": "string"},
    },
    "required": ["phase", "expression"],
    "additionalProperties": False,
}
MOD_CONFIGURE_PARAMS_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "upstream": {
            "type": "object",
            "properties": {
                "upstream_mode": {"enum": ["ws", "pipe", "nativemessaging", "reversews", "nats", "chromedebugger"]},
                "upstream_ws_cdp_url": {"type": "string"},
                "upstream_nats_url": {"type": "string"},
                "upstream_nats_subject_prefix": {"type": "string"},
                "upstream_nats_role": {"enum": ["client", "browser"]},
                "upstream_nats_wait_timeout_ms": {"type": "number"},
                "upstream_reversews_bind": {"type": "string"},
                "upstream_reversews_wait_timeout_ms": {"type": "number"},
                "upstream_nativemessaging_host_name": {"type": "string"},
                "upstream_ws_connect_error_settle_timeout_ms": {"type": "number"},
                "upstream_cdp_send_timeout_ms": {"type": "number"},
            },
            "additionalProperties": False,
        },
        "router": {
            "type": "object",
            "properties": {
                "router_routes": {"type": "object", "additionalProperties": {"type": "string"}},
                "loopback_execution_context_timeout_ms": {"type": "number"},
            },
            "additionalProperties": False,
        },
        "client_config": {
            "type": "object",
            "properties": {
                "client_hydrate_aliases": {"type": "boolean"},
                "client_mirror_upstream_events": {"type": "boolean"},
                "client_cdp_send_timeout_ms": {"type": "number"},
                "client_event_wait_timeout_ms": {"type": "number"},
                "client_heartbeat_interval_ms": {"type": "number"},
            },
            "additionalProperties": False,
        },
        "downstream": {
            "type": "object",
            "properties": {
                "downstream_client_timeout_ms": {"type": "number"},
                "downstream_close_browser_on_disconnect": {"type": "boolean"},
            },
            "additionalProperties": False,
        },
        "server_browser_token": {"type": "string"},
        "custom_commands": {"type": "array", "items": MOD_COMMAND_REGISTRATION_SCHEMA},
        "custom_events": {"type": "array", "items": MOD_EVENT_REGISTRATION_SCHEMA},
        "custom_middlewares": {"type": "array", "items": MOD_MIDDLEWARE_REGISTRATION_SCHEMA},
    },
    "additionalProperties": False,
}
MOD_TOPOLOGY_PARAMS_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "rootTargetId": {"type": ["string", "null"]},
        "targetId": {"type": ["string", "null"]},
        "active": {"type": ["boolean", "null"]},
    },
    "additionalProperties": False,
}
MOD_TOPOLOGY_FRAME_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "targetId": {"type": "string"},
        "url": {"type": ["string", "null"]},
        "parentFrameId": {"type": ["string", "null"]},
        "outerBackendNodeId": {"type": ["integer", "null"]},
    },
    "required": ["targetId"],
    "additionalProperties": False,
}
MOD_TOPOLOGY_DOM_ROOT_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "kind": {"enum": ["document", "shadow"]},
        "frameId": {"type": "string"},
        "outerBackendNodeId": {"type": ["integer", "null"]},
        "innerBackendNodeId": {"type": ["integer", "null"]},
        "mode": {"enum": ["open", "closed", "user-agent", None]},
        "executionContextId": {"type": ["integer", "null"]},
        "uniqueContextId": {"type": ["string", "null"]},
    },
    "required": ["kind", "frameId"],
    "additionalProperties": False,
}
MOD_TOPOLOGY_TARGET_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "targetId": {"type": "string"},
        "type": {"type": "string"},
        "title": {"type": ["string", "null"]},
        "url": {"type": ["string", "null"]},
        "attached": {"type": ["boolean", "null"]},
        "parentId": {"type": ["string", "null"]},
        "parentFrameId": {"type": ["string", "null"]},
        "sessionId": {"type": ["string", "null"]},
    },
    "required": ["targetId", "type"],
}
MOD_TOPOLOGY_EXECUTION_CONTEXT_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "id": {"type": "integer"},
        "origin": {"type": ["string", "null"]},
        "name": {"type": ["string", "null"]},
        "uniqueId": {"type": ["string", "null"]},
        "auxData": {"type": ["object", "null"]},
        "sessionId": {"type": ["string", "null"]},
        "targetId": {"type": "string"},
        "frameId": {"type": ["string", "null"]},
        "world": {"type": "string"},
    },
    "required": ["id", "sessionId", "targetId", "world"],
    "additionalProperties": False,
}
MOD_TOPOLOGY_RESPONSE_SCHEMA: JsonSchema = {
    "type": "object",
    "properties": {
        "objectGroup": {"type": "string"},
        "rootFrameId": {"type": "string"},
        "frames": {"type": "object", "additionalProperties": MOD_TOPOLOGY_FRAME_SCHEMA},
        "roots": {"type": "object", "additionalProperties": MOD_TOPOLOGY_DOM_ROOT_SCHEMA},
        "targets": {"type": "object", "additionalProperties": MOD_TOPOLOGY_TARGET_SCHEMA},
        "contexts": {"type": "object", "additionalProperties": MOD_TOPOLOGY_EXECUTION_CONTEXT_SCHEMA},
    },
    "required": ["objectGroup", "rootFrameId", "frames", "roots", "targets", "contexts"],
    "additionalProperties": False,
}
DEFAULT_BUILTIN_COMMANDS: tuple[ModCDPAddCustomCommandParams, ...] = (
    {
        "name": "Mod.ping",
        "params_schema": {"type": "object", "properties": {"sent_at": {"type": "number"}}, "additionalProperties": False},
        "result_schema": {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"], "additionalProperties": False},
        "expression": """
      async (params) => {
        const received_at = Date.now();
        const message = {
          method: "Mod.pong",
          params: {
            sent_at:
              typeof params.sent_at === "number"
                ? params.sent_at
                : received_at,
            received_at,
            from: "extension-service-worker",
          },
        };
        if (cdpSessionId) message.sessionId = cdpSessionId;
        downstream.sendEvent(message);
        return { ok: true };
      }
      """,
    },
    {
        "name": "Mod.configure",
        "params_schema": MOD_CONFIGURE_PARAMS_SCHEMA,
        "result_schema": JSON_SCHEMA_OBJECT,
        "expression": "async (params) => { await ModCDP.configure(params); return params; }",
    },
    {
        "name": "Mod.evaluate",
        "params_schema": {
            "type": "object",
            "properties": {
                "expression": {"type": "string"},
                "params": {"type": ["object", "null"]},
                "cdpSessionId": {"type": ["string", "null"]},
            },
            "required": ["expression"],
            "additionalProperties": False,
        },
        "result_schema": JSON_SCHEMA_ANY,
        "expression": """
      async ({ expression, params = {}, cdpSessionId = null }) =>
        ModCDP.evaluateInServiceWorker({ expression, params, cdpSessionId })
      """,
    },
    {
        "name": "Mod.getTopology",
        "params_schema": MOD_TOPOLOGY_PARAMS_SCHEMA,
        "result_schema": MOD_TOPOLOGY_RESPONSE_SCHEMA,
        "expression": "async (params) => ModCDP.client.router.getTopology(params)",
    },
    {
        "name": "Mod.addCustomCommand",
        "params_schema": MOD_ADD_CUSTOM_COMMAND_PARAMS_SCHEMA,
        "result_schema": {"type": "object", "properties": {"name": {"type": "string"}, "registered": {"type": "boolean"}}, "required": ["name", "registered"], "additionalProperties": False},
        "expression": "async (params) => ModCDP.addCustomCommand(params)",
    },
    {
        "name": "Mod.addCustomEvent",
        "params_schema": MOD_ADD_CUSTOM_EVENT_PARAMS_SCHEMA,
        "result_schema": {"type": "object", "properties": {"name": {"type": "string"}, "registered": {"type": "boolean"}}, "required": ["name", "registered"], "additionalProperties": False},
        "expression": "async (params) => ModCDP.addCustomEvent(params)",
    },
    {
        "name": "Mod.addMiddleware",
        "params_schema": MOD_ADD_MIDDLEWARE_PARAMS_SCHEMA,
        "result_schema": {"type": "object", "properties": {"name": {"type": "string"}, "phase": {"enum": ["request", "response", "event"]}, "registered": {"type": "boolean"}}, "required": ["name", "phase", "registered"], "additionalProperties": False},
        "expression": "async (params) => ModCDP.addMiddleware(params)",
    },
)
DEFAULT_BUILTIN_EVENTS: tuple[ModCDPAddCustomEventObjectParams, ...] = (
    {
        "name": "Mod.pong",
        "event_schema": {
            "type": "object",
            "properties": {
                "sent_at": {"type": "number"},
                "received_at": {"type": "number"},
                "from": {"type": "string"},
            },
            "required": ["sent_at", "received_at", "from"],
            "additionalProperties": False,
        },
    },
)


def normalizeModCDPName(value: str) -> str:
    name = value.strip()
    if not name or name.count(".") != 1:
        raise ValueError("name must be in Domain.method form")
    return name


def _json_object(value: object) -> JsonObject:
    if isinstance(value, Mapping):
        return {str(key): _json_value(raw_value) for key, raw_value in value.items()}
    raise TypeError("expected a JSON object")


def _json_value(value: object) -> JsonValue:
    if value is None or isinstance(value, bool | int | float | str):
        return value
    if isinstance(value, type) and issubclass(value, BaseModel):
        return _json_object(value.model_json_schema())
    if isinstance(value, Sequence) and not isinstance(value, str | bytes | bytearray):
        return [_json_value(item) for item in value]
    if isinstance(value, Mapping):
        return {str(key): _json_value(raw_value) for key, raw_value in value.items()}
    raise TypeError(f"expected a JSON value, got {type(value).__name__}")


def _model_or_json_object(value: object) -> ProtocolResult:
    if isinstance(value, BaseModel):
        return _json_object(value.model_dump(mode="json", exclude_none=True, by_alias=True))
    return _json_object(to_jsonable_python(value))


class CDPTypes:
    def __init__(
        self,
        custom_commands: CustomCommandRegistrations | None = None,
        custom_events: CustomEventRegistrations | None = None,
        custom_middlewares: CustomMiddlewareRegistrations | None = None,
    ) -> None:
        self.custom_commands: dict[str, ModCDPAddCustomCommandParams] = {}
        self.custom_events: dict[str, ModCDPAddCustomEventObjectParams] = {}
        self.custom_middlewares: list[ModCDPAddMiddlewareParams] = []
        self.event_schemas: dict[str, TypeAdapter[object]] = {}
        self.command_params_schemas: dict[str, TypeAdapter[object]] = {}
        self.command_result_schemas: dict[str, TypeAdapter[object]] = {}
        self.event_classes: dict[str, type[CDPEvent]] = {}
        self._lock = threading.RLock()
        self.hydrateNativeProtocolSchemas()
        for command in DEFAULT_BUILTIN_COMMANDS:
            self.addCustomCommand(command)
        for event in DEFAULT_BUILTIN_EVENTS:
            self.addCustomEvent(event)
        for command in _custom_command_entries(custom_commands):
            self.addCustomCommand(command)
        for event in _custom_event_entries(custom_events):
            self.addCustomEvent({"name": event} if isinstance(event, str) else event)
        for middleware in custom_middlewares or []:
            self.addCustomMiddleware(middleware)

    def update(
        self,
        custom_commands: CustomCommandRegistrations | None = None,
        custom_events: CustomEventRegistrations | None = None,
        custom_middlewares: CustomMiddlewareRegistrations | None = None,
    ) -> "CDPTypes":
        commands = [*self.custom_commands.values(), *_custom_command_entries(custom_commands)]
        events = [*self.custom_events.values(), *_custom_event_entries(custom_events)]
        middlewares = [*self.custom_middlewares, *(custom_middlewares or [])]
        return CDPTypes(commands, events, middlewares)

    def toJSON(self) -> dict[str, object]:
        custom_commands = []
        for command in self.customCommandWireRegistrations():
            command = dict(command)
            command.pop("expression", None)
            custom_commands.append(command)
        custom_middlewares = []
        for middleware in self.customMiddlewareWireRegistrations():
            middleware = dict(middleware)
            middleware.pop("expression", None)
            custom_middlewares.append(middleware)
        return modCDPToJSON(
            self,
            {
                "config": {
                    "custom_commands": custom_commands,
                    "custom_events": self.customEventWireRegistrations(),
                    "custom_middlewares": custom_middlewares,
                },
                "state": {
                    "custom_commands": len(self.custom_commands),
                    "custom_events": len(self.custom_events),
                    "custom_middlewares": len(self.custom_middlewares),
                    "command_params_schemas": len(self.command_params_schemas),
                    "command_result_schemas": len(self.command_result_schemas),
                    "event_schemas": len(self.event_schemas),
                },
            },
        )

    def hydrateNativeProtocolSchemas(self) -> None:
        with self._lock:
            for domain_name, domain_class in vars(generated_cdp).items():
                if not domain_name.endswith("Domain") or not isinstance(domain_class, type):
                    continue
                domain = domain_name.removesuffix("Domain")
                nested_classes = {
                    name: value
                    for name, value in vars(domain_class).items()
                    if isinstance(value, type) and issubclass(value, CDPModel)
                }
                for class_name, params_class in nested_classes.items():
                    if issubclass(params_class, CDPEvent):
                        event_name = getattr(params_class, "cdp_event_name", None)
                        if isinstance(event_name, str):
                            self.event_schemas[event_name] = TypeAdapter(params_class)
                            self.event_classes[event_name] = params_class
                        continue
                    if not class_name.startswith("_") or not class_name.endswith("Params"):
                        continue
                    command_base = class_name[1:-6]
                    result_class = nested_classes.get(f"_{command_base}Result")
                    if result_class is None:
                        continue
                    method = f"{domain}.{command_base[:1].lower()}{command_base[1:]}"
                    if issubclass(params_class, CDPParams):
                        self.command_params_schemas[method] = TypeAdapter(params_class)
                    self.command_result_schemas[method] = TypeAdapter(result_class)

    def prepareCommand(self, method: str, params: object = None, can_register_locally: bool = False) -> CommandPreparation:
        if method == "Mod.addCustomCommand":
            parsed = _ModCDPAddCustomCommand.model_validate(params or {})
            command_registration: ModCDPAddCustomCommandParams = {"name": parsed.name}
            if parsed.expression is not None:
                command_registration["expression"] = parsed.expression
            if parsed.params_schema is not None:
                command_registration["params_schema"] = _json_value(parsed.params_schema)
            if parsed.result_schema is not None:
                command_registration["result_schema"] = _json_value(parsed.result_schema)
            name = self.addCustomCommand(command_registration)
            if not parsed.expression and can_register_locally:
                return CommandPreparation(params={"name": name}, local_result={"name": name, "registered": True}, custom_command_name=name)
            return CommandPreparation(params=self.customCommandWireRegistration(name), custom_command_name=name)
        if method == "Mod.addCustomEvent":
            parsed = _ModCDPAddCustomEvent.model_validate(params or {})
            event_registration: ModCDPAddCustomEventObjectParams = {"name": parsed.name}
            if parsed.event_schema is not None:
                event_registration["event_schema"] = _json_value(parsed.event_schema)
            name = self.addCustomEvent(event_registration)
            if can_register_locally:
                return CommandPreparation(params={"name": name}, local_result={"name": name, "registered": True})
            return CommandPreparation(params=self.customEventWireRegistration(name))
        command_params = self.parseCommandParams(method, params or {})
        if method == "Mod.addMiddleware":
            parsed = _ModCDPAddMiddleware.model_validate(command_params)
            middleware_registration: ModCDPAddMiddlewareParams = {"phase": parsed.phase, "expression": parsed.expression}
            if parsed.name is not None:
                middleware_registration["name"] = parsed.name
            name = self.addCustomMiddleware(middleware_registration)
            if can_register_locally:
                return CommandPreparation(params=command_params, local_result={"name": name, "phase": parsed.phase, "registered": True})
        return CommandPreparation(params=command_params)

    def parseCommandParams(self, method: str, params: object = None) -> ProtocolParams:
        with self._lock:
            adapter = self.command_params_schemas.get(method)
        if adapter is None:
            return _json_object(params or {})
        try:
            validated = adapter.validate_python(params or {}, strict=True)
        except ValidationError as error:
            raise ValueError(f"{method} params did not match params_schema: {error}") from error
        return _model_or_json_object(validated)

    def parseCommandResult(self, method: str, result: object) -> object:
        with self._lock:
            adapter = self.command_result_schemas.get(method)
        if adapter is None:
            return result
        try:
            validated = adapter.validate_python(result, strict=True)
        except ValidationError as error:
            raise ValueError(f"{method} result did not match result_schema: {error}") from error
        if isinstance(validated, BaseModel):
            return _json_object(validated.model_dump(mode="json", exclude_none=True, by_alias=True))
        return to_jsonable_python(validated)

    def parseEventPayload(self, event: str, payload: object = None) -> ProtocolPayload:
        with self._lock:
            adapter = self.event_schemas.get(event)
        if adapter is None:
            return _json_object(payload or {})
        try:
            validated = adapter.validate_python(payload or {}, strict=True)
        except ValidationError as direct_error:
            if not isinstance(payload, Mapping):
                raise ValueError(f"{event} event did not match event_schema: {direct_error}") from direct_error
            payload_mapping = dict(payload)
            if set(payload_mapping.keys()) != {"value"}:
                raise ValueError(f"{event} event did not match event_schema: {direct_error}") from direct_error
            try:
                validated = adapter.validate_python(payload_mapping["value"], strict=True)
            except ValidationError as value_error:
                raise ValueError(f"{event} event did not match event_schema: {value_error}") from value_error
        if isinstance(validated, BaseModel):
            jsonable = _json_value(validated.model_dump(mode="json", exclude_none=True, by_alias=True))
        else:
            jsonable = _json_value(to_jsonable_python(validated))
        return jsonable if isinstance(jsonable, dict) else {"value": jsonable}

    def addCustomCommand(self, registration: ModCDPAddCustomCommandParams | CustomCommandConfig) -> str:
        parsed = _ModCDPAddCustomCommand.model_validate(registration)
        name = normalizeModCDPName(parsed.name)
        if not re.match(r"^[^.]+\.[^.]+$", name):
            raise ValueError("name must be in Domain.method form")
        params_schema = self._adapterFromOptionalSchema(parsed.params_schema, "params_schema")
        result_schema = self._adapterFromOptionalSchema(parsed.result_schema, "result_schema")
        with self._lock:
            if params_schema.adapter is not None:
                self.command_params_schemas[name] = params_schema.adapter
            if result_schema.adapter is not None:
                self.command_result_schemas[name] = result_schema.adapter
            command: ModCDPAddCustomCommandParams = {"name": name}
            if parsed.expression:
                command["expression"] = parsed.expression
            if params_schema.json_schema:
                command["params_schema"] = params_schema.json_schema
            if result_schema.json_schema:
                command["result_schema"] = result_schema.json_schema
            self.custom_commands[name] = command
        return name

    def customCommandWireRegistration(self, name: str) -> dict[str, object]:
        for registration in self.customCommandWireRegistrations():
            if registration["name"] == name:
                return registration
        return {"name": name}

    def customCommandWireRegistrations(self, expression_required: bool = False) -> list[dict[str, object]]:
        registrations: list[dict[str, object]] = []
        with self._lock:
            commands = list(self.custom_commands.values())
        for command in commands:
            expression = command.get("expression")
            if expression_required and not expression:
                continue
            name = normalizeModCDPName(command["name"])
            wire: dict[str, object] = {"name": name}
            if expression is not None:
                wire["expression"] = expression
            params_schema = command.get("params_schema")
            result_schema = command.get("result_schema")
            if isinstance(params_schema, dict):
                wire["params_schema"] = params_schema
            if isinstance(result_schema, dict):
                wire["result_schema"] = result_schema
            registrations.append(wire)
        return registrations

    def addCustomEvent(self, registration: ModCDPAddCustomEventObjectParams | CustomEventConfig) -> str:
        parsed = _ModCDPAddCustomEvent.model_validate(registration)
        name = normalizeModCDPName(parsed.name)
        if not re.match(r"^[^.]+\.[^.]+$", name):
            raise ValueError("name must be in Domain.event form")
        event_schema = self._adapterFromOptionalSchema(parsed.event_schema, "event_schema")
        with self._lock:
            if event_schema.adapter is not None:
                self.event_schemas[name] = event_schema.adapter
            event: ModCDPAddCustomEventObjectParams = {"name": name}
            if event_schema.json_schema:
                event["event_schema"] = event_schema.json_schema
            self.custom_events[name] = event
        return name

    def customEventWireRegistration(self, name: str) -> dict[str, object]:
        event = self.custom_events.get(name)
        if event is None:
            return {"name": name}
        wire: dict[str, object] = {"name": name}
        event_schema = event.get("event_schema")
        if isinstance(event_schema, dict):
            wire["event_schema"] = event_schema
        return wire

    def customEventWireRegistrations(self) -> list[dict[str, object]]:
        return [self.customEventWireRegistration(name) for name in self.custom_events]

    def addCustomMiddleware(self, registration: ModCDPAddMiddlewareParams | CustomMiddlewareConfig) -> str:
        parsed = _ModCDPAddMiddleware.model_validate(registration)
        name = "*" if parsed.name is None or parsed.name == "*" else normalizeModCDPName(parsed.name)
        if name != "*" and "." not in name:
            raise ValueError("name must be '*' or Domain.name form")
        middleware: ModCDPAddMiddlewareParams = {"phase": parsed.phase, "expression": parsed.expression}
        if name != "*":
            middleware["name"] = name
        self.custom_middlewares.append(middleware)
        return name

    def customMiddlewareWireRegistrations(self) -> list[ModCDPAddMiddlewareParams]:
        return list(self.custom_middlewares)

    def customMiddlewareRegistrations(self, phase: str, name: str) -> list[ModCDPAddMiddlewareParams]:
        return [
            middleware
            for middleware in self.custom_middlewares
            if middleware["phase"] == phase and (middleware.get("name") in (None, "*", name))
        ]

    def _adapterFromOptionalSchema(self, schema: object, field_name: str) -> _AdapterRegistration:
        if schema is None:
            return _AdapterRegistration()
        if isinstance(schema, type) and issubclass(schema, BaseModel):
            return _AdapterRegistration(adapter=TypeAdapter(schema), json_schema=schema.model_json_schema())
        if not isinstance(schema, Mapping):
            raise TypeError(f"{field_name} must be a JSON Schema object")
        json_schema = _json_object(schema)
        return _AdapterRegistration(adapter=type_adapter_from_json_schema(json_schema), json_schema=json_schema)


def _custom_command_entries(
    custom_commands: CustomCommandRegistrations | None,
) -> list[ModCDPAddCustomCommandParams]:
    if custom_commands is None:
        return []
    if isinstance(custom_commands, dict):
        entries: list[ModCDPAddCustomCommandParams] = []
        for name, command in _CustomCommandConfigMap.model_validate(custom_commands).root.items():
            entry: ModCDPAddCustomCommandParams = {"name": name}
            if command.expression is not None:
                entry["expression"] = command.expression
            if command.params_schema is not None:
                entry["params_schema"] = command.params_schema
            if command.result_schema is not None:
                entry["result_schema"] = command.result_schema
            entries.append(entry)
        return entries
    return list(custom_commands)


def _custom_event_entries(
    custom_events: CustomEventRegistrations | None,
) -> list[ModCDPAddCustomEventParams]:
    if custom_events is None:
        return []
    if isinstance(custom_events, dict):
        entries: list[ModCDPAddCustomEventParams] = []
        for name, event in _CustomEventConfigMap.model_validate(custom_events).root.items():
            entry: ModCDPAddCustomEventObjectParams = {"name": name}
            if event.event_schema is not None:
                entry["event_schema"] = event.event_schema
            entries.append(entry)
        return entries
    return list(custom_events)
