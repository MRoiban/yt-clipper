from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import subprocess, uuid, os, shutil
import threading
import time
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app, resources={r"/clip": {"origins": "*"}})

# --- Added for delayed deletion ---
files_to_delete = {}
files_lock = threading.Lock()
DELETION_DELAY_MINUTES = 5  # Configure as needed
# --- End of added section ---

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

    actual_temp_fn_path = None # Store the actual temp filename path

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
            # Ensure we search in the correct directory (current working directory)
            temp_files_found = [f for f in os.listdir('.') if f.startswith(f"temp_{uid}")]
            if temp_files_found:
                actual_temp_fn_path = os.path.abspath(temp_files_found[0])
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
            actual_temp_fn_path = os.path.abspath(temp_fn)

        # 2) trim with ffmpeg
        output_file_path = os.path.abspath(out_fn)
        if format_type == 'mp3':
            # Audio trimming
            subprocess.run([
                "ffmpeg", "-y",
                "-i", actual_temp_fn_path,
                "-ss", start,
                "-to", end,
                "-c", "copy",
                output_file_path
            ], check=True)
        else:
            # Video trimming (stream copy)
            subprocess.run([
                "ffmpeg", "-y",
                "-i", actual_temp_fn_path,
                "-ss", start,
                "-to", end,
                "-c", "copy",
                output_file_path
            ], check=True)

    except subprocess.CalledProcessError as e:
        # clean up partials
        if actual_temp_fn_path and os.path.exists(actual_temp_fn_path):
             os.remove(actual_temp_fn_path)
        if os.path.exists(out_fn): # Check if out_fn was created before trying to remove
            os.remove(out_fn)
        # More robust cleanup for temp files based on initial temp_fn pattern
        # This handles cases where yt-dlp might create multiple files or if the exact name isn't known
        for f_name in os.listdir('.'):
            if f_name.startswith(f"temp_{uid}"):
                try:
                    os.remove(f_name)
                except OSError:
                    pass # File might have been removed already or other issue
        return jsonify(error=str(e)), 500
    finally:
        # Ensure temporary downloaded file is removed if it exists
        if actual_temp_fn_path and os.path.exists(actual_temp_fn_path):
            try:
                os.remove(actual_temp_fn_path)
            except OSError:
                # Log or handle error if necessary, e.g., file already removed
                pass


    # Schedule file for deletion
    with files_lock:
        files_to_delete[output_file_path] = datetime.now() + timedelta(minutes=DELETION_DELAY_MINUTES)

    return send_file(output_file_path, as_attachment=True)

# --- Added for delayed deletion ---
def cleanup_files_periodically():
    while True:
        now = datetime.now()
        files_to_remove_this_run = []
        with files_lock:
            for filepath, deletion_time in list(files_to_delete.items()): # Iterate over a copy
                if now >= deletion_time:
                    files_to_remove_this_run.append(filepath)
            
            for filepath in files_to_remove_this_run:
                try:
                    if os.path.exists(filepath):
                        os.remove(filepath)
                        print(f"Successfully deleted {filepath}")
                    del files_to_delete[filepath]
                except OSError as e:
                    print(f"Error deleting file {filepath}: {e}")
                    # Optionally, decide if you want to remove it from the dict anyway
                    # or retry later (though current logic just removes it from dict)
                    if filepath in files_to_delete: # Check if not already deleted by another thread/process
                        del files_to_delete[filepath]
        
        # Sleep for a while before checking again, e.g., every 60 seconds
        time.sleep(60)

# --- End of added section ---

if __name__ == '__main__':
    # --- Added for delayed deletion ---
    cleanup_thread = threading.Thread(target=cleanup_files_periodically, daemon=True)
    cleanup_thread.start()
    # --- End of added section ---
    app.run(host='0.0.0.0', port=3000, debug=True)
