import json

def evaluate_condition(clause, user_inputs):
    variable = clause.get("variable", "").lower()
    operator = clause.get("operator", "")
    threshold = clause.get("threshold_value")
    user_val = user_inputs.get(variable)
    if user_val is None:
        return None, "missing_input"
    try:
        u = float(user_val)
        t = float(threshold)
        result = {"EQ": u==t, "NEQ": u!=t, "LT": u<t, "LTE": u<=t, "GT": u>t, "GTE": u>=t}.get(operator)
        return result, "evaluated"
    except (ValueError, TypeError):
        u_str = str(user_val).lower()
        t_str = str(threshold).lower()
        result = {"EQ": u_str==t_str, "NEQ": u_str!=t_str, "IN": u_str in t_str, "NOT_IN": u_str not in t_str}.get(operator)
        return result, "evaluated"

def lambda_handler(event, context):
    headers = {"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST,OPTIONS"}
    if event.get("httpMethod") == "OPTIONS":
        return {"statusCode": 200, "headers": headers, "body": ""}
    try:
        body = json.loads(event.get("body", "{}"))
        clauses = body.get("clauses", [])
        user_inputs = {k.lower(): v for k, v in body.get("user_inputs", {}).items()}
        if not clauses:
            return {"statusCode": 400, "headers": headers, "body": json.dumps({"error": "clauses required"})}
        trace = []
        overall = "ELIGIBLE"
        has_conditional = False
        for i, clause in enumerate([c for c in clauses if c.get("clause_type") in ["ELIGIBILITY","DISQUALIFICATION"]]):
            result, status = evaluate_condition(clause, user_inputs)
            confidence = clause.get("confidence", 0.8)
            step = {"step": i+1, "condition": f"{clause.get('variable')} {clause.get('operator')} {clause.get('threshold_value')}", "clause_text": clause.get("text",""), "clause_ref": clause.get("clause_id",""), "user_value": user_inputs.get(clause.get("variable","").lower(), "not provided"), "confidence": confidence, "ambiguity_flag": clause.get("ambiguity_flag", False)}
            if status == "missing_input":
                step["result"] = None; step["outcome"] = "SKIPPED"; has_conditional = True
            elif result is None:
                step["result"] = None; step["outcome"] = "UNKNOWN"; has_conditional = True
            else:
                step["result"] = result
                if clause.get("clause_type") == "DISQUALIFICATION":
                    step["outcome"] = "FAIL" if result else "PASS"
                    if result: overall = "NOT_ELIGIBLE"
                else:
                    step["outcome"] = "PASS" if result else "FAIL"
                    if not result: overall = "NOT_ELIGIBLE"
            if confidence < 0.6:
                step["low_confidence_warning"] = True
            trace.append(step)
        if overall == "ELIGIBLE" and has_conditional:
            overall = "CONDITIONAL"
        avg_confidence = round(sum(s["confidence"] for s in trace) / len(trace), 2) if trace else 0.0
        return {"statusCode": 200, "headers": headers, "body": json.dumps({"result": overall, "confidence": avg_confidence, "reasoning_trace": trace, "passed": sum(1 for s in trace if s.get("outcome")=="PASS"), "failed": sum(1 for s in trace if s.get("outcome")=="FAIL"), "disclaimer": "Advisory only. Not legally binding."})}
    except Exception as e:
        return {"statusCode": 500, "headers": headers, "body": json.dumps({"error": str(e)})}
