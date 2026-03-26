const fs = require('fs');

const clientPath = '/usr/src/app/node_modules/whatsapp-web.js/src/Client.js';
const marker = 'PROFILE_PIC_SAFE_PATCH_V2';

const source = fs.readFileSync(clientPath, 'utf8');

if (source.includes(marker)) {
    process.exit(0);
}

const pattern = /async getProfilePicUrl\(contactId\) \{[\s\S]*?return profilePic \? profilePic\.eurl : undefined;\n    \}/;

const replacement = `async getProfilePicUrl(contactId) {
        const profilePic = await this.pupPage.evaluate(async contactId => {
            const readImageAsDataUrl = (imageBlob) => {
                return new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = function () {
                        resolve(reader.result || undefined);
                    };
                    reader.readAsDataURL(imageBlob);
                });
            };

            try {
                const chatWid = window.Store.WidFactory.createWid(contactId);
                let result;

                // PROFILE_PIC_SAFE_PATCH_V2
                try {
                    result = await window.Store.ProfilePic.profilePicFind(chatWid);
                } catch (innerErr) {}

                if (!result) {
                    try {
                        result = await window.Store.ProfilePic.requestProfilePicFromServer(chatWid);
                    } catch (innerErr) {
                        if (innerErr && innerErr.name === 'ServerStatusCodeError') return undefined;
                    }
                }

                if ((!result || !result.eurl) && window.Store.ProfilePicThumb) {
                    try {
                        const thumb = await window.Store.ProfilePicThumb.find(chatWid);
                        if (thumb && thumb.img) {
                            const response = await fetch(thumb.img);
                            if (response.ok) {
                                const blob = await response.blob();
                                const dataUrl = blob ? await readImageAsDataUrl(blob) : undefined;
                                if (dataUrl) {
                                    result = { eurl: dataUrl };
                                }
                            }
                        }
                    } catch (innerErr) {}
                }

                return result;
            } catch (err) {
                if (err.name === 'ServerStatusCodeError') return undefined;
                throw err;
            }
        }, contactId);

        return profilePic ? profilePic.eurl : undefined;
    }`;

if (!pattern.test(source)) {
    console.error('Unable to patch whatsapp-web.js Client.getProfilePicUrl');
    process.exit(1);
}

fs.writeFileSync(clientPath, source.replace(pattern, replacement));
