<?php

namespace Espo\Modules\WhatsApp\Classes\RebuildActions;

use Espo\Core\Rebuild\RebuildAction;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Config\ConfigWriter;

class EnsureWhatsAppTab implements RebuildAction
{
    private const SCOPE = 'WhatsApp';
    private const INSERT_AFTER_SCOPE = 'Email';

    public function __construct(
        private Config $config,
        private ConfigWriter $configWriter
    ) {}

    public function process(): void
    {
        $tabList = $this->config->get('tabList') ?? [];

        if (!is_array($tabList)) {
            return;
        }

        if (in_array(self::SCOPE, $tabList, true)) {
            return;
        }

        $index = array_search(self::INSERT_AFTER_SCOPE, $tabList, true);

        if ($index === false) {
            $tabList[] = self::SCOPE;
        } else {
            array_splice($tabList, $index + 1, 0, [self::SCOPE]);
        }

        $this->configWriter->set('tabList', $tabList);
        $this->configWriter->save();
    }
}
