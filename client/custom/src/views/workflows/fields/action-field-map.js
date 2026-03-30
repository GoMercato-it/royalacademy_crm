define('custom:views/workflows/fields/action-field-map', [
    'views/fields/base'
], function (BaseView) {

    return class extends BaseView {

        editTemplateContent = `
<div class="workflow-field-map">
    <div class="list-group">
        {{#each itemDataList}}
        <div class="list-group-item">
            <div class="clearfix">
                <div class="pull-right">
                    <a
                        role="button"
                        tabindex="0"
                        data-action="removeItem"
                        data-index="{{index}}"
                        title="{{translate 'Remove'}}"
                    ><span class="fas fa-minus fa-sm"></span></a>
                </div>
                <div class="pull-left">
                    <strong>{{fieldLabel}}</strong>
                </div>
            </div>
            <div class="small text-muted" style="margin-top: 6px;">{{valueLabel}}</div>
            <div style="margin-top: 8px;">
                <a
                    role="button"
                    tabindex="0"
                    data-action="editItem"
                    data-index="{{index}}"
                >{{translate 'Edit'}}</a>
            </div>
        </div>
        {{/each}}
    </div>
    <div>
        <a
            role="button"
            tabindex="0"
            data-action="addItem"
            title="{{translate 'Add'}}"
        ><span class="fas fa-plus fa-sm"></span></a>
    </div>
</div>
`;

        detailTemplateContent = `
{{#if itemDataList.length}}
    <div class="list-group">
        {{#each itemDataList}}
        <div class="list-group-item">
            <div><strong>{{fieldLabel}}</strong></div>
            <div class="small text-muted" style="margin-top: 6px;">{{valueLabel}}</div>
        </div>
        {{/each}}
    </div>
{{else}}
    {{#if valueIsSet}}
        <span class="none-value">{{translate 'None'}}</span>
    {{else}}
        <span class="loading-value"></span>
    {{/if}}
{{/if}}
`;

        setup() {
            super.setup();

            this.addActionHandler('addItem', () => this.addItem());
            this.addActionHandler('editItem', (e, target) => this.editItem(parseInt(target.dataset.index)));
            this.addActionHandler('removeItem', (e, target) => this.removeItem(parseInt(target.dataset.index)));

            this.itemList = Espo.Utils.cloneDeep(this.model.get(this.name) || []);

            this.listenTo(this.model, 'change:targetEntityType', async () => {
                this.itemList = [];
                this.model.set(this.name, []);

                if (this.isRendered()) {
                    await this.reRender();
                }
            });
        }

        data() {
            return {
                ...super.data(),
                itemDataList: this.getItemDataList(),
                valueIsSet: this.model.has(this.name),
            };
        }

        addItem() {
            const entityType = this.model.get('targetEntityType');

            if (!entityType) {
                Espo.Ui.warning(this.translate('selectTargetEntityFirst', 'messages', 'WorkflowDefinition'));

                return;
            }

            this.openItemModal({}, data => {
                this.itemList.push(data);
                this.reRender();
                this.trigger('change');
            });
        }

        editItem(index) {
            const item = this.itemList[index];

            if (!item) {
                return;
            }

            this.openItemModal(item, data => {
                this.itemList[index] = data;
                this.reRender();
                this.trigger('change');
            });
        }

        removeItem(index) {
            if (!this.itemList[index]) {
                return;
            }

            this.itemList.splice(index, 1);
            this.reRender();
            this.trigger('change');
        }

        openItemModal(item, onApply) {
            this.createView('dialog', 'custom:views/workflows/modals/edit-field-map-item', {
                entityType: this.model.get('targetEntityType'),
                item: Espo.Utils.cloneDeep(item),
            }, view => {
                view.render();

                this.listenToOnce(view, 'apply', onApply);
            });
        }

        fetch() {
            const data = {};

            data[this.name] = this.itemList.length ? this.itemList : [];

            return data;
        }

        getItemDataList() {
            const entityType = this.model.get('targetEntityType');

            return this.itemList.map((item, index) => ({
                index: index,
                fieldLabel: this.translate(item.field || '', 'fields', entityType) || item.field || '',
                valueLabel: item.value || '',
            }));
        }
    };
});
