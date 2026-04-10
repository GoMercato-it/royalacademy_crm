<?php

namespace Espo\Modules\WhatsApp\Classes\RecordHooks\Lead;

use Espo\Core\Record\Hook\SaveHook;
use Espo\Core\Utils\Config;
use Espo\Core\Utils\Log;
use Espo\Modules\Crm\Entities\Lead;
use Espo\Modules\WhatsApp\Core\WhatsAppClient;
use Espo\Modules\WhatsApp\Services\MessageDispatchService;
use Espo\ORM\Entity;

/**
 * @implements SaveHook<Lead>
 */
class AfterCreate implements SaveHook
{
    public function __construct(
        private WhatsAppClient $whatsappClient,
        private MessageDispatchService $messageDispatchService,
        private Config $config,
        private Log $log
    ) {}

    public function process(Entity $entity): void
    {
        $phoneNumber = $entity->get('phoneNumber');

        if (!$this->config->get('whatsappAutoMessageEnabled')) {
            return;
        }

        if (!$phoneNumber) {
            $this->log->info('WhatsApp AfterCreate hook: Lead has no phone number.', [
                'leadId' => $entity->getId(),
            ]);

            return;
        }

        $status = $this->whatsappClient->getSessionStatus();

        if ($status !== 'authenticated') {
            $this->log->warning('WhatsApp AfterCreate hook: Session not authenticated, skipping auto-message.');

            return;
        }

        $message = $this->buildMessageTemplate($entity);

        try {
            $result = $this->messageDispatchService->sendMessage($phoneNumber, $message);
            $sent = (bool) ($result['success'] ?? false);

            if ($sent) {
                $this->log->info('WhatsApp AfterCreate hook: Message sent.', [
                    'leadId' => $entity->getId(),
                    'phone' => $phoneNumber,
                ]);

                return;
            }

            $this->log->warning('WhatsApp AfterCreate hook: Failed to send message.', [
                'leadId' => $entity->getId(),
                'error' => $result['error'] ?? null,
            ]);
        } catch (\Throwable $e) {
            $this->log->error('WhatsApp AfterCreate hook: Error sending message.', [
                'leadId' => $entity->getId(),
                'error' => $e->getMessage(),
            ]);
        }
    }

    private function buildMessageTemplate(Lead $lead): string
    {
        $template = $this->config->get('whatsappLeadTemplate');

        if (empty($template)) {
            $template = 'Ciao {name}! Grazie per il tuo interesse. Ti contatteremo presto.';
        }

        $placeholders = [
            '{name}' => $lead->get('firstName') ?? $lead->get('name') ?? 'Cliente',
            '{company}' => $lead->get('accountName') ?? '',
            '{source}' => $lead->get('source') ?? '',
        ];

        return str_replace(array_keys($placeholders), array_values($placeholders), $template);
    }
}
