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

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter, ValidationError
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
    ProtocolParams,
    ProtocolPayload,
    ProtocolResult,
)

JsonSchema: TypeAlias = dict[str, JsonValue]


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
    params: ProtocolParams
    local_result: ProtocolResult | None = None
    custom_command_name: str | None = None


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
        custom_commands: Sequence[ModCDPAddCustomCommandParams] | None = None,
        custom_events: Sequence[ModCDPAddCustomEventParams] | None = None,
        custom_middlewares: Sequence[ModCDPAddMiddlewareParams] | None = None,
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
        self.addCustomCommand({"name": "Mod.ping"})
        self.addCustomCommand({"name": "Mod.configure"})
        self.addCustomCommand({"name": "Mod.evaluate"})
        self.addCustomCommand({"name": "Mod.getTopology"})
        self.addCustomCommand({"name": "Mod.addCustomCommand"})
        self.addCustomCommand({"name": "Mod.addCustomEvent"})
        self.addCustomCommand({"name": "Mod.addMiddleware"})
        self.addCustomEvent({"name": "Mod.pong"})
        for command in custom_commands or []:
            self.addCustomCommand(command)
        for event in custom_events or []:
            self.addCustomEvent({"name": event} if isinstance(event, str) else event)
        for middleware in custom_middlewares or []:
            self.addCustomMiddleware(middleware)

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
            if not isinstance(payload, Mapping) or set(payload.keys()) != {"value"}:
                raise ValueError(f"{event} event did not match event_schema: {direct_error}") from direct_error
            try:
                validated = adapter.validate_python(payload["value"], strict=True)
            except ValidationError as value_error:
                raise ValueError(f"{event} event did not match event_schema: {value_error}") from value_error
        if isinstance(validated, BaseModel):
            jsonable = _json_value(validated.model_dump(mode="json", exclude_none=True, by_alias=True))
        else:
            jsonable = _json_value(to_jsonable_python(validated))
        return jsonable if isinstance(jsonable, dict) else {"value": jsonable}

    def addCustomCommand(self, registration: ModCDPAddCustomCommandParams) -> str:
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

    def customCommandWireRegistration(self, name: str) -> ProtocolParams:
        for registration in self.customCommandWireRegistrations():
            if registration["name"] == name:
                return registration
        return {"name": name}

    def customCommandWireRegistrations(self, expression_required: bool = False) -> list[ProtocolParams]:
        registrations: list[ProtocolParams] = []
        with self._lock:
            commands = list(self.custom_commands.values())
        for command in commands:
            expression = command.get("expression")
            if expression_required and not expression:
                continue
            name = normalizeModCDPName(command["name"])
            wire: dict[str, JsonValue] = {"name": name}
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

    def addCustomEvent(self, registration: ModCDPAddCustomEventObjectParams) -> str:
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

    def customEventWireRegistration(self, name: str) -> ProtocolParams:
        event = self.custom_events.get(name)
        if event is None:
            return {"name": name}
        wire: dict[str, JsonValue] = {"name": name}
        event_schema = event.get("event_schema")
        if isinstance(event_schema, dict):
            wire["event_schema"] = event_schema
        return wire

    def customEventWireRegistrations(self) -> list[ProtocolParams]:
        return [self.customEventWireRegistration(name) for name in self.custom_events]

    def addCustomMiddleware(self, registration: ModCDPAddMiddlewareParams) -> str:
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
