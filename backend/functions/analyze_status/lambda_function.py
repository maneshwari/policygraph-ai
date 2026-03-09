import json
import boto3
import os

dynamodb = boto3.resource("dynamodb")
TABLE_NAME = os.environ["JOBS_TABLE"]


def lambda_handler(event, context):
    headers = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type",
        "Content-Type": "application/json",
    }

    try:
        job_id = (event.get("pathParameters") or {}).get("job_id")
        if not job_id:
            return {
                "statusCode": 400,
                "headers": headers,
                "body": json.dumps({"error": "job_id is required in path"}),
            }

        table = dynamodb.Table(TABLE_NAME)
        response = table.get_item(Key={"job_id": job_id})
        item = response.get("Item")

        if not item:
            return {
                "statusCode": 404,
                "headers": headers,
                "body": json.dumps({"error": f"Job {job_id} not found"}),
            }

        status = item.get("status", "UNKNOWN")
        payload = {
            "job_id": job_id,
            "status": status,
            "stage": item.get("stage", ""),
            "created_at": item.get("created_at"),
            "updated_at": item.get("updated_at"),
        }

        if status == "COMPLETE":
            try:
                payload["result"] = json.loads(item.get("result", "{}"))
            except Exception:
                payload["result"] = item.get("result")
        elif status == "FAILED":
            payload["error"] = item.get("error", "Unknown error")
        elif status == "PROCESSING":
            if item.get("text_blocks"):
                payload["text_blocks"] = int(item["text_blocks"])
            if item.get("char_count"):
                payload["char_count"] = int(item["char_count"])

        return {
            "statusCode": 200,
            "headers": headers,
            "body": json.dumps(payload),
        }

    except Exception as e:
        print(f"ERROR in analyze_status: {e}")
        return {
            "statusCode": 500,
            "headers": headers,
            "body": json.dumps({"error": str(e)}),
        }
