---
id: REQ-BRK-001
title: Brake application latency
type: requirement
level: system
status: proposed
verification: Test
trace:
  satisfies: [NEED-BRK-01]
  mitigates: [RISK-BRK-OVER-01]
  interfaces: [IF-BUS-CAN-02]
owner: Systems
version: 0.1.0
---

The vehicle control unit shall command hydraulic pressure sufficient to achieve ≥ 6 m/s² deceleration within 250 ms (95th percentile) of brake pedal actuation at 20–120 km/h, on dry asphalt (µ≥0.8), at GVW 2,100–2,300 kg.
