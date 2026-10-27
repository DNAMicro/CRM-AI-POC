import type { Activity } from "@/types/crm";

export const activities: Activity[] = [
  { id: "a1", type: "call", contactId: "c1", dealId: "d1", description: "Discussed contract terms with Sarah. She wants to finalize by mid-April.", timestamp: "2026-03-28T10:00:00Z" },
  { id: "a2", type: "email", contactId: "c2", dealId: "d2", description: "Sent updated proposal to Marcus including volume pricing.", timestamp: "2026-03-30T14:30:00Z" },
  { id: "a3", type: "meeting", contactId: "c4", dealId: "d4", description: "On-site demo with Meridian IT team. They're very interested in the migration tooling.", timestamp: "2026-03-20T09:00:00Z" },
  { id: "a4", type: "note", contactId: "c3", dealId: "d3", description: "Emily mentioned budget approval is pending. Follow up next week.", timestamp: "2026-03-25T16:00:00Z" },
  { id: "a5", type: "email", contactId: "c5", dealId: "d5", description: "CloudNine team reviewing our integration docs. Aisha is the champion.", timestamp: "2026-03-29T11:00:00Z" },
  { id: "a6", type: "deal-update", contactId: "c6", dealId: "d6", description: "Deal closed! Nexus Group signed the expansion contract — $150K.", timestamp: "2026-03-15T13:00:00Z" },
  { id: "a7", type: "call", contactId: "c9", dealId: "d9", description: "Partnership discussion with Maria. Exploring co-marketing opportunities.", timestamp: "2026-03-30T09:00:00Z" },
  { id: "a8", type: "meeting", contactId: "c10", dealId: "d10", description: "Quarterly review with Vista Capital. Ryan pushing for faster timeline.", timestamp: "2026-03-22T15:00:00Z" },
  { id: "a9", type: "email", contactId: "c7", description: "Sent introductory materials to Rachel at BlueWave.", timestamp: "2026-03-15T10:00:00Z" },
  { id: "a10", type: "task", contactId: "c1", dealId: "d1", description: "Prepare final pricing sheet for Acme Corp negotiation.", timestamp: "2026-03-29T08:00:00Z" },
  { id: "a11", type: "call", contactId: "c13", dealId: "d12", description: "Priya wants a custom data pipeline integration. Scheduling technical deep-dive.", timestamp: "2026-03-26T14:00:00Z" },
  { id: "a12", type: "deal-update", contactId: "c8", dealId: "d8", description: "Peak Digital decided not to renew. Cited budget constraints.", timestamp: "2026-03-01T14:00:00Z" },
  { id: "a13", type: "email", contactId: "c14", dealId: "d13", description: "Swift Logistics requested a security audit before proceeding.", timestamp: "2026-03-18T10:00:00Z" },
  { id: "a14", type: "meeting", contactId: "c15", dealId: "d14", description: "Product demo with QuantumLeap team. Nina impressed with ML features.", timestamp: "2026-03-29T16:00:00Z" },
  { id: "a15", type: "note", contactId: "c11", dealId: "d11", description: "InnovateAI is early stage. Lisa exploring options — check back in May.", timestamp: "2026-03-31T08:00:00Z" },
  { id: "a16", type: "call", contactId: "c2", dealId: "d2", description: "Follow-up call with Marcus. He's presenting to their board next week.", timestamp: "2026-03-27T11:00:00Z" },
  { id: "a17", type: "deal-update", contactId: "c12", dealId: "d15", description: "Fort Security deal lost. Tom moved to a competitor solution.", timestamp: "2026-02-28T11:00:00Z" },
  { id: "a18", type: "email", contactId: "c4", dealId: "d4", description: "Sent migration timeline to James. He shared with their CTO.", timestamp: "2026-03-22T08:00:00Z" },
  { id: "a19", type: "task", contactId: "c5", dealId: "d5", description: "Prepare CloudNine integration sandbox environment.", timestamp: "2026-03-28T09:00:00Z" },
  { id: "a20", type: "call", contactId: "c10", dealId: "d10", description: "Ryan confirmed board approval. Moving to contract review.", timestamp: "2026-03-30T16:00:00Z" },
];

