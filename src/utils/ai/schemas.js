import Ajv from "ajv";
import addFormats from "ajv-formats";

// Ajv instance with full error collection for better AI repair hints
const ajv = new Ajv({ allErrors: true, allowUnionTypes: true });
addFormats(ajv);

// Permissions are passed in human-readable strings that will be mapped later.
const roleSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    color: { type: "string", pattern: "^#?[0-9A-Fa-f]{6}$" },
    permissions: {
      type: "array",
      items: { type: "string" }
    },
    isStaff: { type: "boolean" },
    isModerator: { type: "boolean" }
  },
  required: ["name"],
  additionalProperties: false
};

const channelMessageSchema = {
  type: "object",
  properties: {
    title: { type: "string" },
    body: { type: "string" },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          header: { type: "string" },
          content: { type: "string" },
          bullets: {
            type: "array",
            items: { type: "string" }
          }
        },
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

const channelSchema = {
  type: "object",
  properties: {
    name: { type: "string", minLength: 1 },
    type: {
      type: "string",
      enum: ["text", "voice", "announcement", "media", "stage", "forum"]
    },
    topic: { type: "string" },
    readOnly: { type: "boolean" },
    private: { type: "boolean" },
    allowedRoles: { type: "array", items: { type: "string" } },
    permissions: { anyOf: [ { type: "string" }, { type: "array", items: { type: "string" } } ] },
    permissionsPreset: { type: "string" },
    order: { type: "integer", minimum: 0 },
    threadsLocked: { type: "boolean" },
    defaultAutoArchiveDuration: { type: "integer", enum: [60, 1440, 4320, 10080] },
    message: channelMessageSchema,
    emoji: { type: "string" }
  },
  required: ["name"],
  additionalProperties: false
};

const welcomeScreenSchema = {
  type: "object",
  properties: {
    description: { type: "string" },
    prompts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          channel: { type: "string" },
          emoji: { type: "string" },
          description: { type: "string" }
        },
        required: ["title"],
        additionalProperties: false
      }
    }
  },
  additionalProperties: false
};

export const blueprintSchema = {
  type: "object",
  properties: {
    style: {
      type: "object",
      properties: {
        emojiPrefix: { type: "string" },
        theme: { type: "string" }
      },
      additionalProperties: false
    },
    branding: {
      type: "object",
      properties: {
        color: { type: "string", pattern: "^#?[0-9A-Fa-f]{6}$" },
        accent: { type: "string", pattern: "^#?[0-9A-Fa-f]{6}$" },
        emoji: { type: "string" }
      },
      additionalProperties: false
    },
    community: { type: "boolean" },
    roles: { type: "array", items: roleSchema, minItems: 1 },
    categories: {
      type: "object",
      minProperties: 1,
      additionalProperties: {
        type: "array",
        items: channelSchema
      }
    },
    private: {
      type: "object",
      additionalProperties: {
        type: "array",
        items: { type: "string" }
      }
    },
    welcomeScreen: welcomeScreenSchema,
    categoryPrivacy: {
      type: "object",
      additionalProperties: { type: "string" } // preset name per category
    },
    webhooks: {
      type: "object",
      additionalProperties: {
        type: "object",
        properties: {
          name: { type: "string" },
          avatar: { type: "string" }
        },
        additionalProperties: false
      }
    }
  },
  required: ["roles", "categories"],
  additionalProperties: false
};

const validate = ajv.compile(blueprintSchema);

/**
 * Validate a blueprint object against the Ajv schema.
 * @param {Object} blueprint
 * @returns {{valid:boolean,errors:Array}} Validation result
 */
export function validateBlueprint(blueprint) {
  const valid = validate(blueprint);
  return { valid, errors: valid ? [] : validate.errors };
}

/**
 * Format Ajv validation errors into a single semicolon-delimited string.
 * @param {Array} errors Ajv error array
 * @returns {string}
 */
export function formatValidationErrors(errors = []) {
  if (!errors.length) return "No errors";
  return errors
    .map(e => `${e.instancePath || '/'} ${e.message}`)
    .join("; ");
}

// Suggest a repair prompt for AI when invalid
/**
 * Build a concise repair prompt instructing the AI to output only corrected JSON.
 * @param {Array} errors Ajv errors from prior validation attempt
 * @returns {string} Prompt text
 */
export function buildRepairPrompt(errors) {
  return (
    "The JSON you produced did not match the required schema. " +
    "Please ONLY return a corrected JSON object (no commentary). Errors: " +
    formatValidationErrors(errors)
  );
}

