/**
 * Build human-readable preview string from blueprint.
 * @param {Object} blueprint
 */
export function buildPreviewBlueprint(blueprint) {
  const lines = [];
  lines.push(`Theme: ${blueprint.style?.theme}`);
  lines.push(`Emoji Prefix: ${blueprint.style?.emojiPrefix}`);
  lines.push('Roles:');
  for (const r of blueprint.roles || []) {
    lines.push(`  - ${r.name}${r.permissions ? ' [' + r.permissions.join(',') + ']' : ''}`);
  }
  lines.push('Categories & Channels:');
  for (const [cat, arr] of Object.entries(blueprint.categories || {})) {
    lines.push(`  * ${cat}`);
    for (const ch of arr) {
      lines.push(`     - ${ch.name}${ch.private ? ' (private)' : ''}`);
    }
  }
  return '```\n' + lines.join('\n') + '\n```';
}
