define('custom:views/fields/whatsapp-phone', ['views/fields/phone'], function (PhoneFieldView) {

    const BasePhoneFieldView = PhoneFieldView && PhoneFieldView.default ? PhoneFieldView.default : PhoneFieldView;
    const WHATSAPP_TYPE = 'WhatsApp';
    const DEFAULT_TYPE_LIST = ['Mobile', 'Office', 'Home', 'Fax', 'Other'];

    return class extends BasePhoneFieldView {

        detailTemplate = 'custom:fields/whatsapp-phone/detail';
        listTemplate = 'custom:fields/whatsapp-phone/list';

        constructor(options) {
            super(options);

            this.events = Object.assign({}, this.events || {}, {
                'click [data-action="openWhatsAppChat"]': event => this.actionOpenWhatsAppChat(event),
            });
        }

        setup() {
            this.ensureWhatsAppTypeOption();

            super.setup();
        }

        data() {
            const data = super.data();

            this.decorateWhatsAppPhoneData(data);

            return data;
        }

        ensureWhatsAppTypeOption() {
            this.params = this.params || {};

            const entityTypeList = this.getMetadata().get([
                'entityDefs',
                this.model.entityType,
                'fields',
                this.name,
                'typeList',
            ]);

            const sourceList = Array.isArray(this.params.typeList) && this.params.typeList.length ?
                this.params.typeList :
                (Array.isArray(entityTypeList) && entityTypeList.length ? entityTypeList : DEFAULT_TYPE_LIST);

            const typeList = sourceList.slice();

            if (!typeList.includes(WHATSAPP_TYPE)) {
                typeList.push(WHATSAPP_TYPE);
            }

            this.params.typeList = typeList;
        }

        decorateWhatsAppPhoneData(data) {
            let primaryItem = null;

            if (Array.isArray(data.phoneNumberData)) {
                data.phoneNumberData.forEach(item => {
                    if (!primaryItem || item.primary) {
                        primaryItem = item;
                    }

                    const isWhatsApp = this.isWhatsAppType(item.type);

                    item.isWhatsApp = isWhatsApp;

                    if (!isWhatsApp) {
                        return;
                    }

                    item.valueForWhatsApp = this.formatForWhatsAppRoute(item.phoneNumber || item.valueForLink || '');
                    item.whatsAppHref = this.buildWhatsAppRoute(item.valueForWhatsApp);
                });
            }

            data.isWhatsApp = !!primaryItem && !!primaryItem.isWhatsApp;
            data.valueForWhatsApp = data.isWhatsApp ?
                primaryItem.valueForWhatsApp :
                this.formatForWhatsAppRoute(data.valueForLink || data.value || '');
            data.whatsAppHref = data.isWhatsApp ? this.buildWhatsAppRoute(data.valueForWhatsApp) : '';
        }

        actionOpenWhatsAppChat(event) {
            event.preventDefault();
            event.stopPropagation();

            const target = event.currentTarget;
            const phoneNumber = this.formatForWhatsAppRoute(
                target.getAttribute('data-phone-number') || ''
            );

            if (!phoneNumber) {
                return;
            }

            const route = this.buildWhatsAppRoute(phoneNumber);
            const router = typeof this.getRouter === 'function' ? this.getRouter() : null;

            if (router && typeof router.navigate === 'function') {
                router.navigate(route, {trigger: true});
                return;
            }

            window.location.hash = route;
        }

        isWhatsAppType(type) {
            return String(type || '').toLowerCase() === WHATSAPP_TYPE.toLowerCase();
        }

        formatForWhatsAppRoute(value) {
            const raw = String(value || '').trim();

            if (!raw) {
                return '';
            }

            if (raw.includes('@')) {
                return raw;
            }

            const digits = raw.replace(/[^0-9]/g, '');

            if (!digits) {
                return '';
            }

            return raw.charAt(0) === '+' ? '+' + digits : digits;
        }

        buildWhatsAppRoute(phoneNumber) {
            return '#WhatsApp?phoneNumber=' + encodeURIComponent(phoneNumber);
        }
    };
});
