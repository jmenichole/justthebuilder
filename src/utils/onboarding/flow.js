import { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } from 'discord.js';
import { buildPreviewBlueprint } from './preview.js';
import { applyBlueprint } from '../applyBlueprint.js';
import { sendProgress } from '../progress.js';
import { log } from '../logger.js';
import fs from 'fs';
import path from 'path';

const sessions = new Map(); // userId -> session state

const SERVER_TYPES = [
  'Creator / Streamer',
  'Web3 / Crypto',
  'Gaming Community',
  'Friend Group',
  'Project / Startup',
  'Degen / Casino',
  'Other'
];
const STYLES = [
  { label: 'Neon Gold (💸)', value: 'neon-gold' },
  { label: 'Cyberpunk', value: 'cyberpunk' },
  { label: 'Cozy Pastel', value: 'cozy-pastel' },
  { label: 'Minimal Clean', value: 'minimal-clean' },
  { label: 'Streamer Dark Mode', value: 'streamer-dark' },
  { label: 'Degen / Casino', value: 'degen-casino' }
];
const SECTIONS = [ 'Info', 'Community', 'Support', 'Media', 'Announcements', 'Staff', 'Partnerships' ];

function initSession(userId, guildId) {
  sessions.set(userId, { step: 0, guildId, answers: {} });
}

export async function startOnboarding(user, guild, client) {
  initSession(user.id, guild.id);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jtb_start').setLabel('🚀 Start Setup').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('jtb_help').setLabel('❓ What can you do?').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtb_adv').setLabel('🛠️ Advanced Options').setStyle(ButtonStyle.Secondary)
  );
  await user.send({
    content: '👋 Hey! I’m **JustTheBuilder**, your AI-powered server setup assistant.\nI can build your entire server from scratch in under 30 seconds.\nReady to set things up?',
    components: [row]
  });
}

