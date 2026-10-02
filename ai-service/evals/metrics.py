"""Metric functions. Pure, so they're unit tested without any model calls."""

from collections import Counter
from collections.abc import Sequence


def accuracy(predicted: Sequence[str | None], gold: Sequence[str]) -> float:
    """Share of exact matches. A missing prediction (failed call) counts as wrong."""
    _same_length(predicted, gold)
    if not gold:
        raise ValueError("no cases")
    return sum(p == g for p, g in zip(predicted, gold, strict=True)) / len(gold)


def majority_label(gold: Sequence[str]) -> str:
    """The most common label; ties go to the label seen first."""
    counts = Counter(gold)
    best = max(counts.values())
    return next(label for label in gold if counts[label] == best)


def majority_baseline(gold: Sequence[str]) -> float:
    """Accuracy of always answering the most common label.

    Optimistic: it peeks at the test labels to choose that answer.
    """
    label = majority_label(gold)
    return accuracy([label] * len(gold), gold)


def cohen_kappa(a: Sequence[str | None], b: Sequence[str]) -> float:
    """Agreement between two raters, corrected for agreement expected by chance.

    1 = perfect agreement, 0 = no better than chance, negative = worse than
    chance. A missing prediction is its own category, so it counts against
    agreement rather than being dropped.
    """
    _same_length(a, b)
    n = len(b)
    if n == 0:
        raise ValueError("no cases")
    first = ["<none>" if x is None else x for x in a]
    observed = sum(x == y for x, y in zip(first, b, strict=True)) / n
    count_a, count_b = Counter(first), Counter(b)
    expected = sum(count_a[label] * count_b[label] for label in count_a) / (n * n)
    if expected == 1:
        # Both raters used a single identical label throughout
        return 1.0
    return (observed - expected) / (1 - expected)


def mean_absolute_error(predicted: Sequence[int], gold: Sequence[int]) -> float:
    _same_length(predicted, gold)
    if not gold:
        raise ValueError("no cases")
    return sum(abs(p - g) for p, g in zip(predicted, gold, strict=True)) / len(gold)


def within(predicted: Sequence[int], gold: Sequence[int], tolerance: int) -> float:
    _same_length(predicted, gold)
    if not gold:
        raise ValueError("no cases")
    hits = sum(abs(p - g) <= tolerance for p, g in zip(predicted, gold, strict=True))
    return hits / len(gold)


def recall_at_k(ranked: Sequence[str], relevant: Sequence[str], k: int) -> float:
    """Share of the relevant items that appear in the first k results."""
    if not relevant:
        raise ValueError("recall is undefined without relevant items")
    top = set(ranked[:k])
    return sum(item in top for item in relevant) / len(relevant)


def reciprocal_rank(ranked: Sequence[str], relevant: Sequence[str]) -> float:
    """1 / position of the first relevant result; 0 if none is returned."""
    wanted = set(relevant)
    for position, item in enumerate(ranked, start=1):
        if item in wanted:
            return 1 / position
    return 0.0


def mean(values: Sequence[float]) -> float:
    if not values:
        raise ValueError("no values")
    return sum(values) / len(values)


def _same_length(a: Sequence[object], b: Sequence[object]) -> None:
    if len(a) != len(b):
        raise ValueError(f"length mismatch: {len(a)} vs {len(b)}")
