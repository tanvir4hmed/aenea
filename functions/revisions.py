"""Pure freshness checks shared by policy, execution and read-side reporting."""


def current_assessment(summary, assessment):
    return bool(assessment and assessment.get("evidence_revision") is not None
                and summary.get("event_count") == assessment["evidence_revision"]
                and summary.get("latest_assessment") == assessment.get("assessment_id"))


def actionable(summary, assessment):
    return (current_assessment(summary, assessment) and assessment.get("status") == "assessed"
            and summary.get("decision_review") != "rejected")