async function sendServerTypeSelect(user) {
  const menu = new StringSelectMenuBuilder().setCustomId('jtb_type').setPlaceholder('Select server type').addOptions(
    SERVER_TYPES.map(t => ({ label: t, value: t }))
  );
  await user.send({ content: '1️⃣ What type of server are you building?', components: [new ActionRowBuilder().addComponents(menu)] });
}
async function sendStyleSelect(user) {
  const menu = new StringSelectMenuBuilder().setCustomId('jtb_style').setPlaceholder('Choose a style').addOptions(STYLES);
  await user.send({ content: '2️⃣ Choose a style/theme:', components: [new ActionRowBuilder().addComponents(menu)] });
}
async function sendSectionsSelect(user) {
  const menu = new StringSelectMenuBuilder().setCustomId('jtb_sections').setPlaceholder('Select core sections').setMinValues(1).setMaxValues(SECTIONS.length).addOptions(
    SECTIONS.map(s => ({ label: s, value: s.toLowerCase() }))
  );
  await user.send({ content: '3️⃣ What core sections do you want? (multi-select)', components: [new ActionRowBuilder().addComponents(menu)] });
}
async function sendYesNo(user, id, question) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${id}_yes`).setLabel('Yes').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`${id}_no`).setLabel('No').setStyle(ButtonStyle.Danger)
  );
  await user.send({ content: question, components: [row] });
}

async function sendRolesRequest(user) {
  await user.send('6️⃣ List the roles you need (comma separated). I will auto color & preset perms for known names (Admin, Moderator).');
}

function autoInferRoles(raw) {
  const names = raw.split(',').map(r => r.trim()).filter(Boolean);
  return names.map(name => {
    const lower = name.toLowerCase();
    if (lower === 'admin') return { name: 'Admin', permissions: ['Administrator'], color: '#FFD700' };
    if (lower === 'moderator' || lower === 'mod') return { name: 'Moderator', permissions: ['ManageMessages', 'EmbedLinks', 'AttachFiles', 'TimeoutMembers'], color: '#DAA520' };
    return { name, color: '#5865F2' };
  });
}

function buildBlueprintFromAnswers(answers) {
  const styleTheme = answers.style || 'neon-gold';
  const style = { theme: styleTheme, emojiPrefix: styleTheme === 'neon-gold' ? '💸' : '✨' };
  const roles = answers.roles || [];
  const categories = {};
  if (answers.sections?.includes('info')) {
    categories['SERVER INFO'] = [
      { name: 'welcome', type: 'text', message: { title: 'Welcome', body: 'Welcome to the server!' } },
      answers.rules === 'yes' ? { name: 'rules', type: 'text', message: { title: 'Rules', body: '1. Be kind\n2. No spam' } } : null,
      answers.about === 'yes' ? { name: 'about', type: 'text', message: { title: 'About', body: 'About this server.' } } : null,
    ].filter(Boolean);
  }
  if (answers.sections?.includes('community')) {
    categories['COMMUNITY'] = [ { name: 'chat', type: 'text' }, { name: 'clips', type: 'media' } ];
  }
  if (answers.sections?.includes('staff')) {
    categories['STAFF'] = [ { name: 'admin-chat', type: 'text', private: true, allowedRoles: ['Admin'] } ];
  }
  return {
    style,
    roles,
    categories,
    community: answers.sections?.includes('announcements') || false,
    private: answers.sections?.includes('staff') ? { staff: ['admin-chat'] } : {},
  };
}

async function sendPreview(user, blueprint) {
  const preview = buildPreviewBlueprint(blueprint);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jtb_build').setLabel('Looks good → Build it').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('jtb_edit').setLabel('Edit').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtb_restart').setLabel('Start over').setStyle(ButtonStyle.Danger)
  );
  await user.send({ content: `Here’s what I’ll build 👇\n${preview}`, components: [row] });
}

export async function handleOnboardingComponent(interaction, client) {
  if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
  const userId = interaction.user.id;
  const state = sessions.get(userId);
  if (!state) return;
  const user = interaction.user;

  // START
  if (interaction.customId === 'jtb_start') {
    state.step = 1; await interaction.reply({ ephemeral: true, content: 'Starting setup…' }); await sendServerTypeSelect(user); return; }
  if (interaction.customId === 'jtb_help') { await interaction.reply({ ephemeral: true, content: 'I build roles, channels, embeds, permissions automatically.' }); return; }
  if (interaction.customId === 'jtb_adv') { await interaction.reply({ ephemeral: true, content: 'Advanced options coming soon.' }); return; }

  // Server type
  if (interaction.customId === 'jtb_type' && interaction.isStringSelectMenu()) {
    state.answers.type = interaction.values[0]; state.step = 2; await interaction.reply({ ephemeral: true, content: `Type set: ${interaction.values[0]}` }); await sendStyleSelect(user); return; }
  // Style
  if (interaction.customId === 'jtb_style' && interaction.isStringSelectMenu()) {
    state.answers.style = interaction.values[0]; state.step = 3; await interaction.reply({ ephemeral: true, content: `Style set: ${interaction.values[0]}` }); await sendSectionsSelect(user); return; }
  // Sections
  if (interaction.customId === 'jtb_sections' && interaction.isStringSelectMenu()) {
    state.answers.sections = interaction.values; state.step = 4; await interaction.reply({ ephemeral: true, content: 'Sections recorded.' }); await sendYesNo(user, 'jtb_rules', '4️⃣ Auto-generate rules/about/FAQ?'); return; }
  // Rules/about/FAQ yes/no
  if (interaction.customId.startsWith('jtb_rules_')) {
    state.answers.rules = interaction.customId.endsWith('yes') ? 'yes' : 'no'; state.answers.about = state.answers.rules; state.step = 5; await interaction.reply({ ephemeral: true, content: `Rules/About auto-gen: ${state.answers.rules}` }); await sendYesNo(user, 'jtb_private', '5️⃣ Private channels?'); return; }
  // Private
  if (interaction.customId.startsWith('jtb_private_')) {
    state.answers.private = interaction.customId.endsWith('yes') ? 'yes' : 'no'; state.step = 6; await interaction.reply({ ephemeral: true, content: `Private channels: ${state.answers.private}` }); await sendRolesRequest(user); return; }
  // Roles input (plain message listener handled externally?) Not available here -> skip.

  if (interaction.customId === 'jtb_build') {
    const blueprint = buildBlueprintFromAnswers(state.answers);
    await interaction.reply({ ephemeral: true, content: 'Building…' });
    try {
      const guild = client.guilds.cache.get(state.guildId);
      await applyBlueprint(guild, blueprint, { ownerUser: user });
      await postCompletionButtons(user, blueprint);
      sessions.delete(userId);
    } catch (err) { log(`Onboarding build failed: ${err.message}`); }
    return; }
  if (interaction.customId === 'jtb_edit') { await interaction.reply({ ephemeral: true, content: 'Edit flow not yet implemented.' }); return; }
  if (interaction.customId === 'jtb_restart') { sessions.delete(userId); initSession(userId, state.guildId); await interaction.reply({ ephemeral: true, content: 'Restarting…' }); await startOnboarding(user, client.guilds.cache.get(state.guildId), client); return; }
}

async function postCompletionButtons(user, blueprint) {
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jtb_export').setLabel('📝 Export Template').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtb_reapply').setLabel('🔁 Reapply').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('jtb_brand').setLabel('✨ Add Branding').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('jtb_auto').setLabel('🤖 Advanced Automations').setStyle(ButtonStyle.Secondary)
  );
  await user.send({ content: '🎉 Your server is ready! What next?', components: [row] });
  // Save blueprint for immediate export/reapply
  try {
    const dir = path.resolve('data', 'blueprints');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'latest-preview.json'), JSON.stringify(blueprint, null, 2));
  } catch {}
}

export async function handlePostBuildButtons(interaction, client) {
  if (!interaction.isButton()) return;
  const id = interaction.customId;
  const user = interaction.user;
  if (id === 'jtb_export') {
    try {
      const latest = fs.readFileSync(path.resolve('data', 'blueprints', 'latest-preview.json'), 'utf-8');
      await user.send({ content: 'Template Export:', files: [{ attachment: Buffer.from(latest), name: 'blueprint.json' }] });
      await interaction.reply({ ephemeral: true, content: 'Exported.' });
    } catch { await interaction.reply({ ephemeral: true, content: 'No blueprint found.' }); }
  } else if (id === 'jtb_reapply') {
    await interaction.reply({ ephemeral: true, content: 'Reapplying last blueprint…' });
    try {
      const latest = JSON.parse(fs.readFileSync(path.resolve('data', 'blueprints', 'latest-preview.json'), 'utf-8'));
      const guild = client.guilds.cache.find(g => g.members.cache.has(user.id));
      if (guild) await applyBlueprint(guild, latest, { ownerUser: user });
    } catch (err) { log(`Reapply failed: ${err.message}`); }
  } else if (id === 'jtb_brand') {
    await interaction.reply({ ephemeral: true, content: 'Branding enhancements coming soon.' });
  } else if (id === 'jtb_auto') {
    await interaction.reply({ ephemeral: true, content: 'Automation suite (Premium) not yet available.' });
  }
}
