"""Convert Pydantic models into the JSON Schema subset LLM providers accept.

Providers support only part of JSON Schema. Gemini's documented subset lacks
string length limits, for example, and unsupported keywords can make a request
fail. So the schema sent to the provider keeps only widely supported keywords
and inlines $ref definitions. The full Pydantic model still validates the
response afterwards, so dropping a keyword here never weakens validation.
"""

from typing import Any

from pydantic import BaseModel

_ALLOWED_KEYWORDS = frozenset(
    {
        "type",
        "title",
        "description",
        "enum",
        "properties",
        "required",
        "items",
        "minItems",
        "maxItems",
        "minimum",
        "maximum",
        "anyOf",
        "additionalProperties",
    }
)


def to_provider_schema(model: type[BaseModel]) -> dict[str, Any]:
    raw = model.model_json_schema()
    definitions: dict[str, Any] = raw.get("$defs", {})

    def convert(node: Any) -> Any:
        if not isinstance(node, dict):
            return node
        if "$ref" in node:
            target = definitions[node["$ref"].rsplit("/", 1)[-1]]
            # A description next to a $ref (from Field(description=...)) is kept
            merged = {**target, **{k: v for k, v in node.items() if k != "$ref"}}
            return convert(merged)
        result: dict[str, Any] = {}
        for key, value in node.items():
            if key not in _ALLOWED_KEYWORDS:
                continue
            if key == "properties":
                result[key] = {name: convert(prop) for name, prop in value.items()}
            elif key in ("items", "additionalProperties") and isinstance(value, dict):
                result[key] = convert(value)
            elif key == "anyOf":
                result[key] = [convert(option) for option in value]
            else:
                result[key] = value
        return result

    converted: dict[str, Any] = convert(raw)
    return converted
