"""Provider-neutral boundary. No credentials or provider model aliases are persisted."""
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Protocol

@dataclass(frozen=True)
class EngineConfig:
    model: str
    reasoning_effort: str
    timeout_seconds: float = 120

@dataclass(frozen=True)
class AgentDirectories:
    inputs: Path
    work: Path
    outputs: Path
    def prepare(self):
        roots = [p.resolve() for p in (self.inputs, self.work, self.outputs)]
        if len(set(roots)) != 3 or any(a in b.parents for a in roots for b in roots if a != b):
            raise ValueError('Agent directories must be distinct and non-overlapping')
        for root in roots: root.mkdir(parents=True, exist_ok=True)

@dataclass(frozen=True)
class EngineRequest:
    prompt: str
    response_schema: dict[str, Any]
    directories: AgentDirectories
    allow_search: bool = False
    search_domains: tuple[str, ...] = ()

@dataclass(frozen=True)
class EngineResult:
    data: dict[str, Any]
    provider: str
    model: str

class Engine(Protocol):
    mode: str
    model: str
    def execute(self, request: EngineRequest) -> EngineResult: ...
    def probe(self) -> dict[str, Any]: ...
