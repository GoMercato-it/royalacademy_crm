<?php

declare(strict_types=1);

/**
 * Custom-only integration contract checks for Task 3.
 *
 * Run from the project root:
 * ddev exec php custom/Espo/Modules/WhatsApp/Tests/Integration/Task3FeatureCoverageTest.php
 */

$projectRoot = dirname(__DIR__, 6);

final class Task3FeatureCoverageTest
{
    private int $assertions = 0;

    public function __construct(private string $projectRoot)
    {
    }

    public function run(): void
    {
        $routes = $this->loadRoutes();

        $this->assertRouteMap($routes);
        $this->assertControllerActions();
        $this->assertClientMethods();
        $this->assertReactionWebhookHandling();
        $this->assertFrontendApiMethods();
        $this->assertFrontendUiWiring();
        $this->assertApiDocumentation();

        echo sprintf("Task 3 integration contract checks passed (%d assertions).\n", $this->assertions);
    }

    private function loadRoutes(): array
    {
        $path = $this->path('custom/Espo/Modules/WhatsApp/Resources/routes.json');
        $this->assertFileExists($path);

        $routes = json_decode((string) file_get_contents($path), true);

        $this->assertTrue(is_array($routes), 'routes.json must decode to an array.');

        return $routes;
    }

    private function assertRouteMap(array $routes): void
    {
        $expected = [
            'post /WhatsApp/action/sendImage' => 'sendImage',
            'post /WhatsApp/action/sendVideo' => 'sendVideo',
            'post /WhatsApp/action/sendAudio' => 'sendAudio',
            'post /WhatsApp/action/sendVoiceNote' => 'sendVoiceNote',
            'post /WhatsApp/action/sendDocument' => 'sendDocument',
            'post /WhatsApp/action/sendSticker' => 'sendSticker',
            'post /WhatsApp/action/sendLocation' => 'sendLocation',
            'post /WhatsApp/action/sendContactCard' => 'sendContactCard',
            'post /WhatsApp/action/downloadMedia' => 'downloadMedia',
            'post /WhatsApp/action/editMessage' => 'editMessage',
            'post /WhatsApp/action/deleteMessage' => 'deleteMessage',
            'post /WhatsApp/action/reactToMessage' => 'reactToMessage',
            'post /WhatsApp/action/forwardMessage' => 'forwardMessage',
            'post /WhatsApp/action/starMessage' => 'starMessage',
            'post /WhatsApp/action/unstarMessage' => 'unstarMessage',
            'post /WhatsApp/action/getMessageReactions' => 'getMessageReactions',
            'post /WhatsApp/action/createPoll' => 'createPoll',
            'post /WhatsApp/action/getPollVotes' => 'getPollVotes',
            'post /WhatsApp/action/voteInPoll' => 'voteInPoll',
            'post /WhatsApp/action/setStatus' => 'setStatus',
            'get /WhatsApp/action/getContactStatus' => 'getContactStatus',
            'post /WhatsApp/action/updateProfilePicture' => 'updateProfilePicture',
            'get /WhatsApp/action/getContactProfilePicture' => 'getContactProfilePicture',
            'post /WhatsApp/action/blockUser' => 'blockUser',
            'post /WhatsApp/action/unblockUser' => 'unblockUser',
            'post /WhatsApp/action/checkNumberOnWhatsApp' => 'checkNumberOnWhatsApp',
            'get /WhatsApp/action/getBlockedContacts' => 'getBlockedContacts',
            'post /WhatsApp/action/archiveChat' => 'archiveChat',
            'post /WhatsApp/action/unarchiveChat' => 'unarchiveChat',
            'post /WhatsApp/action/muteChat' => 'muteChat',
            'post /WhatsApp/action/unmuteChat' => 'unmuteChat',
            'post /WhatsApp/action/pinChat' => 'pinChat',
            'post /WhatsApp/action/unpinChat' => 'unpinChat',
            'post /WhatsApp/action/markChatRead' => 'markChatRead',
            'post /WhatsApp/action/markChatUnread' => 'markChatUnread',
            'post /WhatsApp/action/clearChatMessages' => 'clearChatMessages',
        ];

        $actual = [];

        foreach ($routes as $route) {
            $key = strtolower((string) ($route['method'] ?? '')) . ' ' . (string) ($route['route'] ?? '');
            $actual[$key] = (string) ($route['params']['action'] ?? '');
        }

        foreach ($expected as $key => $action) {
            $this->assertTrue(isset($actual[$key]), "Missing route: {$key}");
            $this->assertSame($action, $actual[$key], "Unexpected controller action for {$key}");
        }
    }

