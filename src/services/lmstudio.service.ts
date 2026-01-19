/**
 * LM Studio Service
 * Integración con LM Studio para validación de challenges usando AI con visión
 *
 * IMPORTANT: Circuit breaker state is in-memory and NOT shared between workers.
 * In a cluster environment, each worker has its own circuit breaker state.
 * For production with multiple workers, consider using Redis for shared state.
 */

/**
 * Circuit Breaker States
 */
type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerState {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  successCount: number;
  halfOpenStartTime: number; // Track when HALF_OPEN started
}

/**
 * Circuit Breaker Configuration
 */
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5, // Open circuit after 5 consecutive failures
  resetTimeout: 60000, // 1 minute cooldown before trying again
  halfOpenSuccessThreshold: 2, // Need 2 successes to close circuit
  halfOpenTimeout: 300000, // 5 minutes max in HALF_OPEN state before auto-closing
  maxOpenDuration: 600000, // 10 minutes max in OPEN state before auto-reset
};

/**
 * Circuit Breaker State (in-memory, resets on restart)
 * WARNING: Not shared between workers in cluster mode
 */
const circuitBreaker: CircuitBreakerState = {
  state: 'CLOSED',
  failures: 0,
  lastFailureTime: 0,
  successCount: 0,
  halfOpenStartTime: 0,
};

/**
 * Check if circuit breaker allows request
 * Includes auto-reset logic for stuck states
 */
function canMakeRequest(): boolean {
  const now = Date.now();

  if (circuitBreaker.state === 'CLOSED') {
    return true;
  }

  if (circuitBreaker.state === 'OPEN') {
    const timeSinceFailure = now - circuitBreaker.lastFailureTime;

    // Auto-reset if circuit has been OPEN for too long (prevents permanent lockout)
    if (timeSinceFailure >= CIRCUIT_BREAKER_CONFIG.maxOpenDuration) {
      console.warn('[LMStudio] Circuit breaker: OPEN -> CLOSED (auto-reset after max duration)');
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failures = 0;
      circuitBreaker.successCount = 0;
      return true;
    }

    // Check if cooldown period has passed
    if (timeSinceFailure >= CIRCUIT_BREAKER_CONFIG.resetTimeout) {
      circuitBreaker.state = 'HALF_OPEN';
      circuitBreaker.successCount = 0;
      circuitBreaker.halfOpenStartTime = now;
      console.info('[LMStudio] Circuit breaker: OPEN -> HALF_OPEN');
      return true;
    }
    return false;
  }

  // HALF_OPEN state
  if (circuitBreaker.state === 'HALF_OPEN') {
    // Auto-close if stuck in HALF_OPEN for too long (slow success accumulation)
    const timeInHalfOpen = now - circuitBreaker.halfOpenStartTime;
    if (timeInHalfOpen >= CIRCUIT_BREAKER_CONFIG.halfOpenTimeout) {
      console.info('[LMStudio] Circuit breaker: HALF_OPEN -> CLOSED (timeout, assuming recovered)');
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failures = 0;
      circuitBreaker.successCount = 0;
      return true;
    }
    return true; // Allow requests in HALF_OPEN
  }

  return true;
}

/**
 * Record a successful request
 */
function recordSuccess(): void {
  if (circuitBreaker.state === 'HALF_OPEN') {
    circuitBreaker.successCount++;
    if (circuitBreaker.successCount >= CIRCUIT_BREAKER_CONFIG.halfOpenSuccessThreshold) {
      circuitBreaker.state = 'CLOSED';
      circuitBreaker.failures = 0;
      console.info('[LMStudio] Circuit breaker: HALF_OPEN -> CLOSED');
    }
  } else if (circuitBreaker.state === 'CLOSED') {
    // Reset failure count on success
    circuitBreaker.failures = 0;
  }
}

/**
 * Record a failed request
 */
function recordFailure(): void {
  circuitBreaker.failures++;
  circuitBreaker.lastFailureTime = Date.now();

  if (circuitBreaker.state === 'HALF_OPEN') {
    // Any failure in half-open state opens the circuit
    circuitBreaker.state = 'OPEN';
    console.warn('[LMStudio] Circuit breaker: HALF_OPEN -> OPEN (failure in half-open)');
  } else if (circuitBreaker.failures >= CIRCUIT_BREAKER_CONFIG.failureThreshold) {
    circuitBreaker.state = 'OPEN';
    console.warn(`[LMStudio] Circuit breaker: CLOSED -> OPEN (${circuitBreaker.failures} failures)`);
  }
}

/**
 * Get current circuit breaker status
 */
export function getCircuitBreakerStatus(): {
  state: CircuitState;
  failures: number;
  canRequest: boolean;
  cooldownRemaining?: number;
} {
  const canRequest = canMakeRequest();
  let cooldownRemaining: number | undefined;

  if (circuitBreaker.state === 'OPEN') {
    const elapsed = Date.now() - circuitBreaker.lastFailureTime;
    cooldownRemaining = Math.max(0, CIRCUIT_BREAKER_CONFIG.resetTimeout - elapsed);
  }

  return {
    state: circuitBreaker.state,
    failures: circuitBreaker.failures,
    canRequest,
    cooldownRemaining,
  };
}

