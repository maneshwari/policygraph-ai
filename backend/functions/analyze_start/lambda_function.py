import json
import boto3
import uuid
import os
from datetime import datetime, timezone

dynamodb = boto3.resource("dynamodb")
lambda_client = boto3.client("lambda")

TABLE_NAME = os.environ["JOBS_TABLE"]
WORKER_FUNCTION = os.environ["WORKER_FUNCTION_NAME"]


def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    try:
        body = json.loads(event.get("body") or "{}")
        s3_key = body.get("s3_key")

        if not s3_key:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "s3_key is required"}),
            }

        job_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc).isoformat()
        ttl = int(datetime.now(timezone.utc).timestamp()) + 3600

        table = dynamodb.Table(TABLE_NAME)
        table.put_item(Item={
            "job_id": job_id,
            "status": "PENDING",
            "stage": "PENDING",
            "s3_key": s3_key,
            "created_at": now,
            "updated_at": now,
            "ttl": ttl,
        })

        lambda_client.invoke(
            FunctionName=WORKER_FUNCTION,
            InvocationType="Event",
            Payload=json.dumps({"job_id": job_id, "s3_key": s3_key}),
        )

        return {
            "statusCode": 202,
            "headers": headers,
            "body": json.dumps({
                "job_id": job_id,
                "status": "PENDING",
                "message": f"Job queued. Poll /analyze/status/{job_id} for updates.",
            }),
        }

    except Exception as e:
        print(f"ERROR in analyze_start: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