    private function assertControllerActions(): void
    {
        $source = $this->read('custom/Espo/Modules/WhatsApp/Controllers/WhatsApp.php');
        $methods = [
            'postActionSendImage',
            'postActionSendVideo',
            'postActionSendAudio',
            'postActionSendVoiceNote',
            'postActionSendDocument',
            'postActionSendSticker',
            'postActionSendLocation',
            'postActionSendContactCard',
            'postActionDownloadMedia',
            'postActionEditMessage',
            'postActionDeleteMessage',
            'postActionReactToMessage',
            'postActionForwardMessage',
            'postActionStarMessage',
            'postActionUnstarMessage',
            'postActionGetMessageReactions',
            'postActionCreatePoll',
            'postActionGetPollVotes',
            'postActionVoteInPoll',
            'postActionSetStatus',
            'getActionGetContactStatus',
            'postActionUpdateProfilePicture',
            'getActionGetContactProfilePicture',
            'postActionBlockUser',
            'postActionUnblockUser',
            'postActionCheckNumberOnWhatsApp',
            'getActionGetBlockedContacts',
            'postActionArchiveChat',
            'postActionUnarchiveChat',
            'postActionMuteChat',
            'postActionUnmuteChat',
            'postActionPinChat',
            'postActionUnpinChat',
            'postActionMarkChatRead',
            'postActionMarkChatUnread',
            'postActionClearChatMessages',
        ];

        foreach ($methods as $method) {
            $this->assertContains("function {$method}(", $source, "Missing controller method {$method}");
        }
    }

    private function assertClientMethods(): void
    {
        $source = $this->read('custom/Espo/Modules/WhatsApp/Core/WhatsAppClient.php');
        $methods = [
            'sendImage',
            'sendVideo',
            'sendAudio',
            'sendVoiceNote',
            'sendDocument',
            'sendSticker',
            'sendLocation',
            'sendContactCard',
            'downloadMedia',
            'editMessage',
            'deleteMessage',
            'sendReaction',
            'forwardMessage',
            'starMessage',
            'unstarMessage',
            'getMessageReactions',
            'createPoll',
            'getPollVotes',
            'voteInPoll',
            'setStatus',
            'updateProfilePicture',
            'getContactProfilePicture',
            'blockUser',
            'unblockUser',
            'checkNumberOnWhatsApp',
            'getBlockedContacts',
            'archiveChat',
            'unarchiveChat',
            'muteChat',
            'unmuteChat',
            'pinChat',
            'unpinChat',
            'markChatRead',
            'markChatUnread',
            'clearChatMessages',
        ];

        foreach ($methods as $method) {
            $this->assertContains("function {$method}(", $source, "Missing WhatsAppClient method {$method}");
        }

        $this->assertContains('/client/sendMessage/', $source, 'Media and poll sends must use verified sendMessage endpoint.');
        $this->assertContains('makeMessageRequest(\'runMethod\'', $source, 'Poll voting must call the verified runMethod action.');
        $this->assertContains('/message/{$action}/', $source, 'Message operations must use the verified /message/{action} route family.');
    }

    private function assertFrontendApiMethods(): void
    {
        $source = $this->read('client/custom/vue-apps/whatsapp/src/utils/api.js');
        $methods = [
            'sendImage',
            'sendVideo',
            'sendAudio',
            'sendVoiceNote',
            'sendDocument',
            'sendSticker',
            'sendLocation',
            'sendContactCard',
            'downloadMedia',
            'editMessage',
            'deleteMessage',
            'reactToMessage',
            'forwardMessage',
            'starMessage',
            'unstarMessage',
            'getMessageReactions',
            'createPoll',
            'getPollVotes',
            'voteInPoll',
            'setStatus',
            'updateProfilePicture',
            'getContactProfilePicture',
            'blockUser',
            'unblockUser',
            'checkNumberOnWhatsApp',
            'getBlockedContacts',
            'archiveChat',
            'unarchiveChat',
            'muteChat',
            'unmuteChat',
            'pinChat',
            'unpinChat',
            'markChatRead',
            'markChatUnread',
            'clearChatMessages',
        ];

        foreach ($methods as $method) {
            $this->assertContains("{$method}(", $source, "Missing EspoApiClient method {$method}");
        }
    }

