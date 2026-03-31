<?php

namespace Espo\Modules\Workflows\Services;

use Espo\Core\Exceptions\NotFound;
use Espo\Core\Mail\ConfigDataProvider;
use Espo\Core\ORM\Repository\Option\SaveOption;
use Espo\Core\Utils\SystemUser;
use Espo\Entities\Email;
use Espo\ORM\Entity;
use Espo\ORM\EntityManager;
use Espo\Tools\Email\SendService;
use Espo\Tools\EmailTemplate\Data as EmailTemplateData;
use Espo\Tools\EmailTemplate\Params as EmailTemplateParams;
use Espo\Tools\EmailTemplate\Service as EmailTemplateService;
use RuntimeException;

class WorkflowEmailDispatchService
{
    public function __construct(
        private EntityManager $entityManager,
        private WorkflowValueResolver $workflowValueResolver,
        private SendService $sendService,
        private EmailTemplateService $emailTemplateService,
        private ConfigDataProvider $configDataProvider,
        private SystemUser $systemUser
    ) {
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function sendEmail(array $payload, array $context = []): array
    {
        $to = $this->resolveStringValue($payload['to'] ?? '', $context, 'to');
        $subject = $this->resolveNullableStringValue($payload['subject'] ?? '', $context);
        $body = $this->resolveNullableStringValue($payload['body'] ?? '', $context);

        $email = $this->prepareBaseEmail($to, $context);
        $email
            ->setSubject($subject)
            ->setBody($body)
            ->setIsHtml(false);

        $this->saveAsSystemDraft($email);
        $this->sendService->send($email);

        return [
            'action' => 'send_email',
            'emailId' => $email->getId(),
            'to' => $to,
            'subject' => $subject,
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function sendTemplate(array $payload, array $context = []): array
    {
        $to = $this->resolveStringValue($payload['to'] ?? '', $context, 'to');
        $templateId = $this->resolveStringValue(
            $payload['templateId'] ?? $payload['emailTemplateId'] ?? '',
            $context,
            'templateId'
        );

        try {
            $result = $this->emailTemplateService->process(
                $templateId,
                $this->buildTemplateData($to, $context),
                EmailTemplateParams::create()
                    ->withApplyAcl(false)
                    ->withCopyAttachments(true)
            );
        } catch (NotFound $e) {
            throw new RuntimeException("Email template not found: {$templateId}", 0, $e);
        }

        $email = $this->prepareBaseEmail($to, $context);
        $email
            ->setSubject($result->getSubject())
            ->setBody($result->getBody())
            ->setIsHtml($result->isHtml())
            ->setAttachmentIdList($result->getAttachmentIdList());

        $this->saveAsSystemDraft($email);
        $this->sendService->send($email);

        return [
            'action' => 'send_template',
            'emailId' => $email->getId(),
            'to' => $to,
            'templateId' => $templateId,
            'subject' => $email->getSubject(),
            'isHtml' => $email->isHtml(),
            'attachmentCount' => count($result->getAttachmentIdList()),
        ];
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, mixed> $context
     * @return array<string, mixed>
     */
    public function queueEmail(array $payload, array $context = []): array
    {
        $result = $this->sendEmail($payload, $context);
        $result['action'] = 'queue_email';
        $result['queuedByWorkflowMode'] = true;

        return $result;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function prepareBaseEmail(string $to, array $context): Email
    {
        $fromAddress = $this->configDataProvider->getSystemOutboundAddress();

        if (!$fromAddress) {
            throw new RuntimeException('System outbound email address is not configured.');
        }

        /** @var Email $email */
        $email = $this->entityManager->getNewEntity(Email::ENTITY_TYPE);

        $email
            ->addToAddress($to)
            ->setFromAddress($fromAddress);

        $email->set('isSystem', true);

        $parent = $this->resolveContextEntity($context);

        if ($parent) {
            $email->setParent($parent);
        }

        return $email;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function buildTemplateData(string $to, array $context): EmailTemplateData
    {
        $data = EmailTemplateData::create()->withEmailAddress($to);
        $parent = $this->resolveContextEntity($context);

        if ($parent) {
            $data = $data
                ->withParent($parent)
                ->withParentId($parent->getId())
                ->withParentType($parent->getEntityType())
                ->withEntityHash([
                    $parent->getEntityType() => $parent,
                ]);
        }

        return $data;
    }

    private function saveAsSystemDraft(Email $email): void
    {
        $systemUserId = $this->systemUser->getId();

        $this->entityManager->saveEntity($email, [
            SaveOption::CREATED_BY_ID => $systemUserId,
            SaveOption::MODIFIED_BY_ID => $systemUserId,
            SaveOption::SILENT => true,
        ]);
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveContextEntity(array $context): ?Entity
    {
        $entity = $context['entity'] ?? null;

        if ($entity instanceof Entity) {
            return $entity;
        }

        $entityType = (string) ($context['entityType'] ?? $context['workflowEntityType'] ?? '');
        $entityId = (string) ($context['entityId'] ?? '');

        if ($entityType === '' || $entityId === '') {
            return null;
        }

        return $this->entityManager->getEntityById($entityType, $entityId);
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveStringValue(mixed $value, array $context, string $name): string
    {
        $resolved = $this->workflowValueResolver->resolveValue($value, $context);
        $string = is_scalar($resolved) ? trim((string) $resolved) : '';

        if ($string === '') {
            throw new RuntimeException("Workflow email action requires {$name}.");
        }

        return $string;
    }

    /**
     * @param array<string, mixed> $context
     */
    private function resolveNullableStringValue(mixed $value, array $context): string
    {
        $resolved = $this->workflowValueResolver->resolveValue($value, $context);

        if ($resolved === null) {
            return '';
        }

        if (is_scalar($resolved)) {
            return (string) $resolved;
        }

        return '';
    }
}