export interface LMStudioConfig {
  baseUrl: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
}

export interface ContentPart {
  type: 'text' | 'image_url';
  text?: string;
  image_url?: {
    url: string;
  };
}

export interface LMStudioResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string;
    };
    finish_reason: string;
  }[];
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export interface ProofImage {
  base64: string;
  mimeType: string;
}

export interface ChallengeValidationRequest {
  challengeTitle: string;
  challengeDescription: string;
  challengeDifficulty: string;
  proofText?: string;
  proofImages?: ProofImage[]; // Array of 1-2 images
}

export interface ChallengeValidationResult {
  isValid: boolean;
  confidenceScore: number;
  reasoning: string;
  rawResponse?: string;
}

// Default configuration - can be overridden via environment variables
const defaultConfig: LMStudioConfig = {
  baseUrl: process.env.LMSTUDIO_URL || 'http://172.19.32.1:1234',
  model: process.env.LMSTUDIO_MODEL || 'zai-org/glm-4.6v-flash',
  maxTokens: 250, // Enough for structured response + reasoning
  temperature: 0.3,
};

/**
 * Removes <think>...</think> blocks and special markers from model response
 */
function cleanModelResponse(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/g, '') // Remove thinking blocks
    .replace(/<\|begin_of_box\|>/g, '') // Remove box start markers
    .replace(/<\|end_of_box\|>/g, '') // Remove box end markers
    .replace(/<\|[^|]+\|>/g, '') // Remove any other special tokens
    .trim();
}

/**
 * Parses the AI response to extract validation result
 */
function parseValidationResponse(content: string): ChallengeValidationResult {
  const cleanedContent = cleanModelResponse(content);

  // Try to parse structured response
  const validMatch = cleanedContent.match(/VALID[OA]?:\s*(true|false|sí|si|no)/i);
  const confidenceMatch = cleanedContent.match(/CONFIAN[ZC]A:\s*(\d+(?:\.\d+)?)/i);
  const reasoningMatch = cleanedContent.match(/RAZ[OÓ]N:\s*([\s\S]+?)(?=\n\n|$)/i);

  let isValid = false;
  let confidenceScore = 0.5;
  let reasoning = cleanedContent;

  if (validMatch) {
    const validValue = validMatch[1].toLowerCase();
    isValid = validValue === 'true' || validValue === 'sí' || validValue === 'si';
  } else {
    // Fallback: check for positive/negative keywords
    const positiveKeywords = ['aprobad', 'válid', 'complet', 'correcto', 'cumple', 'aceptad'];
    const negativeKeywords = ['rechazad', 'inválid', 'insuficiente', 'no cumple', 'falso', 'incorrecto'];

    const lowerContent = cleanedContent.toLowerCase();
    const positiveCount = positiveKeywords.filter(k => lowerContent.includes(k)).length;
    const negativeCount = negativeKeywords.filter(k => lowerContent.includes(k)).length;

    isValid = positiveCount > negativeCount;
  }

  if (confidenceMatch) {
    confidenceScore = parseFloat(confidenceMatch[1]);
    if (confidenceScore > 1) confidenceScore = confidenceScore / 100; // Handle percentage
  } else {
    // Estimate confidence based on response clarity
    confidenceScore = isValid ? 0.75 : 0.7;
  }

  if (reasoningMatch) {
    reasoning = reasoningMatch[1].trim();
  }

  return {
    isValid,
    confidenceScore: Math.min(1, Math.max(0, confidenceScore)),
    reasoning,
    rawResponse: cleanedContent,
  };
}

/**
 * Build the system prompt for challenge validation
 */
function buildSystemPrompt(): string {
  return `Eres un validador de pruebas para HabitRush. Evalúa si la prueba demuestra que el usuario completó el challenge.

REGLAS:
- Aprueba si la prueba es razonable y muestra esfuerzo genuino
- Rechaza SOLO si es claramente irrelevante o fraudulenta
- Sé flexible para motivar, no frustrar

RESPONDE SOLO en este formato (sin explicaciones adicionales):
VALIDO: true/false
CONFIANZA: 0.0-1.0
RAZÓN: [1-2 oraciones máximo en español]`;
}

/**
 * Build the user message for validation
 */
