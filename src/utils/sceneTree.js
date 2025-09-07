export function buildTreeFromObject3D(root) {
  if (!root) return null;
  const toNode = (obj) => ({
    id: obj.uuid,
    name: obj.name || obj.type,
    type: obj.type,
    visible: obj.visible,
    children: obj.children?.map(toNode) || [],
  });
  return toNode(root);
}

export function collectMeshes(object3D) {
  const meshes = [];
  if (!object3D) return meshes;
  object3D.traverse((o) => {
    if (o.isMesh) meshes.push(o);
  });
  return meshes;
}

export function findObjectByUUID(root, uuid) {
  if (!root || !uuid) return null;
  let found = null;
  root.traverse((o) => {
    if (o.uuid === uuid) found = o;
  });
  return found;
}


