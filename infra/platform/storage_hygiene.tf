resource "aws_s3_bucket_lifecycle_configuration" "web_uploads" {
  bucket = aws_s3_bucket.web.id
  rule {
    id     = "abort-incomplete-uploads"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload { days_after_initiation = 7 }
  }
}
