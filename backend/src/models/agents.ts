import { configuredModel } from './provider.js';
import { TICKET_IDENTIFICATION_SYSTEM_PROMPT, ticketUserPrompt } from '../agents/ticket-identification/prompts.js';
import { FEATURE_UPDATE_SYSTEM_PROMPT, featureUpdateUserPrompt } from '../agents/feature-update/prompts.js';
import type { TicketModel } from '../agents/ticket-identification/types.js';
import type { FeatureUpdateModel } from '../agents/feature-update/types.js';

export function configuredTicketModel(): TicketModel | undefined {
  const model = configuredModel('ticket-identification');
  return model ? (input) => model(TICKET_IDENTIFICATION_SYSTEM_PROMPT, ticketUserPrompt(input.text)) : undefined;
}

export function configuredFeatureUpdateModel(): FeatureUpdateModel | undefined {
  const model = configuredModel('feature-update');
  return model ? (input) => model(FEATURE_UPDATE_SYSTEM_PROMPT, featureUpdateUserPrompt(input.text)) : undefined;
}
