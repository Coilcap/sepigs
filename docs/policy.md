# Policy And Active Probing

Routing rules return a tag. The tag may be a real outbound or a policy.

Policy types:

- `loadBalance`: chooses a candidate by `roundRobin`, `leastLatency`, or `random`.
- `failover`: tries healthy candidates in configured order, then unhealthy candidates if needed.

`ActiveProber` can feed real probe results into `RoutingPolicyManager`.

Safety properties:

- Max concurrency is bounded.
- Probe budget per interval is bounded.
- Probe timeout is bounded.
- Failures use exponential backoff.
- Probing runs outside real request handling and does not block user traffic.

Future work:

- Build default probe functions for each outbound type.
- Add jittered scheduling.
- Persist health across reloads.
