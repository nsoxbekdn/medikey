import { z } from "zod";

const allowedVitalsMetrics = ["systolic", "diastolic", "heartRate", "glucose", "spo2", "weight"] as const;

export const shareItemSchema = z
  .object({
    documentId: z.string().uuid().optional(),
    sanitizedArtifactId: z.string().uuid().optional(),
    vitalsDatasetId: z.string().uuid().optional(),
    selectedMetrics: z.array(z.enum(allowedVitalsMetrics)).min(1).max(allowedVitalsMetrics.length).optional(),
    wrappedAccessKey: z.string().min(1).max(4096),
    wrappingIv: z.string().min(1).max(256),
    encryptedStoragePath: z.string().min(1).max(1024).optional(),
    encryptionIv: z.string().min(1).max(256).optional(),
  })
  .superRefine((item, ctx) => {
    const targetCount = [item.documentId, item.sanitizedArtifactId, item.vitalsDatasetId].filter(Boolean).length;
    if (targetCount !== 1) {
      ctx.addIssue({ code: "custom", message: "Each share item must reference exactly one record." });
    }
    const isVitals = Boolean(item.vitalsDatasetId);
    const hasCompleteVitalsPayload = Boolean(item.selectedMetrics && item.encryptedStoragePath && item.encryptionIv);
    const hasAnyVitalsField = Boolean(item.selectedMetrics || item.encryptedStoragePath || item.encryptionIv);
    if ((isVitals && !hasCompleteVitalsPayload) || (!isVitals && hasAnyVitalsField)) {
      ctx.addIssue({ code: "custom", message: "Vitals shares require metrics and a share-specific encrypted blob." });
    }
  });

export const createShareSchema = z
  .object({
    providerLabel: z.string().trim().min(1).max(200),
    providerType: z.string().trim().min(1).max(100),
    purpose: z.string().trim().min(1).max(200),
    expiresAt: z.string().datetime(),
    oneTime: z.boolean().default(false),
    items: z.array(shareItemSchema).min(1).max(100),
  })
  .refine((input) => new Date(input.expiresAt).getTime() > Date.now(), {
    path: ["expiresAt"],
    message: "Expiry must be in the future.",
  });

export const accessEventSchema = z.object({
  eventType: z.literal("DECRYPTION_CONFIRMED"),
  actorType: z.literal("provider"),
});

export const vitalsMappingFieldSchema = z.enum([
  "timestamp",
  "systolic",
  "diastolic",
  "heartRate",
  "glucose",
  "spo2",
  "weight",
]);

export const vitalsUploadSchema = z.object({
  name: z.string().min(1).max(120),
  mapping: z.record(vitalsMappingFieldSchema, z.string()),
});

export const aiQuerySchema = z.object({
  question: z.string().min(1).max(1000),
  sanitizedContext: z
    .array(z.object({ sourceId: z.string(), text: z.string() }))
    .min(1)
    .max(20),
});

// Route params are untrusted; reject non-UUID share ids before they reach Postgres.
export const shareIdSchema = z.string().uuid();
