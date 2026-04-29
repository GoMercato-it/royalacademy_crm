const fs = require('fs');

const patchFile = (filePath, replacements, label) => {
    const source = fs.readFileSync(filePath, 'utf8');

    for (const { oldText, newText } of replacements) {
        if (source.includes(newText)) {
            console.log(`${label}: already patched`);
            return;
        }

        if (source.includes(oldText)) {
            fs.writeFileSync(filePath, source.replace(oldText, newText));
            console.log(`${label}: patched`);
            return;
        }
    }

    console.error(`${label}: unable to find a supported source pattern`);
    process.exit(1);
};

const assertContains = (filePath, expectedText, label) => {
    const source = fs.readFileSync(filePath, 'utf8');

    if (!source.includes(expectedText)) {
        console.error(`${label}: expected upstream compatibility code was not found`);
        process.exit(1);
    }

    console.log(`${label}: verified`);
};

patchFile(
    '/usr/src/app/src/utils.js',
    [
        {
            oldText: "          const loadedMessages = await (window.require('WAWebChatLoadMessages')).loadEarlierMsgs(chat);",
            newText: "          const loadedMessages = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });",
        },
        {
            oldText: '          const loadedMessages = await window.Store.ConversationMsgs.loadEarlierMsgs(chat)',
            newText: "          const loadedMessages = await window.require('WAWebChatLoadMessages').loadEarlierMsgs({ chat });",
        },
    ],
    'wwebjs-api fetchMessages loadEarlierMsgs signature'
);

patchFile(
    '/usr/src/app/src/utils.js',
    [
        {
            oldText: "    axios.post(webhookURL, { dataType, data, sessionId }, { headers: { 'x-api-key': globalApiKey } })",
            newText: "    axios.post(webhookURL, { dataType, data, sessionId }, { headers: { 'x-whatsapp-api-key': globalApiKey } })",
        },
    ],
    'wwebjs-api CRM webhook auth header isolation'
);

assertContains(
    '/usr/src/app/node_modules/whatsapp-web.js/src/structures/Chat.js',
    '.loadEarlierMsgs({ chat });',
    'whatsapp-web.js Chat.fetchMessages history fix'
);

assertContains(
    '/usr/src/app/node_modules/whatsapp-web.js/src/Client.js',
    'WAWebContactProfilePicThumbBridge',
    'whatsapp-web.js getProfilePicUrl profile picture fix'
);

patchFile(
    '/usr/src/app/src/controllers/messageController.js',
    [
        {
            oldText: [
                'const _getMessageById = async (client, messageId, chatId) => {',
                '  const chat = await client.getChatById(chatId)',
                '  const messages = await chat.fetchMessages({ messageId: messageId, limit: 1 })',
                '  return messages[0]',
                '}',
            ].join('\n'),
            newText: [
                'const _getMessageById = async (client, messageId, chatId) => {',
                '  // Primary: client.getMessageById works with @lid IDs (patched)',
                '  try {',
                '    const msg = await client.getMessageById(messageId)',
                '    if (msg) return msg',
                '  } catch (_e) { /* fallback below */ }',
                '  // Fallback: chat.fetchMessages for legacy lookups',
                '  try {',
                '    const chat = await client.getChatById(chatId)',
                '    const messages = await chat.fetchMessages({ messageId: messageId, limit: 1 })',
                '    if (messages && messages[0]) return messages[0]',
                '  } catch (_e2) { /* not found */ }',
                '  return undefined',
                '}',
            ].join('\n'),
        },
    ],
    'wwebjs-api _getMessageById @lid support'
);