function buildValidationMessage(request: ChallengeValidationRequest): ContentPart[] {
  const parts: ContentPart[] = [];

  // Add challenge context - concise format
  let textContent = `CHALLENGE: ${request.challengeTitle} - ${request.challengeDescription} (${request.challengeDifficulty})\n\nPRUEBA:`;

  if (request.proofText) {
    textContent += ` "${request.proofText}"`;
  }

  const imageCount = request.proofImages?.length || 0;
  if (imageCount > 0) {
    const imageLabel = imageCount === 1 ? '1 imagen adjunta' : `${imageCount} imágenes adjuntas`;
    textContent += request.proofText ? `\n[+ ${imageLabel}]` : ` [${imageLabel}]`;
  }

  if (!request.proofText && imageCount === 0) {
    textContent += ' [sin pruebas]';
  }

  parts.push({ type: 'text', text: textContent });

  // Add all images
  if (request.proofImages && request.proofImages.length > 0) {
    for (const image of request.proofImages) {
      parts.push({
        type: 'image_url',
        image_url: {
          url: `data:${image.mimeType};base64,${image.base64}`,
        },
      });
    }
  }

  return parts;
}

/**
 * Main validation function using LM Studio
 * Includes circuit breaker protection
 */
export async function validateChallengeWithAI(
  request: ChallengeValidationRequest,
  config: Partial<LMStudioConfig> = {},
): Promise<ChallengeValidationResult> {
  // Check circuit breaker before making request
  if (!canMakeRequest()) {
    const status = getCircuitBreakerStatus();
    throw new Error(
      `AI service temporarily unavailable (circuit breaker OPEN). Retry in ${Math.ceil((status.cooldownRemaining || 0) / 1000)}s`,
    );
  }

  const finalConfig = { ...defaultConfig, ...config };

  const messages: ChatMessage[] = [
    { role: 'system', content: buildSystemPrompt() },
    { role: 'user', content: buildValidationMessage(request) },
  ];

  try {
    const response = await fetch(`${finalConfig.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: finalConfig.model,
        messages,
        max_tokens: finalConfig.maxTokens,
        temperature: finalConfig.temperature,
      }),
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    if (!response.ok) {
      const errorText = await response.text();
      // HIGH FIX: Sanitize error text before logging
      console.error('[LMStudio] API error:', response.status, sanitizeErrorForLogging(errorText));
      recordFailure();
      throw new Error(`LM Studio API error: ${response.status}`);
    }

    const data: LMStudioResponse = await response.json();

    if (!data.choices || data.choices.length === 0) {
      recordFailure();
      throw new Error('No response from LM Studio');
    }

    const content = data.choices[0].message.content;
    const result = parseValidationResponse(content);

    // Record success
    recordSuccess();

    console.info('[LMStudio] Validation completed:', {
      isValid: result.isValid,
      confidence: result.confidenceScore,
      tokens: data.usage?.total_tokens,
      circuitState: circuitBreaker.state,
    });

    return result;
  } catch (error) {
    // Record failure if not already recorded (e.g., network errors)
    if (
      error instanceof Error &&
      !error.message.includes('circuit breaker') &&
      !error.message.includes('LM Studio API error')
    ) {
      recordFailure();
    }
    // HIGH FIX: Sanitize error before logging
    console.error('[LMStudio] Validation error:', sanitizeErrorForLogging(error));
    throw error;
  }
}

/**
 * Check if LM Studio is available
 */
export async function checkLMStudioHealth(config: Partial<LMStudioConfig> = {}): Promise<boolean> {
  const finalConfig = { ...defaultConfig, ...config };

  try {
    const response = await fetch(`${finalConfig.baseUrl}/v1/models`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Get available models from LM Studio
 * MEDIUM FIX: Added timeout to prevent indefinite hangs
 */
export async function getAvailableModels(
  config: Partial<LMStudioConfig> = {},
): Promise<{ id: string; object: string }[]> {
  const finalConfig = { ...defaultConfig, ...config };

  try {
    const response = await fetch(`${finalConfig.baseUrl}/v1/models`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    const data = await response.json();
    return data.data || [];
  } catch {
    return [];
  }
}

/**
 * HIGH FIX: Sanitize error messages before logging to prevent leaking sensitive data
 * Removes potential API keys, auth tokens, and truncates long messages
 */
function sanitizeErrorForLogging(error: unknown): string {
  let message: string;
  if (error instanceof Error) {
    message = error.message;
  } else if (typeof error === 'string') {
    message = error;
  } else {
    message = 'Unknown error';
  }

  // Remove potential sensitive patterns
  message = message
    .replace(/Bearer\s+[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+/gi, 'Bearer [REDACTED]')
    .replace(/api[_-]?key[=:]\s*["']?[A-Za-z0-9\-_]+["']?/gi, 'api_key=[REDACTED]')
    .replace(/Authorization:\s*[^\s]+/gi, 'Authorization: [REDACTED]')
    .replace(/password[=:]\s*["']?[^"'\s]+["']?/gi, 'password=[REDACTED]');

  // Truncate very long messages
  const MAX_LENGTH = 500;
  if (message.length > MAX_LENGTH) {
    message = message.substring(0, MAX_LENGTH) + '... [truncated]';
  }

  return message;
}

export const lmstudioService = {
  validateChallengeWithAI,
  checkLMStudioHealth,
  getAvailableModels,
  getCircuitBreakerStatus,
  config: defaultConfig,
};
