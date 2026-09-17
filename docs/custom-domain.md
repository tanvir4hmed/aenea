# Aenea custom domain

Chosen hostname: `aenea.qleam.com`. DNS stays with the domain's existing authoritative provider; the user will enter the records in Namecheap if Namecheap hosts the zone. No nameserver migration or Route 53 hosted zone is required.

The AWS Builder mini uses the same app. IncidentBridge is a library with a public repository and release; it does not need a separate hostname.

## DNS handoff

After AWS bootstrap and GitHub environment variables are configured, the first all/infrastructure deploy creates an ACM certificate in us-east-1 and publishes its exact CNAME validation record in the Actions job summary. The platform deployment publishes a second CNAME pointing `aenea` to its generated CloudFront hostname.

Add both in Namecheap Advanced DNS under qleam.com with Automatic TTL. The certificate record's Host is the generated `_token.aenea` name, with the qleam.com suffix removed. Its Value is the exact generated ACM target. The website Host is `aenea`; its Value is the exact generated CloudFront hostname. Do not paste placeholder values or add a URL scheme. Leave the certificate-validation CNAME in place for renewal.

Once DNS is entered, dispatch the deployment workflow with component `domain`. The pipeline reads ACM status once and attaches the custom hostname only when the certificate is ISSUED. It does not wait for manual DNS changes. While pending, the default CloudFront hostname stays available. If still pending at dispatch, dispatch domain again later.

Cognito callback/logout URLs and API CORS include the selected custom origin. HTTPS uses the ACM certificate; the hosted frontend reads API/auth settings from config.json.

AWS access was unavailable when this configuration was authored. No actual certificate token or CloudFront hostname has been produced or represented as a live deployment. Required GitHub demo environment variables: AWS_REGION, TF_STATE_BUCKET, AWS_ROLE_ARN. The approved deployment policy must also cover ACM operations in us-east-1 and the tls state key.

References: [CloudFront certificate requirements](https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cnames-and-https-requirements.html), [ACM DNS validation](https://docs.aws.amazon.com/acm/latest/userguide/dns-validation.html).
