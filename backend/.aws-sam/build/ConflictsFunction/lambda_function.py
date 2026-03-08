import json

def check_conflict(a, b, doc_a, doc_b):
    try:
        va = float(a.get("threshold_value", 0))
        vb = float(b.get("threshold_value", 0))
    except:
        return None
    oa, ob = a.get("operator",""), b.get("operator","")
    conflict = False
    if oa in ["GT","GTE"] and ob in ["LT","LTE"] and va >= vb: conflict = True
    elif oa in ["LT","LTE"] and ob in ["GT","GTE"] and vb >= va: conflict = True
    elif oa == "EQ" and ob == "EQ" and va != vb: conflict = True
    if conflict:
        return {"id": f"conflict_{a.get('clause_id')}_{b.get('clause_id')}", "severity": "HIGH", "type": "INCOMPATIBLE_THRESHOLD", "variable": a.get("variable"), "description": f"'{doc_a}' requires {a.get('variable')} {oa} {va} but '{doc_b}' requires {ob} {vb}", "clause_a": {"document": doc_a, "ref": a.get("clause_id"), "text": a.get("text","")}, "clause_b": {"document": doc_b, "ref": b.get("clause_id"), "text": b.get("text","")}}
    return None

def lambda_handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS"}
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        body = json.loads(event.get("body", "{}"))
        documents = body.get("documents", [])
        if not documents:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "documents array required"})}
        conflicts = []
        for i in range(len(documents)):
            for j in range(i+1, len(documents)):
                da, db = documents[i], documents[j]
                vm_a, vm_b = {}, {}
                for c in da.get("clauses",[]): vm_a.setdefault(c.get("variable","").lower(),[]).append(c)
                for c in db.get("clauses",[]): vm_b.setdefault(c.get("variable","").lower(),[]).append(c)
                for var in set(vm_a) & set(vm_b):
                    for ca in vm_a[var]:
                        for cb in vm_b[var]:
                            r = check_conflict(ca, cb, da.get("title","Doc A"), db.get("title","Doc B"))
                            if r: conflicts.append(r)
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"total_conflicts": len(conflicts), "conflicts": conflicts, "disclaimer": "Advisory only."})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
