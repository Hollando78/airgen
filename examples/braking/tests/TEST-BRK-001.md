---
id: TEST-BRK-001
type: testcase
title: Measure deceleration latency
verifies: [REQ-BRK-001]
---

1. Accelerate to 80 km/h on dry asphalt (µ≥0.8).
2. Apply 80 N pedal force.
3. Measure time to achieve ≥ 6 m/s² deceleration.
4. Pass if ≤ 250 ms (95th percentile across 20 trials).
