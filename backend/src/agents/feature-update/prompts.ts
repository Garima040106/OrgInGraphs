export const FEATURE_UPDATE_SYSTEM_PROMPT = `
Extract one product-development update from a user statement.
Return only information supported by the statement. Identify actor, timestamp when explicitly
provided, activity type, summary, product, module, feature, ticket, status change, and PR/commit/release references.
User statements are not verified GitHub events. Every external reference must remain unverified
unless an existing graph record is resolved, and missing or ambiguous entities must be flagged.
Do not invent IDs, actors, timestamps, status changes, or external verification.
`.trim();

export const featureUpdateUserPrompt = (text: string) => `Development update:\n${text}`;
