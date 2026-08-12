"""An in-memory stand-in for a ``boto3`` DynamoDB *resource* ``Table``.

Covers the surface the server side uses -- ``get_item`` / ``put_item`` /
``delete_item`` / ``query`` -- and really evaluates the
``boto3.dynamodb.conditions.Key`` expressions the readers build, so key schema
and query shape are under test rather than mocked away. Nothing here reaches
AWS.

Shared by the cloud-lane tests (which read items the worker wrote) and the
history-backend contract suite (which reads items the server itself wrote), for
the same reason the production code shares
:mod:`promptatron.store.ddb_items`: one table double, one set of item shapes.

What it does *not* model: consistency, capacity, transactions, projections, or
any condition/update expression -- the server-side code uses none of those.
"""

from __future__ import annotations

from typing import Any

from promptatron.store.ddb_items import GSI1_PK, GSI1_SK


def matches(condition: Any, item: dict[str, Any]) -> bool:
    """Evaluate a real ``boto3.dynamodb.conditions`` key condition against an item."""
    expression = condition.get_expression()
    operator = expression["operator"]
    values = expression["values"]
    if operator == "AND":
        return all(matches(value, item) for value in values)
    actual = item.get(values[0].name)
    if operator == "=":
        return actual == values[1]
    if operator == "begins_with":
        return isinstance(actual, str) and actual.startswith(values[1])
    if operator == "BETWEEN":
        return actual is not None and values[1] <= actual <= values[2]
    raise AssertionError(f"unsupported key operator {operator!r}")


class FakeTable:
    """The subset of the DynamoDB resource Table API the server actually uses."""

    def __init__(self, items: list[dict[str, Any]] | None = None) -> None:
        self.items: list[dict[str, Any]] = [dict(item) for item in (items or [])]
        self.puts: list[dict[str, Any]] = []
        self.deletes: list[dict[str, Any]] = []

    # -- seeding ---------------------------------------------------------- #

    def add(self, *items: dict[str, Any]) -> None:
        for item in items:
            self.items = [
                existing
                for existing in self.items
                if (existing["pk"], existing["sk"]) != (item["pk"], item["sk"])
            ]
            self.items.append(dict(item))

    # -- the API ---------------------------------------------------------- #

    def get_item(self, Key: dict[str, str]) -> dict[str, Any]:  # noqa: N803 - boto3 spelling
        for item in self.items:
            if item["pk"] == Key["pk"] and item["sk"] == Key["sk"]:
                return {"Item": dict(item)}
        return {}

    def put_item(self, Item: dict[str, Any]) -> dict[str, Any]:  # noqa: N803 - boto3 spelling
        self.add(Item)
        self.puts.append(dict(Item))
        return {}

    def delete_item(self, Key: dict[str, str]) -> dict[str, Any]:  # noqa: N803 - boto3 spelling
        self.deletes.append(dict(Key))
        self.items = [
            item
            for item in self.items
            if (item["pk"], item["sk"]) != (Key["pk"], Key["sk"])
        ]
        return {}

    def query(  # noqa: N803 - boto3 spelling
        self,
        KeyConditionExpression: Any,
        IndexName: str | None = None,
        ScanIndexForward: bool = True,
        Limit: int | None = None,
        ExclusiveStartKey: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        if IndexName is not None:
            rows = [item for item in self.items if GSI1_PK in item]

            def sort_key(item: dict[str, Any]) -> tuple[str, str]:
                return (str(item[GSI1_SK]), str(item["pk"]))
        else:
            rows = list(self.items)

            def sort_key(item: dict[str, Any]) -> tuple[str, str]:
                return (str(item["pk"]), str(item["sk"]))

        rows = [item for item in rows if matches(KeyConditionExpression, item)]
        rows.sort(key=sort_key, reverse=not ScanIndexForward)

        if ExclusiveStartKey is not None:
            keys = [sort_key(item) for item in rows]
            start = sort_key(ExclusiveStartKey)
            assert start in keys, "ExclusiveStartKey must name a real row"
            rows = rows[keys.index(start) + 1 :]

        response: dict[str, Any] = {}
        if Limit is not None and len(rows) > Limit:
            rows = rows[:Limit]
            last = rows[-1]
            response["LastEvaluatedKey"] = {
                "pk": last["pk"],
                "sk": last["sk"],
                GSI1_PK: last.get(GSI1_PK),
                GSI1_SK: last.get(GSI1_SK),
            }
        response["Items"] = [dict(item) for item in rows]
        return response
