#!/usr/bin/env node
import { validateBlueprint, formatValidationErrors } from "../src/utils/ai/schemas.js";
import { loadEarnCordBlueprint } from "../src/utils/presets/earncord.js";

const blueprint = loadEarnCordBlueprint({ name: "EarnCord Test" });
const { valid, errors } = validateBlueprint(blueprint);

if (!valid) {
  console.error("EarnCord preset blueprint FAILED validation:");
  console.error(formatValidationErrors(errors));
  process.exit(1);
}

const channelCount = Object.values(blueprint.categories).reduce((n, ch) => n + ch.length, 0);
console.log(
  `EarnCord preset OK — ${Object.keys(blueprint.categories).length} categories, ${channelCount} channels, ${blueprint.roles.length} roles`
);
process.exit(0);