    private function assertReactionWebhookHandling(): void
    {
        $source = $this->read('custom/Espo/Modules/WhatsApp/Services/MessageDispatchService.php');
        $tokens = [
            'message_reaction',
            'processReactionWebhookData',
            'mergeReactionPayload',
            "payloadMeta['reactions']",
            'broadcastMessage($payload[\'chatId\'], $payload)',
        ];

        foreach ($tokens as $token) {
            $this->assertContains($token, $source, "Reaction webhook handling must include {$token}");
        }
    }

    private function assertFrontendUiWiring(): void
    {
        $store = $this->read('client/custom/vue-apps/whatsapp/src/stores/whatsapp.js');
        $app = $this->read('client/custom/vue-apps/whatsapp/src/App.vue');
        $composer = $this->read('client/custom/vue-apps/whatsapp/src/components/MessageComposer.vue');
        $thread = $this->read('client/custom/vue-apps/whatsapp/src/components/ChatThread.vue');
        $context = $this->read('client/custom/vue-apps/whatsapp/src/components/ContextPanel.vue');

        foreach (['sendMedia', 'sendLocation', 'sendContactCard', 'createPoll', 'voteInPoll', 'runChatOperation', 'setAccountStatus'] as $token) {
            $this->assertContains($token, $store, "Store must expose {$token}");
            $this->assertContains($token, $app, "App must wire {$token}");
        }

        foreach (['send-media', 'send-location', 'send-contact-card', 'create-poll', 'wa-composer-advanced'] as $token) {
            $this->assertContains($token, $composer, "Composer must expose {$token}");
        }

        foreach ([
            'message-action',
            'poll-vote',
            'download-media',
            'wa-msg-chevron',
            'wa-msg-menu',
            'wa-emoji-picker',
            'wa-emoji-picker__grid',
            'EMOJI_REACTION_CHOICES',
        ] as $token) {
            $this->assertContains($token, $thread, "Thread must expose {$token}");
        }

        foreach (['chat-operation', 'contact-operation', 'wa-action-section'] as $token) {
            $this->assertContains($token, $context, "Context panel must expose {$token}");
        }
    }

    private function assertApiDocumentation(): void
    {
        $source = $this->read('custom/Espo/Modules/WhatsApp/Docs/API.md');

        $tokens = [
            '/api/v1/WhatsApp/action',
            'Verified Upstream Bridge',
            'MessageMediaFromURL',
            'sendLocation',
            'sendContactCard',
            'voteInPoll',
            'updateProfilePicture',
            'checkNumberOnWhatsApp',
            'clearChatMessages',
            'Raw vCard sending is not implemented',
            'Task3FeatureCoverageTest.php',
        ];

        foreach ($tokens as $token) {
            $this->assertContains($token, $source, "API documentation must include {$token}");
        }
    }

    private function read(string $relativePath): string
    {
        $path = $this->path($relativePath);
        $this->assertFileExists($path);

        return (string) file_get_contents($path);
    }

    private function path(string $relativePath): string
    {
        return $this->projectRoot . '/' . ltrim($relativePath, '/');
    }

    private function assertFileExists(string $path): void
    {
        $this->assertTrue(is_file($path), "File does not exist: {$path}");
    }

    private function assertContains(string $needle, string $haystack, string $message): void
    {
        $this->assertTrue(str_contains($haystack, $needle), $message);
    }

    private function assertSame(string $expected, string $actual, string $message): void
    {
        $this->assertions++;

        if ($expected !== $actual) {
            throw new RuntimeException("{$message}. Expected `{$expected}`, got `{$actual}`.");
        }
    }

    private function assertTrue(bool $condition, string $message): void
    {
        $this->assertions++;

        if (!$condition) {
            throw new RuntimeException($message);
        }
    }
}

(new Task3FeatureCoverageTest($projectRoot))->run();
