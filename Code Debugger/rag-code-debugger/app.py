from flask import Flask, request, jsonify, send_from_directory, Response, stream_with_context
from rag_engine import retrieve_relevant_rules, build_prompt
from gemini_client import generate_stream
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
    code = (data.get("code") or "").strip()
    language = (data.get("language") or "Python").strip()

    if not code:
        return jsonify({"error": "No code provided."}), 400

    rules = retrieve_relevant_rules(code, language)
    prompt = build_prompt(code, language, rules)
    rules_used = len(rules)

    def event_stream():
        # Send rules count first so the frontend can show the badge immediately
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
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


if __name__ == "__main__":
    app.run(debug=True, port=5000)
