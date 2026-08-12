"""A minimal in-memory stand-in for the ``boto3`` ``dynamodb`` client.

Covers exactly the surface :mod:`promptatron.worker.ddb` uses -- ``put_item``,
``update_item`` (``SET`` only), ``get_item``, and ``query`` by ``pk`` +
``begins_with(sk, ...)`` -- and nothing else. Deliberately hand-rolled rather
than reached for via ``moto``: the writer's job is to produce a specific set of
AttributeValue dicts, so tests that assert on the *stored items* are testing the
contract, and a fake that stores what it is given (instead of round-tripping
through a real implementation) keeps that assertion honest and dependency-free.

What it does *not* model: consistency, capacity, transactions, or any expression
syntax beyond what the writer emits. If the writer grows an ``ADD``/``REMOVE``
clause or a filter expression, this fake will raise rather than quietly lie.
"""

from __future__ import annotations

import re
from typing import Any


class ConditionalCheckFailedException(Exception):
    """Look-alike for botocore's error of the same name.

    ``promptatron.worker.ddb`` matches on ``response.Error.Code`` (with a class
    name fallback), so carrying the code is enough for it to be recognised.
    """

    def __init__(self, message: str = "The conditional request failed") -> None:
        super().__init__(message)
        self.response = {"Error": {"Code": "ConditionalCheckFailedException", "Message": message}}


class FakeDynamoDBClient:
    """In-memory table keyed by ``(pk, sk)``, preserving insertion order."""

    def __init__(self) -> None:
        #: ``{(pk, sk): item}`` where ``item`` is the raw AttributeValue dict.
        self.items: dict[tuple[str, str], dict[str, Any]] = {}
        #: Every call made, as ``(operation, kwargs)`` -- lets tests assert on
        #: write *ordering*, which several of the contract's rules are about.
        self.calls: list[tuple[str, dict[str, Any]]] = []
        #: Operation names that should raise on their next invocation.
        self.fail_on: dict[str, Exception] = {}

    # -- helpers ----------------------------------------------------------- #

    @staticmethod
    def _key_of(item_or_key: dict[str, Any]) -> tuple[str, str]:
        return (item_or_key["pk"]["S"], item_or_key["sk"]["S"])

    def _maybe_fail(self, operation: str) -> None:
        exc = self.fail_on.pop(operation, None)
        if exc is not None:
            raise exc

    def item(self, pk: str, sk: str) -> dict[str, Any] | None:
        """The stored item at ``(pk, sk)``, or ``None``."""
        return self.items.get((pk, sk))

    def items_with_prefix(self, pk: str, sk_prefix: str) -> list[dict[str, Any]]:
        """Items in partition ``pk`` whose ``sk`` starts with ``sk_prefix``.

        Returned in ``sk`` lexicographic order -- the same order a real
        ``Query`` with ``ScanIndexForward=True`` produces, which is what makes
        the zero-padding assertions meaningful.
        """
        matched = [
            item
            for (item_pk, item_sk), item in self.items.items()
            if item_pk == pk and item_sk.startswith(sk_prefix)
        ]
        return sorted(matched, key=lambda item: item["sk"]["S"])

    def operations(self) -> list[str]:
        """Just the operation names, in call order."""
        return [name for name, _ in self.calls]

    # -- the client surface ------------------------------------------------ #

    def put_item(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("put_item", kwargs))
        self._maybe_fail("put_item")
        item = kwargs["Item"]
        key = self._key_of(item)
        condition = kwargs.get("ConditionExpression")
        if condition == "attribute_not_exists(pk)" and key in self.items:
            raise ConditionalCheckFailedException()
        if condition is not None and condition != "attribute_not_exists(pk)":
            raise NotImplementedError(f"unsupported ConditionExpression: {condition!r}")
        self.items[key] = dict(item)
        return {}

    def get_item(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("get_item", kwargs))
        self._maybe_fail("get_item")
        item = self.items.get(self._key_of(kwargs["Key"]))
        return {"Item": dict(item)} if item is not None else {}

    def update_item(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(("update_item", kwargs))
        self._maybe_fail("update_item")
        key = self._key_of(kwargs["Key"])
        existing = self.items.get(key)
        if existing is None:
            raise KeyError(f"update_item on a missing item: {key}")

        names = kwargs.get("ExpressionAttributeNames", {})
        values = kwargs.get("ExpressionAttributeValues", {})
        expression = kwargs["UpdateExpression"].strip()

        condition = kwargs.get("ConditionExpression")
        if condition is not None and not self._condition_holds(
            condition, existing, names, values
        ):
            raise ConditionalCheckFailedException()

        if not expression.upper().startswith("SET "):
            raise NotImplementedError(f"only SET is modelled: {expression!r}")

        updated = dict(existing)
        for assignment in expression[4:].split(","):
            target, _, source = assignment.partition("=")
            attribute = names.get(target.strip(), target.strip())
            updated[attribute] = values[source.strip()]
        self.items[key] = updated
        return {}

    def query(self, **kwargs: Any) -> dict[str, Any]:
        """Only the ``pk = :pk AND begins_with(sk, :prefix)`` form the reader uses."""
        self.calls.append(("query", kwargs))
        self._maybe_fail("query")
        values = kwargs.get("ExpressionAttributeValues", {})
        expression = kwargs["KeyConditionExpression"]
        match = re.fullmatch(
            r"\s*pk\s*=\s*(:\w+)\s+AND\s+begins_with\(\s*sk\s*,\s*(:\w+)\s*\)\s*", expression
        )
        if match is None:
            raise NotImplementedError(f"unsupported KeyConditionExpression: {expression!r}")
        pk = values[match.group(1)]["S"]
        prefix = values[match.group(2)]["S"]
        found = self.items_with_prefix(pk, prefix)
        return {"Items": found, "Count": len(found)}

    # -- conditions -------------------------------------------------------- #

    @staticmethod
    def _condition_holds(
        condition: str,
        item: dict[str, Any],
        names: dict[str, str],
        values: dict[str, Any],
    ) -> bool:
        """Evaluate the two condition forms ``ddb.py`` actually emits."""
        condition = condition.strip()
        if condition == "attribute_not_exists(pk)":
            return "pk" not in item
        match = re.fullmatch(
            r"attribute_not_exists\((#?\w+)\)\s+OR\s+(#?\w+)\s*=\s*(:\w+)", condition
        )
        if match is None:
            raise NotImplementedError(f"unsupported ConditionExpression: {condition!r}")
        attribute = names.get(match.group(1), match.group(1))
        compared = names.get(match.group(2), match.group(2))
        return attribute not in item or item[compared] == values[match.group(3)]
