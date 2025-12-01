/**
 * Pre-built rule templates for different server types.
 */
export const RULE_TEMPLATES = {
  default: {
    title: '📜 Server Rules',
    rules: [
      'Be respectful and kind to all members',
      'No spam, advertising, or self-promotion',
      'Keep content appropriate and SFW',
      'Follow Discord Terms of Service',
      'Listen to staff and moderators',
      'Use channels for their intended purpose'
    ],
    footer: 'Violations may result in warnings, mutes, or bans.'
  },
  
  gaming: {
    title: '🎮 Community Rules',
    rules: [
      'Be respectful to all players and staff',
      'No cheating, hacking, or exploiting',
      'Keep voice channels clear during gameplay',
      'No excessive toxicity or rage',
      'Report bugs/issues through proper channels',
      'Follow game-specific rules in dedicated channels'
    ],
    footer: 'Fair play keeps the community fun for everyone!'
  },
  
  crypto: {
    title: '💎 Server Guidelines',
    rules: [
      'DYOR - Do Your Own Research',
      'No financial advice or guaranteed returns',
      'Verify all links before clicking',
      'No impersonation of team members or influencers',
      'Keep FUD and price discussion in designated channels',
      'Respect others\' investment decisions'
    ],
    footer: 'Stay safe, stay informed. NFA.'
  },
  
  support: {
    title: '🛟 Support Server Rules',
    rules: [
      'Search existing threads before posting',
      'Provide clear details when asking for help',
      'Be patient with support staff and volunteers',
      'No spam or duplicate tickets',
      'Mark your issue as solved when resolved',
      'Help others when you can'
    ],
    footer: 'Quality support requires quality questions.'
  },
  
  content: {
    title: '🎥 Creator Community Rules',
    rules: [
      'Support and uplift fellow creators',
      'No self-promotion outside designated channels',
      'Respect copyright and intellectual property',
      'Keep feedback constructive and helpful',
      'No drama or gossip about other creators',
      'Celebrate wins together!'
    ],
    footer: 'We rise by lifting others.'
  },
  
  professional: {
    title: '💼 Professional Guidelines',
    rules: [
      'Maintain professional conduct at all times',
      'Respect confidentiality and privacy',
      'No solicitation without permission',
      'Keep discussions on-topic and productive',
      'Use appropriate channels for networking',
      'Report violations to moderators privately'
    ],
    footer: 'Professional behavior builds professional networks.'
  }
};

export const FAQ_TEMPLATES = {
  default: [
    { q: 'How do I get started?', a: 'Check out the rules and introduce yourself in chat!' },
    { q: 'How do I contact staff?', a: 'Ping a moderator or admin, or open a support ticket.' },
    { q: 'Can I suggest features?', a: 'Absolutely! Share your ideas in the community channels.' }
  ],
  
  gaming: [
    { q: 'How do I join games?', a: 'Check the LFG channels or create your own party!' },
    { q: 'Where do I report bugs?', a: 'Use the bug-reports channel with detailed info.' },
    { q: 'Can I stream gameplay here?', a: 'Yes! Use our designated streaming channels.' }
  ],
  
  crypto: [
    { q: 'Is this financial advice?', a: 'No. Always DYOR and never invest more than you can lose.' },
    { q: 'How do I verify team members?', a: 'Check roles and verify in our official channels.' },
    { q: 'Where can I discuss price?', a: 'Use the trading or price-talk channels only.' }
  ],
  
  support: [
    { q: 'How do I get help?', a: 'Create a support ticket or ask in the help channel.' },
    { q: 'How long until I get a response?', a: 'Usually within 24 hours, often much faster!' },
    { q: 'Can I help others?', a: 'Yes! Helpful community members often get recognized.' }
  ],
  
  content: [
    { q: 'Can I promote my content?', a: 'Yes, in the self-promo channel following the posting schedule.' },
    { q: 'How do I collaborate?', a: 'Check the collab channel or reach out to creators directly!' },
    { q: 'Where do I share feedback?', a: 'Use the feedback channel - constructive criticism only!' }
  ],
  
  professional: [
    { q: 'How do I network here?', a: 'Introduce yourself and engage in relevant channels.' },
    { q: 'Can I hire from this community?', a: 'Use the opportunities channel with proper job posts.' },
    { q: 'How do I report issues?', a: 'Contact moderators via DM or the modmail system.' }
  ]
};

/**
 * Get rule template based on server type/description
 * @param {string} serverDesc Server description from interview
 * @returns {object} Rule template
 */
export function inferRuleTemplate(serverDesc) {
  const lower = (serverDesc || '').toLowerCase();
  if (lower.includes('gaming') || lower.includes('game') || lower.includes('player')) return RULE_TEMPLATES.gaming;
  if (lower.includes('crypto') || lower.includes('nft') || lower.includes('token') || lower.includes('defi')) return RULE_TEMPLATES.crypto;
  if (lower.includes('support') || lower.includes('help') || lower.includes('bot')) return RULE_TEMPLATES.support;
  if (lower.includes('content') || lower.includes('creator') || lower.includes('stream') || lower.includes('youtube')) return RULE_TEMPLATES.content;
  if (lower.includes('professional') || lower.includes('business') || lower.includes('network')) return RULE_TEMPLATES.professional;
  return RULE_TEMPLATES.default;
}

/**
 * Get FAQ template based on server type
 * @param {string} serverDesc Server description
 * @returns {array} FAQ entries
 */
export function inferFaqTemplate(serverDesc) {
  const lower = (serverDesc || '').toLowerCase();
  if (lower.includes('gaming') || lower.includes('game')) return FAQ_TEMPLATES.gaming;
  if (lower.includes('crypto') || lower.includes('nft') || lower.includes('token')) return FAQ_TEMPLATES.crypto;
  if (lower.includes('support') || lower.includes('help') || lower.includes('bot')) return FAQ_TEMPLATES.support;
  if (lower.includes('content') || lower.includes('creator') || lower.includes('stream')) return FAQ_TEMPLATES.content;
  if (lower.includes('professional') || lower.includes('business')) return FAQ_TEMPLATES.professional;
  return FAQ_TEMPLATES.default;
}
