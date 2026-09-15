# ROI model

The framework targets three measurable outcomes: less repetitive review, fewer escaped regressions, and evidence-based model selection.

## Manual review example

Assume 500 responses per release, three minutes of review per response, four releases per month and a loaded QA cost of USD 20/hour:

- Manual effort: `500 × 3 × 4 / 60 = 100 hours/month`
- Manual cost: `100 × $20 = $2,000/month`
- At 80% automation, remaining review is 20 hours/month
- If evaluation APIs cost $100/month, illustrative net saving is `$1,500/month`

These are assumptions, not guaranteed savings. Teams should replace them with observed review time, automation rate, provider cost and false-positive/false-negative cost.

## Model selection example

Run the same reviewed suite against candidate models and compare quality, latency and known token cost. A cheaper model is acceptable only while critical cases pass and category regression stays within policy. Unknown cost is reported as unknown, never zero.

## Decision formula

`ROI = (avoided review cost + avoided incident cost + model savings - framework cost) / framework cost`

Track the inputs per release so the business case can be audited rather than inferred from a single aggregate score.
