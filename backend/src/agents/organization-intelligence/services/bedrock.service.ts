export interface BedrockGenerationOptions {
  apiKey?: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

type OpenAIClient = {
  chat: { completions: { create: (input: Record<string, unknown>) => Promise<{ choices?: Array<{ message?: { content?: unknown } }> }> } };
};
type OpenAIConstructor = new (options: { apiKey: string; baseURL: string; timeout: number; maxRetries: number }) => OpenAIClient;

let OpenAIClass: Promise<OpenAIConstructor> | undefined;
async function openAIClientClass(): Promise<OpenAIConstructor> {
  OpenAIClass ??= import('openai').then((module) => module.default as unknown as OpenAIConstructor);
  return OpenAIClass;
}

export class BedrockService {
  private readonly options: Required<BedrockGenerationOptions>;

  constructor(options: BedrockGenerationOptions = {}) {
    this.options = {
      apiKey: options.apiKey ?? process.env.AWS_BEARER_TOKEN_BEDROCK ?? '',
      baseURL: options.baseURL ?? process.env.BEDROCK_BASE_URL ?? process.env.BEDROCK_MANTLE_BASE_URL ?? `https://bedrock-mantle.${process.env.AWS_REGION ?? 'us-east-1'}.api.aws/v1`,
      model: options.model ?? process.env.BEDROCK_MODEL ?? 'openai.gpt-oss-120b',
      maxTokens: options.maxTokens ?? Number(process.env.BEDROCK_MAX_TOKENS ?? 1000),
      temperature: options.temperature ?? Number(process.env.BEDROCK_TEMPERATURE ?? 0.2),
      timeoutMs: options.timeoutMs ?? Number(process.env.BEDROCK_TIMEOUT_MS ?? 45000)
    };
  }

  async generate(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.options.apiKey) throw new Error('Bedrock is not configured. Set AWS_BEARER_TOKEN_BEDROCK.');
    const OpenAI = await openAIClientClass();
    const client = new OpenAI({ apiKey: this.options.apiKey, baseURL: this.options.baseURL, timeout: this.options.timeoutMs, maxRetries: 0 });
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await client.chat.completions.create({
          model: this.options.model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          max_tokens: this.options.maxTokens,
          temperature: this.options.temperature
        });
        const answer = response.choices?.[0]?.message?.content;
        if (typeof answer !== 'string' || !answer.trim()) throw new Error('Bedrock returned an empty response.');
        return answer.trim();
      } catch (error) {
        const status = typeof error === 'object' && error !== null && 'status' in error ? Number((error as { status: unknown }).status) : undefined;
        if (status === 401 || status === 403) throw new Error('Bedrock rejected the configured credentials or model permissions.');
        const transient = status === 429 || (status !== undefined && status >= 500) || (error instanceof Error && /connection|timeout|timed out|abort/i.test(`${error.name} ${error.message}`));
        if (!transient) throw error;
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 300 * (2 ** attempt)));
      }
    }
    throw new Error('Bedrock request failed after controlled retries.');
  }
}

export function configuredBedrockService(): BedrockService | undefined {
  return process.env.AWS_BEARER_TOKEN_BEDROCK ? new BedrockService() : undefined;
}
