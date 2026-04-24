define('custom:controllers/whatsapp', ['controller'], function (Controller) {

    return class extends Controller {

        actionIndex() {
            this.main('custom:views/whatsapp/main-vue-container', {
                scope: 'WhatsApp'
            });
        }

        actionSetup(ids) {
            this.main('custom:views/whatsapp/setup', {
                scope: 'Settings',
                id: 'Settings'
            });
        }
    }
});
