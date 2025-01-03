import { z } from 'zod'; // v3.22.4
import { Agent, AgentType, AgentConfig } from '../types/agent';
import { User, UserRole } from '../types/auth';
import { ErrorResponse } from '../types/common';

// Constants for validation rules
const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const PASSWORD_MIN_LENGTH = 12;
const PASSWORD_ENTROPY_THRESHOLD = 70;
const XSS_PATTERNS = [
  /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
  /javascript:/gi,
  /on\w+\s*=/gi
];

// Input sanitization rules
const INPUT_SANITIZATION_RULES: Record<string, RegExp> = {
  htmlTags: /<[^>]*>/g,
  sqlInjection: /(\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION)\b)/gi,
  specialChars: /[<>{}()$]/g
};

/**
 * Custom validation error class with enhanced error reporting
 */
export class ValidationError extends Error {
  public readonly details: Record<string, any>;
  public readonly timestamp: string;
  public readonly errorId: string;

  constructor(message: string, details: Record<string, any> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
    this.timestamp = new Date().toISOString();
    this.errorId = `VAL-${Math.random().toString(36).substr(2, 9)}`;
    Error.captureStackTrace(this, ValidationError);
  }
}

/**
 * Validates and sanitizes user input data
 * @param input - Input data to validate
 * @param schema - Zod schema for validation
 * @returns true if valid, throws ValidationError if invalid
 */
export function validateUserInput<T>(input: Record<string, any>, schema: z.ZodSchema<T>): boolean {
  // Sanitize input
  const sanitizedInput = Object.entries(input).reduce((acc, [key, value]) => {
    if (typeof value === 'string') {
      let sanitized = value;
      // Apply sanitization rules
      Object.entries(INPUT_SANITIZATION_RULES).forEach(([_, pattern]) => {
        sanitized = sanitized.replace(pattern, '');
      });
      // Check for XSS patterns
      if (XSS_PATTERNS.some(pattern => pattern.test(sanitized))) {
        throw new ValidationError('Potential XSS attack detected', { field: key });
      }
      acc[key] = sanitized;
    } else {
      acc[key] = value;
    }
    return acc;
  }, {} as Record<string, any>);

  try {
    schema.parse(sanitizedInput);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Validation failed', {
        errors: error.errors,
        input: sanitizedInput
      });
    }
    throw error;
  }
}

/**
 * Validates agent configuration with enhanced security checks
 * @param config - Agent configuration to validate
 * @param agentType - Type of agent being configured
 * @returns true if valid, throws ValidationError if invalid
 */
export function validateAgentConfig(config: AgentConfig, agentType: AgentType): boolean {
  // Create base schema for common agent configuration
  const baseSchema = z.object({
    capabilities: z.array(z.string()).nonempty(),
    knowledgeSourceIds: z.array(z.string().uuid()),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    settings: z.object({
      model_settings: z.object({
        temperature: z.number().min(0).max(1).optional(),
        max_tokens: z.number().positive().optional(),
        top_p: z.number().min(0).max(1).optional()
      }).optional(),
      rag_settings: z.object({
        chunk_size: z.number().positive().optional(),
        chunk_overlap: z.number().nonnegative().optional(),
        similarity_threshold: z.number().min(0).max(1).optional()
      }).optional(),
      custom_settings: z.record(z.unknown()).optional()
    })
  });

  // Add type-specific validation
  const typeSpecificSchema = (() => {
    switch (agentType) {
      case AgentType.STREAMLIT:
        return baseSchema.extend({
          deploymentConfig: z.object({
            environment: z.enum(['development', 'staging', 'production']),
            resources: z.object({
              cpu: z.number().min(0.25).max(4),
              memory: z.number().min(512).max(8192)
            })
          })
        });
      case AgentType.SLACK:
        return baseSchema.extend({
          deploymentConfig: z.object({
            environment: z.enum(['development', 'staging', 'production']),
            resources: z.object({
              cpu: z.number().min(0.25).max(2),
              memory: z.number().min(256).max(4096)
            })
          })
        });
      default:
        return baseSchema;
    }
  })();

  try {
    typeSpecificSchema.parse(config);
    return true;
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError('Invalid agent configuration', {
        errors: error.errors,
        agentType,
        config
      });
    }
    throw error;
  }
}

/**
 * Validates email format with enhanced security
 * @param email - Email address to validate
 * @returns true if email format is valid
 */
export function isValidEmail(email: string): boolean {
  const sanitizedEmail = email.trim().toLowerCase();
  
  // Check basic format
  if (!EMAIL_REGEX.test(sanitizedEmail)) {
    return false;
  }

  // Additional security checks
  const [localPart, domain] = sanitizedEmail.split('@');
  
  // Check local part length
  if (localPart.length > 64) {
    return false;
  }

  // Check domain length and format
  if (domain.length > 255 || !/^[a-z0-9]+([\-\.]{1}[a-z0-9]+)*\.[a-z]{2,}$/.test(domain)) {
    return false;
  }

  return true;
}

/**
 * Validates password strength with enhanced security requirements
 * @param password - Password to validate
 * @returns true if password meets security requirements
 */
export function isValidPassword(password: string): boolean {
  if (password.length < PASSWORD_MIN_LENGTH) {
    return false;
  }

  // Check complexity requirements
  const hasUppercase = /[A-Z]/.test(password);
  const hasLowercase = /[a-z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSpecial = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
    return false;
  }

  // Calculate entropy score
  const charsetSize = 
    (hasUppercase ? 26 : 0) +
    (hasLowercase ? 26 : 0) +
    (hasNumber ? 10 : 0) +
    (hasSpecial ? 32 : 0);
  
  const entropy = Math.log2(Math.pow(charsetSize, password.length));
  
  if (entropy < PASSWORD_ENTROPY_THRESHOLD) {
    return false;
  }

  // Check for common patterns
  const commonPatterns = [
    /^password/i,
    /^123/,
    /qwerty/i,
    /admin/i
  ];

  if (commonPatterns.some(pattern => pattern.test(password))) {
    return false;
  }

  return true;
}