#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { validateBlueprint } from '../src/utils/ai/schemas.js';

function usage() {
  console.log('Usage: node scripts/runLocalBlueprint.js <blueprint.json>');
  process.exit(1);
}

const fileArg = process.argv[2];
if (!fileArg) usage();
const filePath = path.resolve(fileArg);
if (!fs.existsSync(filePath)) {
  console.error('File not found:', filePath);
  process.exit(1);
}
let raw; let json;
try { raw = fs.readFileSync(filePath, 'utf-8'); json = JSON.parse(raw); } catch (err) { console.error('Parse error:', err.message); process.exit(1); }

const valid = validateBlueprint(json);
if (!valid) {
  console.error('Validation errors:');
  for (const e of validateBlueprint.errors) console.error('-', e.instancePath || '/', e.message);
  process.exit(2);
}

// Summaries
const roleCount = json.roles?.length || 0;
const categoryCount = json.categories?.length || 0;
let channelCount = 0;
for (const cat of json.categories || []) channelCount += (cat.channels?.length || 0);

console.log('Blueprint OK');
console.log('Name:', json.name || '(none)');
console.log('Roles:', roleCount);
console.log('Categories:', categoryCount);
console.log('Channels:', channelCount);
if (json.branding) console.log('Branding:', JSON.stringify(json.branding));
if (json.webhooks) console.log('Top-level webhooks entries:', json.webhooks.length);

// Detect potential presets inference (heuristic)
function inferPresets() {
  const presets = new Set();
  for (const cat of json.categories || []) {
    for (const ch of cat.channels || []) {
      if (ch.permissionsPreset) presets.add(ch.permissionsPreset);
    }
  }
  return [...presets];
}
const inferred = inferPresets();
if (inferred.length) console.log('Found permissionsPreset values:', inferred.join(', '));

// Exit success
process.exit(0);
