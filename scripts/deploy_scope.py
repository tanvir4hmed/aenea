"""Pure deployment dependency selection; importing this module never contacts AWS."""

from collections.abc import Sequence
from dataclasses import dataclass

FUNCTIONS = frozenset(
    {
        "ingest",
        "correlate",
        "incident_api",
        "invoke_reasoner",
        "policy",
        "action_executor",
        "mcp_tools",
        "mcp_proxy",
        "cleanup",
        "simulation_worker",
    }
)


@dataclass(frozen=True)
class DeploymentScope:
    web: bool
    layers: frozenset[str]
    functions: frozenset[str]
    workflow: bool
    reasoner: bool
    mcp: bool

    @property
    def packages(self) -> frozenset[str]:
        return FUNCTIONS if "app" in self.layers else self.functions


def select_scope(paths: Sequence[str], selected: str = "") -> DeploymentScope:
    """Preserve runner selection, including infrastructure dependency propagation."""
    deployment_changed = any(
        p.startswith("scripts/") or p == ".github/workflows/deploy.yml" for p in paths
    ) and not any(
        p.startswith(
            (
                "apps/web/",
                "functions/",
                "shared/",
                "infra/",
                "services/mcp/",
                "agent/reasoner/",
                "workflows/",
            )
        )
        for p in paths
    )
    all_components = selected == "all" or (not paths and not selected)
    web = (
        all_components
        or selected == "web"
        or any(p.startswith("apps/web/") or p == "functions/house_layout.json" for p in paths)
    )
    infra_all = all_components or selected == "infrastructure" or deployment_changed
    mcp = (
        infra_all
        or selected == "mcp"
        or any(p.startswith(("services/mcp/", "infra/mcp/", "infra/platform/")) for p in paths)
    )
    reasoner = (
        infra_all
        or selected == "reasoner"
        or any(p.startswith(("agent/reasoner/", "infra/reasoner/", "shared/")) for p in paths)
    )
    domain = infra_all or selected == "domain" or any(p.startswith("infra/tls/") for p in paths)
    layers = {
        layer
        for layer in ("data", "platform", "app")
        if infra_all or selected == layer or any(p.startswith(f"infra/{layer}/") for p in paths)
    }
    if domain:
        layers.add("platform")
    if "data" in layers or "platform" in layers:
        layers.add("app")
    functions = (
        set(FUNCTIONS)
        if all_components or deployment_changed or selected == "backend"
        else {name for name in FUNCTIONS if any(p.startswith(f"functions/{name}/") for p in paths)}
    )
    if any(
        (p.startswith("functions/") and p.count("/") == 1) or p.startswith("shared/") for p in paths
    ):
        functions = set(FUNCTIONS)
    workflow = selected == "backend" or any(p.startswith("workflows/") for p in paths)
    return DeploymentScope(web, frozenset(layers), frozenset(functions), workflow, reasoner, mcp)
