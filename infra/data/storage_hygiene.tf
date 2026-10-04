# Abort abandoned uploads only. Completed evidence and its versions retain the
# existing explicit incident-deletion lifecycle.
resource "aws_s3_bucket_lifecycle_configuration" "evidence_uploads" {
  bucket = aws_s3_bucket.evidence.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}
