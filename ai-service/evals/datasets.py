"""Typed loaders for the labelled eval data in evals/data.

Labels use the service's own Literal types, so a label the model could never
produce (a typo, a removed category) fails loading instead of silently
counting as a miss.
"""

import json
from pathlib import Path
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from ai_service.schemas import Category, IssueType, Level, Sentiment, Team

DATA_DIR = Path(__file__).parent / "data"


class _Row(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class Product(_Row):
    name: str
    description: str
    # The team you would guess knowing only the product: the routing baseline
    default_team: Team


class TriageLabel(_Row):
    impact: Level
    urgency: Level
    category: Category
    team: Team


class ClientChoice(_Row):
    """What the client picked on the issue form: the baseline for impact and urgency."""

    impact: Level
    urgency: Level


class TriageCase(_Row):
    id: str
    product: str
    issue_type: IssueType
    title: str
    description: str
    client_choice: ClientChoice
    label: TriageLabel


class SentimentLabel(_Row):
    sentiment: Sentiment
    frustration_level: int = Field(ge=1, le=5)
    escalation_risk: Level


class SentimentCase(_Row):
    id: str
    issue_title: str
    comment: str
    label: SentimentLabel


class CorpusDocument(_Row):
    issue_id: int
    company_id: int
    product_id: int
    ticket_number: str
    title: str
    problem: str
    resolution: str


class RetrievalQuery(_Row):
    id: str
    company_id: int
    title: str
    description: str
    # Tickets a good search returns. Empty: this company has no relevant history.
    relevant: list[str]


class RetrievalSet(_Row):
    corpus: list[CorpusDocument]
    queries: list[RetrievalQuery]


class Forbidden(_Row):
    """Output values that would mean the attack worked."""

    impact: Level | None = None
    urgency: Level | None = None
    category: Category | None = None
    team: Team | None = None
    sentiment: Sentiment | None = None
    escalation_risk: Level | None = None


class PastIssue(_Row):
    ticket_number: str
    title: str
    problem: str
    resolution: str


class ResolutionQuery(_Row):
    issue_type: IssueType
    title: str
    description: str


class InjectionCase(_Row):
    id: str
    target: Literal["analyze", "sentiment", "resolution"]
    attack: str
    # analyze
    product: str | None = None
    issue_type: IssueType | None = None
    title: str | None = None
    description: str | None = None
    # sentiment
    issue_title: str | None = None
    comment: str | None = None
    # resolution
    query: ResolutionQuery | None = None
    past_issues: list[PastIssue] = []
    # What success for the attacker looks like
    forbidden: Forbidden = Forbidden()
    max_frustration: int | None = Field(default=None, ge=1, le=5)
    min_frustration: int | None = Field(default=None, ge=1, le=5)
    forbidden_substrings: list[str] = []


def _jsonl[T: BaseModel](name: str, model: type[T]) -> list[T]:
    path = DATA_DIR / name
    rows = [
        model.model_validate_json(line)
        for line in path.read_text(encoding="utf-8").splitlines()
        if line.strip()
    ]
    ids = [getattr(row, "id", None) for row in rows]
    if len(ids) != len(set(ids)):
        raise ValueError(f"{name}: duplicate ids")
    return rows


def load_products() -> dict[str, Product]:
    raw = json.loads((DATA_DIR / "products.json").read_text(encoding="utf-8"))
    return {key: Product.model_validate(value) for key, value in raw.items()}


def load_triage() -> list[TriageCase]:
    return _jsonl("triage.jsonl", TriageCase)


def load_sentiment() -> list[SentimentCase]:
    return _jsonl("sentiment.jsonl", SentimentCase)


def load_injection() -> list[InjectionCase]:
    return _jsonl("injection.jsonl", InjectionCase)


def load_retrieval() -> RetrievalSet:
    return RetrievalSet.model_validate_json(
        (DATA_DIR / "retrieval.json").read_text(encoding="utf-8")
    )
