import type { Db, Tx } from '../db/client.js';
import { auditEvents } from '../db/schema.js';

export type AuditInput = {
  actorId: string | null;
  entityType:
    | 'language'
    | 'course'
    | 'lesson'
    | 'asset'
    | 'publication'
    | 'catalog'
    | 'mascot'
    | 'item'
    | 'wardrobe';
  entityId: string;
  action: string;
  payload?: Record<string, unknown>;
};

/** Written inside the same transaction as the change it describes. Never stores secrets. */
export async function audit(tx: Tx | Db, input: AuditInput) {
  await tx.insert(auditEvents).values({
    actorId: input.actorId,
    entityType: input.entityType,
    entityId: input.entityId,
    action: input.action,
    payload: input.payload ?? null,
  });
}
