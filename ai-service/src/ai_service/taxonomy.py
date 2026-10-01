"""Triage taxonomy: the categories and engineering teams the model may suggest.

The descriptions are sent to the model in the system prompt. The Literal types
in schemas.py must list exactly the same keys; a test enforces that.
"""

IMPACT_GUIDE = {
    "high": (
        "many users or a core business function cannot work, data is lost or corrupted, "
        "there is a security exposure, or production is down"
    ),
    "medium": (
        "a significant feature is degraded or a subset of users is affected; a workaround may exist"
    ),
    "low": (
        "a cosmetic problem, a minor inconvenience, a single user, a question, or a feature request"
    ),
}

URGENCY_GUIDE = {
    "high": (
        "an active outage or ongoing harm, a business-critical deadline, or a security incident"
    ),
    "medium": "needs attention within days; a workaround exists but is costly",
    "low": "can wait for normal scheduling",
}

# Functional area of the problem, independent of the issue type (bug, question,
# feature request, incident) that the client already chose.
CATEGORIES: dict[str, str] = {
    "authentication_access": "login, passwords, sessions, roles, permissions, account access",
    "notifications": "push notifications, emails, SMS or in-app alerts not sent, late or wrong",
    "data_integrity": "wrong, missing, duplicated or corrupted data; calculation or sync errors",
    "performance": "slowness, timeouts, high resource usage, degraded responsiveness",
    "ui_display": "layout, rendering, formatting, text, currency or localisation defects",
    "crash_error": "app crashes, freezes, error screens, unhandled exceptions",
    "file_handling": "uploads, downloads, attachments, file imports and exports",
    "integrations": "third-party services, external APIs, payment gateways, other systems",
    "reporting_analytics": "dashboards, reports, charts and analytics results",
    "other": "anything that fits none of the categories above",
}

# Engineering teams (assignment groups) that can own an issue.
TEAMS: dict[str, str] = {
    "mobile": (
        "iOS and Android apps: app screens, device-specific behaviour, "
        "push notification handling on devices, app store builds"
    ),
    "web_frontend": "browser-based web apps and dashboards: pages, forms, client-side behaviour",
    "backend": (
        "APIs, business logic, databases, authentication services, background jobs, "
        "integrations with external services"
    ),
    "data_platform": (
        "data pipelines, ETL, analytics processing, scientific or bioinformatics workflows"
    ),
    "infrastructure": (
        "hosting, deployments, networking, certificates, monitoring, platform-wide outages"
    ),
    "support": (
        "how-to questions and account administration that need guidance rather than code changes"
    ),
}
