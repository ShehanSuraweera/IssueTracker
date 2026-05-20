import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../config/env";
import { AppError } from "../middleware/errorHandler";

const UPLOAD_EXPIRES_IN   = 300;  // 5 minutes
const DOWNLOAD_EXPIRES_IN = 900;  // 15 minutes

function requireS3(): { client: S3Client; bucket: string } {
  if (!env.AWS_REGION || !env.AWS_BUCKET_ATTACHMENTS) {
    throw new AppError(
      503,
      "S3_NOT_CONFIGURED",
      "File attachments are not enabled on this server"
    );
  }
  const client = new S3Client({ region: env.AWS_REGION });
  return { client, bucket: env.AWS_BUCKET_ATTACHMENTS };
}

export async function createPresignedUploadUrl(
  s3Key: string,
  mimeType: string,
  sizeBytes: number
): Promise<string> {
  const { client, bucket } = requireS3();
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: s3Key,
    ContentType: mimeType,
    ContentLength: sizeBytes,
  });
  return getSignedUrl(client, command, { expiresIn: UPLOAD_EXPIRES_IN });
}

export async function createPresignedDownloadUrl(s3Key: string): Promise<string> {
  const { client, bucket } = requireS3();
  const command = new GetObjectCommand({ Bucket: bucket, Key: s3Key });
  return getSignedUrl(client, command, { expiresIn: DOWNLOAD_EXPIRES_IN });
}

export { UPLOAD_EXPIRES_IN, DOWNLOAD_EXPIRES_IN };
