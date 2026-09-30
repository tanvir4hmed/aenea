# Event pipeline

Command Center starts a saved simulation run. The cloud scheduler sends state changes and configured repeats through the same ingestion core used by direct simulation inputs. Only simulated producers are enabled today; native device connectivity is not claimed.

Ingress validates ownership, catalog capabilities, location, state and retry identity. Automatic assignment creates or joins an open incident within validated location/hazard boundaries. Optional explicit incident selection remains supported. Evidence is stored privately, then EventBridge and Step Functions coordinate correlation, assessment, policy and permitted virtual actions.

Accepted events are durable evidence; bounded model context is not an incident lifetime cap. Same-ID retries cannot spend another simulation allowance or duplicate a recorded action. New distinct state reports can update the same device repeatedly. Human resolution is separate from clearing a device or stopping its simulation.

A 202 response means published, not assessed. Browser polling displays actual stored progress and outcomes. Simulation limits pause synthetic generation visibly and do not resolve incidents. Future real adapters must bypass simulator accounting without bypassing validation or policy.

See [event contract](event-contract.md), [automatic incidents](automatic-incidents.md), [state-driven coordination](state-driven-coordination.md) and [source verification](source-verification.md) for implementation boundaries and remaining hosted checks.
