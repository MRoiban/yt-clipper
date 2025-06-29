from flask import Flask, request, send_file, jsonify
from flask_cors import CORS
import subprocess, uuid, os, shutil
import threading
import time
from datetime import datetime, timedelta
import re

app = Flask(__name__)
CORS(app)

# --- Globals for job status ---
jobs = {}
jobs_lock = threading.Lock()
# ---

# --- For delayed deletion ---
files_to_delete = {}
files_lock = threading.Lock()
DELETION_DELAY_MINUTES = 5  # Configure as needed
# ---

@app.after_request
def add_cors(resp):
    resp.headers["Access-Control-Allow-Origin"]  = "*"
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Requested-With"
    return resp

@app.route('/clip', methods=['POST'])
def clip_video():
    data = request.get_json(force=True)
    url, start, end, format_type = data.get('url'), data.get('start'), data.get('end'), data.get('format', 'mp4')
    if not (url and start and end):
        return jsonify(error="missing url/start/end"), 400

    job_id = uuid.uuid4().hex
    
    with jobs_lock:
        jobs[job_id] = {'status': 'starting', 'progress': {}}

    thread = threading.Thread(target=download_and_trim, args=(job_id, url, start, end, format_type))
    thread.start()
    
    return jsonify(job_id=job_id)

@app.route('/status/<job_id>', methods=['GET'])
def get_status(job_id):
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None:
            return jsonify(error="Job not found"), 404
        return jsonify(job)

@app.route('/download/<job_id>', methods=['GET'])
def download_file(job_id):
    filepath = None
    with jobs_lock:
        job = jobs.get(job_id)
        if job is None or job.get('status') != 'completed':
            return jsonify(error="File not ready or job not found"), 404
        
        filepath = job.get('filepath')

    if not filepath or not os.path.exists(filepath):
        return jsonify(error="File not found on server"), 404

    with files_lock:
        files_to_delete[filepath] = datetime.now() + timedelta(minutes=DELETION_DELAY_MINUTES)
    
    return send_file(filepath, as_attachment=True)

def download_and_trim(job_id, url, start, end, format_type):
    with jobs_lock:
        jobs[job_id]['status'] = 'downloading'

    uid = job_id
    if format_type == 'mp3':
        temp_fn_pattern = f"temp_{uid}.%(ext)s"
        out_fn = f"clip_{uid}.mp3"
    else:
        temp_fn_pattern = f"temp_{uid}.mp4"
        out_fn = f"clip_{uid}.mp4"
    
    actual_temp_fn_path = None
    output_file_path = os.path.abspath(out_fn)

    try:
        cmd = ["yt-dlp", url, "-o", temp_fn_pattern, '--progress', '--no-playlist']
        if format_type == 'mp3':
            cmd.extend(["-x", "--audio-format", "mp3"])
        else:
            cmd.extend(["-f", "best", "--merge-output-format", "mp4"])

        process = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, universal_newlines=True, bufsize=1)

        for line in iter(process.stdout.readline, ''):
            match = re.search(r'\[download\]\s+(?P<percent>[\d\.]+)%\s+of\s+~\s*(?P<size>[\d\.]+\w+)\s+at\s+(?P<speed>[\d\.]+\w+/s)\s+ETA\s+(?P<eta>[\d:]+)', line)
            if match:
                progress_data = match.groupdict()
                with jobs_lock:
                    jobs[job_id]['progress'] = {
                        'percent': progress_data['percent'],
                        'eta': progress_data['eta'],
                        'speed': progress_data['speed'],
                        'size': progress_data['size']
                    }
        
        process.stdout.close()
        return_code = process.wait()
        
        if return_code != 0:
            stderr_output = process.stderr.read()
            raise subprocess.CalledProcessError(return_code, cmd, stderr=stderr_output)

        temp_files_found = [f for f in os.listdir('.') if f.startswith(f"temp_{uid}")]
        if temp_files_found:
            actual_temp_fn_path = os.path.abspath(temp_files_found[0])
        else:
            raise Exception("Downloaded file not found")
        
        with jobs_lock:
            jobs[job_id]['status'] = 'trimming'
            jobs[job_id]['progress'] = {}

        ffmpeg_cmd = [
            "ffmpeg", "-y",
            "-i", actual_temp_fn_path,
            "-ss", start,
            "-to", end,
            "-c", "copy",
            output_file_path
        ]
        result = subprocess.run(ffmpeg_cmd, check=True, capture_output=True, text=True)

        with jobs_lock:
            jobs[job_id]['status'] = 'completed'
            jobs[job_id]['filepath'] = output_file_path

    except Exception as e:
        with jobs_lock:
            jobs[job_id]['status'] = 'error'
            if isinstance(e, subprocess.CalledProcessError):
                jobs[job_id]['error'] = e.stderr.strip() if e.stderr else str(e)
            else:
                jobs[job_id]['error'] = str(e)
    finally:
        if actual_temp_fn_path and os.path.exists(actual_temp_fn_path):
            try:
                os.remove(actual_temp_fn_path)
            except OSError:
                pass
        
        for f_name in os.listdir('.'):
            if f_name.startswith(f"temp_{uid}"):
                try:
                    os.remove(f_name)
                except OSError:
                    pass

def cleanup_files_periodically():
    while True:
        now = datetime.now()
        files_to_remove_this_run = []
        with files_lock:
            for filepath, deletion_time in list(files_to_delete.items()):
                if now >= deletion_time:
                    files_to_remove_this_run.append(filepath)
            
            for filepath in files_to_remove_this_run:
                try:
                    if os.path.exists(filepath):
                        os.remove(filepath)
                    del files_to_delete[filepath]
                except OSError:
                    if filepath in files_to_delete:
                        del files_to_delete[filepath]
        
        time.sleep(60)

if __name__ == '__main__':
    cleanup_thread = threading.Thread(target=cleanup_files_periodically, daemon=True)
    cleanup_thread.start()
    app.run(host='0.0.0.0', port=29101, debug=True)
