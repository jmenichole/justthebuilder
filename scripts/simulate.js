// Lightweight simulation harness (no Discord API) to validate blueprint logic.
// Mocks minimal Guild, Role, and Channel interfaces used by builder functions.
import fs from 'fs';
import path from 'path';
import { applyBlueprint } from '../src/utils/applyBlueprint.js';
import assert from 'assert';

class MockRoleManager {
  constructor(guild) { this.guild = guild; }
  async create(data) { const role = { id: `role_${this.guild._nextId++}`, ...data }; this.guild.roles.cache.set(role.id, role); return role; }
}
class MockChannelManager {
  constructor(guild) { this.guild = guild; }
  async create(data) { const channel = { id: `chan_${this.guild._nextId++}`, ...data, guild: this.guild, permissionOverwrites: { set: async () => {} } }; this.guild.channels.cache.set(channel.id, channel); return channel; }
  async fetch(id) { return this.guild.channels.cache.get(id); }
}
class MockGuild {
  constructor(name='TestGuild') { this.name = name; this._nextId = 1; this.channels = { cache: new Map() }; this.roles = { cache: new Map(), everyone: { id: 'everyone' } }; this.roles.create = async (data)=>{ const role={ id: `role_${this._nextId++}`, ...data }; this.roles.cache.set(role.id, role); return role; }; this.channels.create = async (data)=>{ const channel={ id: `chan_${this._nextId++}`, ...data, guild:this, permissionOverwrites:{ set: async ()=>{} } }; this.channels.cache.set(channel.id, channel); return channel; }; }
}

async function main() {
  const blueprintPath = path.resolve('blueprint.example.json');
  const blueprint = JSON.parse(fs.readFileSync(blueprintPath, 'utf-8'));
  const guild = new MockGuild();
  const result = await applyBlueprint(guild, blueprint, {});
  console.log('Simulation metrics:', result.metrics);
  console.log('Roles created:', guild.roles.cache.size);
  console.log('Channels created:', guild.channels.cache.size);
  // Basic assertions
  assert(guild.roles.cache.size === blueprint.roles.length, 'Role count mismatch');
  const expectedChannels = Object.values(blueprint.categories).reduce((a, arr) => a + arr.length, 0);
  assert(guild.channels.cache.size === expectedChannels + Object.keys(blueprint.categories).length, 'Channel (including categories) count mismatch');
  console.log('Assertions passed.');
}

main().catch(err => { console.error(err); process.exit(1); });
