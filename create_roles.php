<?php
include 'bootstrap.php';
$app = new \Espo\Core\Application();
$app->setupSystemUser();
$em = $app->getContainer()->get('entityManager');

// Create StudentRole
$role = $em->getRepository('Role')->where(['name' => 'StudentRole'])->findOne();
if (!$role) {
    $role = $em->getNewEntity('Role');
    $role->set('name', 'StudentRole');
    $em->saveEntity($role);
}

$data = json_decode(json_encode($role->get('data') ?: []), true);
$data['User'] = ['create' => 'no', 'read' => 'own', 'edit' => 'own', 'delete' => 'no', 'stream' => 'no'];
$data['Student'] = ['create' => 'no', 'read' => 'own', 'edit' => 'own', 'delete' => 'no', 'stream' => 'no'];
$data['CourseAccess'] = ['create' => 'no', 'read' => 'own', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['CourseSection'] = ['create' => 'no', 'read' => 'all', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['Course'] = ['create' => 'no', 'read' => 'all', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['Account'] = ['create' => 'no', 'read' => 'no', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['Contact'] = ['create' => 'no', 'read' => 'no', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['Lead'] = ['create' => 'no', 'read' => 'no', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$data['Opportunity'] = ['create' => 'no', 'read' => 'no', 'edit' => 'no', 'delete' => 'no', 'stream' => 'no'];
$role->set('data', (object) $data);
$em->saveEntity($role);

// Create PortalRole (StudentPortalRole)
$portalRole = $em->getRepository('PortalRole')->where(['name' => 'StudentPortalRole'])->findOne();
if (!$portalRole) {
    $portalRole = $em->getNewEntity('PortalRole');
    $portalRole->set('name', 'StudentPortalRole');
    $em->saveEntity($portalRole);
}

$portalRole->set('data', (object) $data);
$em->saveEntity($portalRole);

echo "Roles created successfully.\n";
