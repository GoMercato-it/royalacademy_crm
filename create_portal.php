<?php
include 'bootstrap.php';
$app = new \Espo\Core\Application();
$app->setupSystemUser();
$em = $app->getContainer()->get('entityManager');

$portal = $em->getRepository('Portal')->where(['name' => 'Student Portal'])->findOne();
if (!$portal) {
    $portal = $em->getNewEntity('Portal');
    $portal->set('name', 'Student Portal');
}
$portal->set('isActive', true);

$portalRole = $em->getRepository('PortalRole')->where(['name' => 'StudentPortalRole'])->findOne();
if ($portalRole) {
    $portal->set('portalRolesIds', [$portalRole->getId()]);
}

$portal->set('tabList', ['Dashboard', 'Course']);
$portal->set('quickCreateList', []);
$portal->set('customCss', ":root {\n  --primary-color: #c9a84c;\n  --bg-color: #1a1a1a;\n}");
$portal->set('theme', 'Espo');

$em->saveEntity($portal);

echo "Student Portal created.\n";
