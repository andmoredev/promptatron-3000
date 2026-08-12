"""Resolve the four settings that can either be set by hand or discovered.

``config_api_url``, ``config_api_key``, ``eval_table`` and ``eval_runtime_arn``
each have three possible states: set explicitly (env var or constructor kwarg),
discovered from the deployed CloudFormation stack (see
:mod:`promptatron.stack_discovery`), or unconfigured. Precedence is explicit
first, discovered second, unconfigured last -- applied independently per field,
so e.g. an explicit ``config_api_key`` alongside a discovered ``config_api_url``
is perfectly normal (a rotated key kept local, everything else auto-discovered).

Every consumer of these four fields should go through this module instead of
reading ``settings.config_api_url`` etc. directly -- that's what makes
discovery lazy (nothing here runs until a value is actually asked for) and
keeps :class:`~promptatron.config.Settings` itself a plain, unmutated env
snapshot that ``get_settings()`` can keep caching and tests can keep
constructing directly.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from promptatron.config import Settings
from promptatron.stack_discovery import StackConfig, discover

Source = Literal["env", "stack"] | None

#: The Settings attribute name <-> StackConfig attribute name pairs. Both
#: dataclasses use the same field names by design, but this keeps the mapping
#: explicit rather than assumed.
_FIELDS = ("config_api_url", "config_api_key", "eval_table", "eval_runtime_arn")


@dataclass(frozen=True)
class Resolved:
    """A resolved value plus where it came from (``None`` iff ``value`` is)."""

    value: str | None
    source: Source


_UNRESOLVED = Resolved(None, None)


def _stack_config(settings: Settings) -> StackConfig:
    """Discovery, skipped entirely once every field is already set explicitly."""
    if all(getattr(settings, field) for field in _FIELDS):
        return StackConfig()
    return discover(settings)


def _resolve(settings: Settings, field: str) -> Resolved:
    explicit = getattr(settings, field)
    if explicit:
        return Resolved(explicit, "env")
    discovered = getattr(_stack_config(settings), field)
    if discovered:
        return Resolved(discovered, "stack")
    return _UNRESOLVED


def config_api_url(settings: Settings) -> Resolved:
    return _resolve(settings, "config_api_url")


def config_api_key(settings: Settings) -> Resolved:
    return _resolve(settings, "config_api_key")


def eval_table(settings: Settings) -> Resolved:
    return _resolve(settings, "eval_table")


def eval_runtime_arn(settings: Settings) -> Resolved:
    return _resolve(settings, "eval_runtime_arn")


def cloud_evals_source(settings: Settings) -> Source:
    """The single ``source`` reported for the cloud-evals health block.

    The lane needs *both* ``eval_runtime_arn`` and ``eval_table``, so there is
    no single source when it isn't fully configured. When both are present and
    agree, that's the source; a mix (one overridden by hand, the other
    discovered) is reported as ``"env"`` since that's the more accurate
    "you have manually touched this" signal.
    """
    arn = eval_runtime_arn(settings)
    table = eval_table(settings)
    if arn.value is None or table.value is None:
        return None
    if arn.source == table.source:
        return arn.source
    return "env"
