import json
import boto3
import os
import uuid

s3_client = boto3.client(
    "s3",
    region_name="ap-south-1",
    endpoint_url="https://s3.ap-south-1.amazonaws.com"
)
BUCKET_NAME = os.environ.get("BUCKET_NAME", "policygraph-ai-docs-251456382330")

def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Access-Control-Allow-Methods": "GET,OPTIONS"
    }
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        file_key = f"uploads/{uuid.uuid4()}.pdf"
        presigned_url = s3_client.generate_presigned_url(
            "put_object",
            Params={"Bucket": BUCKET_NAME, "Key": file_key, "ContentType": "application/pdf"},
            ExpiresIn=600
        )
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"upload_url": presigned_url, "s3_key": file_key})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
