define('custom:views/workflows/fields/conditions', [
    'views/admin/field-manager/fields/dynamic-logic-conditions'
], function (BaseView) {

    return class extends BaseView {

        setup() {
            super.setup();

            this.scope = this.getWorkflowScope();

            this.listenTo(this.model, 'change:entityType', async () => {
                const nextScope = this.getWorkflowScope();

                if (nextScope === this.scope) {
                    return;
                }

                this.scope = nextScope;
                this.conditionGroup = [];
                this.model.set(this.name, null);

                if (this.isRendered()) {
                    await this.reRender();
                }
            });
        }

        data() {
            return {
                ...super.data(),
                hasEntityType: !!this.getWorkflowScope(),
            };
        }

        async prepare() {
            this.scope = this.getWorkflowScope();
            this.conditionGroup = Espo.Utils.cloneDeep((this.model.attributes[this.name] || {}).conditionGroup || []);

            if (!this.scope) {
                return;
            }

            return this.createStringView();
        }

        edit() {
            if (!this.scope) {
                Espo.Ui.warning(this.translate('selectEntityTypeFirst', 'messages', 'WorkflowDefinition'));

                return;
            }

            super.edit();
        }

        getWorkflowScope() {
            return this.model.get('entityType') || this.params.scope || this.options.scope || null;
        }
    };
});
