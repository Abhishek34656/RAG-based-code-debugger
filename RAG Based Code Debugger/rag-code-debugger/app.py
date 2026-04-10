from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from rag_engine import retrieve_relevant_rules, build_prompt
from gemini_client import generate_stream, analyze_comparison, stream_comparison_analysis
import json

app = Flask(__name__, static_folder="static")


@app.route("/")
def index():
    return send_from_directory(app.static_folder, "index.html")


@app.route("/<path:filename>")
def static_files(filename):
    return send_from_directory(app.static_folder, filename)


@app.route("/debug", methods=["POST"])
def debug_code():
    data = request.get_json()
    mode = (data.get("mode") or "single").strip()

    # ── Comparison Mode ────────────────────────────────────────
    if mode == "comparison":
        code_a = (data.get("code_a") or "").strip()
        code_b = (data.get("code_b") or "").strip()
        language_a = (data.get("language_a") or "Python").strip()
        language_b = (data.get("language_b") or "Python").strip()

        if not code_a or not code_b:
            return jsonify({"error": "Both Code A and Code B are required for comparison."}), 400

        def comparison_stream():
            try:
                result = analyze_comparison(code_a, code_b, language_a, language_b)
                yield f"data: {json.dumps({'heatmap_a': {'lines': result['hotspots_A']}})}\n\n"
                yield f"data: {json.dumps({'heatmap_b': {'lines': result['hotspots_B']}})}\n\n"
                yield f"data: {json.dumps({'winner': result['winner'], 'justification': result['justification'], 'comparison_summary': result['comparison_summary']})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"
                return
            try:
                for chunk in stream_comparison_analysis(
                    code_a, code_b, language_a, language_b,
                    result["winner"], result["justification"], result["comparison_summary"]
                ):
                    yield f"data: {json.dumps({'chunk': chunk})}\n\n"
                yield f"data: {json.dumps({'done': True})}\n\n"
            except Exception as e:
                yield f"data: {json.dumps({'error': str(e)})}\n\n"

        return Response(
            stream_with_context(comparison_stream()),
            mimetype="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )

    # ── Single Mode ────────────────────────────────────────────
    code = (data.get("code") or "").strip()
    language = (data.get("language") or "Python").strip()

    if not code:
        return jsonify({"error": "No code provided."}), 400

    rules = retrieve_relevant_rules(code, language)
    prompt = build_prompt(code, language, rules)
    rules_used = len(rules)

    def event_stream():
        yield f"data: {json.dumps({'rules_used': rules_used})}\n\n"
        try:
            for chunk in generate_stream(prompt):
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'done': True})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return Response(
        stream_with_context(event_stream()),
        mimetype="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
