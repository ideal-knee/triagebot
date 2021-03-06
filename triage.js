const DEFAULTS = require('./settings.json');


/**
 * Create a triage report
 *
 * @param {Object} payload - The Slack slash command payload
 * @param {Object[]} message - The Slack message history
 * @param {Object} options - (optional) settings overrides
 * @returns {Object} The Slack triage report message
 */
function create(payload, messages, options) {
  let settings = Object.assign({}, DEFAULTS, options);

  let map = getRequest.bind(null, settings);
  let sort = (a, b) => a.priority - b.priority;
  let filter = m => m.emoji && !m.bot;

  let requests = messages.map(map).filter(filter).sort(sort);
  let message = buildMessage(payload, requests, settings);
  
  return message;
}


/**
 * Get triage request details from a Slack message and the associated reactions.
 *
 * @param {Object} settings - The triage report settings
 * @param {Object} message - A Slack message
 * @returns {Object} A triage object
 */
function getRequest(settings, message) {
  //reactions
  let reactions = (message.reactions || []).map(r => r.name);

  // the emoji that was matched
  let test = new RegExp(settings.pending.emojis.join('|'));
  let match = message.text.match(test);
  let reaction_match = settings.pending.emojis.some(e => reactions.includes(e));
  let emoji = match ? match[0] : null;

  // if there is a reaction, look at it
  if (reaction_match) {
    let a = new Set(settings.pending.emojis);
    let b = new Set(reactions);
    let intersection = new Set([...a].filter(x => b.has(x)));
    emoji = [...intersection][0];
  }

  // flags based on reactions
  let addressed = settings.addressed.emojis.some(e => reactions.includes(e));
  let review = settings.review.emojis.some(e => reactions.includes(e)) && !addressed; 
  let pending = emoji && !review && !addressed;

  let id = message.ts.replace('.', '');                       // deep link id
  let bot = message.subtype === 'bot_message';                // bot posts
  let priority = settings.pending.emojis.indexOf(emoji);      // display order

  return { bot, priority, emoji, review, addressed, pending, id, message };
}


/**
 * Build a Slack triage response
 *
 * @param {Object} settings - The triage report settings
 * @param {Object} payload - The Slack slash command payload
 * @param {Object[]} requests - The triage request details 
 * @returns {Object} The Slack triage report message
 */
function buildMessage(payload, requests, settings) {
  let {channel_id, channel_name} = payload;
  let message = { unfurl_links: settings.unfurl_links };
  let publish_test = new RegExp(settings.publish_text, 'i');

  // build display text
  let map = buildSection.bind(null, settings, requests, payload);
  message.text = settings.display.map(map).join('\n\n\n');

  // attach instructions if not publish else make public
  if (publish_test.test(payload.text)) message.response_type = 'in_channel';
  else message.attachments = settings.help;
    
  return message;
}


/**
 * Build a triage section's text
 *
 * @param {String} name - The section name
 * @param {Object} settings - The triage report settings
 * @param {Object[]} requests - The triage request details 
 * @param {Object} payload - The Slack slash command payload
 * @returns {String} The section text
 */
function buildSection(settings, requests, payload, name) {
  let {channel_id, channel_name, team_domain} = payload;
  let baseUrl = `https://${team_domain}.slack.com/archives/${channel_name}/p`;

  let {title} = settings[name];                                                                           // section title
  let filtered = requests.filter(r => r[name]);                                                           // filtered list of requests
  let items = filtered.map(r => `:${r.emoji}: ${baseUrl + r.id} ${buildAttributeString(settings,r)}`);    // section line item
  let text = [title].concat(items).join('\n');                                                            // combined text

  // replace template fields
  text = text.replace(/{{count}}/g, filtered.length);
  text = text.replace(/{{channel}}/g, `<#${channel_id}|${channel_name}>`);

  return text;
}

/**
 * Build attributor for a section
 *
 * @param {Object} request - The request
 */
function buildAttributeString(settings,request) {
  if(settings.display_user_attributes.includes('pending') && request.pending) {
    return `<@${request.message.user}>`
  }

  if(settings.display_user_attributes.includes('addressed') && request.addressed) {
    return `<@${request.message.user}>`
  }

  if(settings.display_user_attributes.includes('review') && request.review) {
    let users = request.message.reactions.filter(r => (r.name === settings.review.emojis[0])).map(u => u.users);
    return `(:${settings.review.emojis[0]}: <@${users[0]}>)`
  }

  return '';
}


module.exports = create;