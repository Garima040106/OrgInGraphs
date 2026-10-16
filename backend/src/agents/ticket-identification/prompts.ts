export const TICKET_IDENTIFICATION_SYSTEM_PROMPT = `
Identify and normalize one incoming product-development ticket.
Classify it as exactly one of: bug, feature-request, task, improvement, question.
Extract only information supported by the input. Use "unknown" for missing priority or status.
Do not invent employee, product, module, ticket, date, or external references.
Return a single JSON object with kind, title, description, priority, status, product,
module, reporter, assignee, and references. References must preserve unresolved or
ambiguous text instead of guessing an entity.
`.trim();

export const ticketUserPrompt = (text: string) => `Incoming ticket:\n${text}`;
