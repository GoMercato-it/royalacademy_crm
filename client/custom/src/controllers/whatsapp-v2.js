define('custom:controllers/whatsapp-v2', ['controller'], function (Controller) {

    return class extends Controller {

        actionIndex() {
            this.main('custom:views/whatsapp/main-v2', {
                scope: 'WhatsApp'
            });
        }

        actionSetup(ids) {
            this.main('custom:views/whatsapp/setup-v2', {
                scope: 'Settings',
                id: 'Settings'
            });
        }
    }
});
