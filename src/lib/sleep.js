import { registry } from '../components/registry.js';

export function getSleep(em, id) {
  if (em.hasComponent(id, 'sleep')) {
    return em.getComponent(id, 'sleep');
  }
  const groupId = em.getComponent(id, 'groupRef');
  return groupId != null ? em.getComponent(groupId, 'sleep') : registry.sleep();
}
