from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import subprocess, uuid, os, shutil
import threading
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app, resources={r"/clip": {"origins": "*"}})

@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return resp

@app.route('/clip', methods=['POST', 'OPTIONS'])
def clip_video():
    if request.method == 'OPTIONS':
        return '', 204

    data = request.get_json(force=True)
    url, start, end, format_type = data.get('url'), data.get('start'), data.get('end'), data.get('format', 'mp4')
    if not (url and start and end):
        return jsonify(error="missing url/start/end"), 400

    uid = uuid.uuid4().hex
    
    # Set file extensions based on format
    if format_type == 'mp3':
        temp_fn = f"temp_{uid}.%(ext)s"  # Let yt-dlp decide the extension
        out_fn = f"clip_{uid}.mp3"
    else:
        temp_fn = f"temp_{uid}.mp4"
        out_fn = f"clip_{uid}.mp4"

    try:
        # 1) download full video/audio based on format
        if format_type == 'mp3':
            # Extract audio only
            subprocess.run([
                "yt-dlp", url,
                "-x", "--audio-format", "mp3",
                "-o", temp_fn
            ], check=True)
            # Find the actual downloaded file (yt-dlp changes extension)
            temp_files = [f for f in os.listdir('.') if f.startswith(f"temp_{uid}")]
            if temp_files:
                actual_temp_fn = temp_files[0]
            else:
                raise Exception("Downloaded file not found")
        else:
            # Download video
            subprocess.run([
                "yt-dlp", url,
                "-f", "bestvideo+bestaudio",
                "--merge-output-format", "mp4",
                "-o", temp_fn
            ], check=True)
            actual_temp_fn = temp_fn

        # 2) trim with ffmpeg
        if format_type == 'mp3':
            # Audio trimming
            subprocess.run([
                "ffmpeg", "-y",
                "-i", actual_temp_fn,
                "-ss", start,
                "-to", end,
                "-c", "copy",
                out_fn
            ], check=True)
        else:
            # Video trimming (stream copy)
            subprocess.run([
                "ffmpeg", "-y",
                "-i", actual_temp_fn,
                "-ss", start,
                "-to", end,
                "-c", "copy",
                out_fn
            ], check=True)

    except subprocess.CalledProcessError as e:
        # clean up partials
        temp_files = [f for f in os.listdir('.') if f.startswith(f"temp_{uid}") or f.startswith(f"clip_{uid}")]
        for fn in temp_files:
            if os.path.exists(fn): os.remove(fn)
        return jsonify(error=str(e)), 500

    # remove temp, serve trimmed clip
    temp_files = [f for f in os.listdir('.') if f.startswith(f"temp_{uid}")]
    for temp_file in temp_files:
        if os.path.exists(temp_file): os.remove(temp_file)
    return send_file(os.path.abspath(out_fn), as_attachment=True)

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=3000, debug=True)
