# Dolar-Ar Slack Webhook

## Introduction

This small NodeJS script reads exchange rates from Argentine newspapers and posts them to a Slack webhook.

This version is intended to be hosted using Docker.

## Testing

Required environment variables:

- `SLACK_WEBHOOK=https://slack-webhook-url/`
- `NODE_ENV=production`
- `STORE_BUCKET=s3-bucket-name`
- `STORE_KEY=file-name.json`
- `S3_ENDPOINT=http://minio:9000` (Empty if using S3)
- `AWS_ACCESS_KEY_ID=minio`
- `AWS_SECRET_ACCESS_KEY=ABC123abc`

To test it, run using docker-compose as follows:

```
docker-compose up --build
```

That's it. Enjoy!
