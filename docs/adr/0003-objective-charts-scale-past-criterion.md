# Objective charts scale past criterion

A percentage chart with a fixed 100% ceiling is the obvious build, and it doubled usefully
as the criterion line — "at the top means she met the goal". But scores genuinely exceed
criterion (five trials against a target of four is 125%), and such a point computed to a
negative `y`, so the SVG clipped it away entirely. The clinician's best session was the one
that disappeared.

We decided the ceiling rises to the highest datapoint and a dashed gridline is drawn at
100%, so the true value stays visible and "met the goal" survives as an explicit line rather
than as the top edge.

## Consequences

The vertical scale now moves when a new high lands, so the same objective's chart is not
directly comparable between two viewings — the dashed criterion line is what stays fixed and
carries the meaning. Do not "simplify" the ceiling back to a constant 100.
