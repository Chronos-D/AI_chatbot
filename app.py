import os
import uuid
import mimetypes
import requests
import pandas as pd
import matplotlib.pyplot as plt
from urllib.parse import urlparse
from io import StringIO, BytesIO
from datetime import datetime
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import google.generativeai as genai

load_dotenv()
app = Flask(__name__, static_folder="static", template_folder="templates")

UPLOAD_FOLDER = os.path.join(app.static_folder, "uploads")
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Cho phép nhiều định dạng ảnh hơn
ALLOWED_IMAGE_EXT = {"png", "jpg", "jpeg", "webp", "gif", "bmp", "tiff"}
ALLOWED_CSV_EXT = {"csv"}
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER
app.config["MAX_CONTENT_LENGTH"] = 16 * 1024 * 1024  # 16 MB 

# Cấu hình Gemini
GEMINI_KEY = os.getenv("GEMINI_API_KEY")
if GEMINI_KEY:
    genai.configure(api_key=GEMINI_KEY)
    model = genai.GenerativeModel("gemini-2.5-flash")
else:
    model = None

def allowed_file(filename, allowed_set):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in allowed_set

def timestamp_now_iso():
    return datetime.utcnow().isoformat() + "Z"


def is_valid_url(url):
    try:
        result = urlparse(url)
        return all([result.scheme in ("http", "https"), result.netloc])
    except:
        return False

def url_accessible(url):
    try:
        resp = requests.get(url, timeout=5)
        if resp.status_code == 200 and len(resp.content) > 0:
            return True
        return False
    except:
        return False


@app.route("/")
def home():
    return render_template("index.html")

# Only text chat
@app.route("/chat", methods=["POST"])
def chat_text_only():
    data = request.get_json() or {}
    user_message = data.get("message", "").strip()
    history = data.get("history", [])

    if not user_message:
        return jsonify({"error": "No message provided"}), 400

    if user_message.startswith("http"):
        if not is_valid_url(user_message):
            return jsonify({"reply": f"URL không hợp lệ: {user_message}", "ts": timestamp_now_iso()})
        if not url_accessible(user_message):
            return jsonify({"reply": f"URL không truy cập được hoặc rỗng: {user_message}", "ts": timestamp_now_iso()})

    if not model:
        reply_text = f"(no-model) You said: {user_message}"
        return jsonify({"reply": reply_text, "ts": timestamp_now_iso()})

    context = "\n".join([f"{m.get('role')}: {m.get('text')}" for m in history[-6:]])
    prompt = f"{context}\nuser: {user_message}\nassistant:"

    try:
        response = model.generate_content([prompt])
        reply_text = response.text
    except Exception as e:
        return jsonify({"error": f"Model error: {str(e)}"}), 500

    return jsonify({"reply": reply_text, "ts": timestamp_now_iso()})


# Upload hỗn hợp: text + ảnh + CSV
@app.route("/upload-mixed", methods=["POST"])
def upload_mixed():
    text = (request.form.get("message") or "").strip()
    image_file = request.files.get("image")
    csv_file = request.files.get("csv")

    image_url = None
    csv_name = None

    # Xử lý ảnh nếu có
    if image_file and image_file.filename != "":
        if not allowed_file(image_file.filename, ALLOWED_IMAGE_EXT):
            return jsonify({"error": "Unsupported image type"}), 400
        image_filename = secure_filename(f"{uuid.uuid4().hex}_{image_file.filename}")
        image_path = os.path.join(app.config["UPLOAD_FOLDER"], image_filename)
        image_file.save(image_path)
        image_url = f"/static/uploads/{image_filename}"

    # Xử lý CSV nếu có
    df = None
    MAX_CSV_SIZE = 5 * 1024 * 1024
    if csv_file and csv_file.filename != "":
        if not allowed_file(csv_file.filename, ALLOWED_CSV_EXT):
            return jsonify({"error": "Unsupported CSV type"}), 400

        csv_file.seek(0, os.SEEK_END)
        file_size = csv_file.tell()
        csv_file.seek(0)
        if file_size > MAX_CSV_SIZE:
            return jsonify({"error": f"CSV quá lớn ({file_size / (1024*1024):.2f} MB). Tối đa cho phép là {MAX_CSV_SIZE / (1024*1024):.0f} MB."}), 400

        csv_name = secure_filename(f"{uuid.uuid4().hex}_{csv_file.filename}")
        csv_path = os.path.join(app.config["UPLOAD_FOLDER"], csv_name)
        csv_file.save(csv_path)

        try:
            df = pd.read_csv(csv_path)
        except pd.errors.ParserError as e:
            return jsonify({"error": f"Lỗi parse CSV: dữ liệu không đúng định dạng hoặc bị hỏng.\nChi tiết: {str(e)}"}), 400
        except UnicodeDecodeError as e:
            return jsonify({"error": f"Lỗi encoding CSV: file không phải UTF-8 hoặc chứa ký tự lạ.\nChi tiết: {str(e)}"}), 400
        except Exception as e:
            return jsonify({"error": f"Lỗi khi đọc CSV: {str(e)}"}), 400

    # Prompt với ảnh
    if image_url:
        if not model:
            reply = f"(no-model) Received image + question: {text or '(no question)'}"
            return jsonify({"reply": reply, "imageUrl": image_url})

        try:
            mime_type, _ = mimetypes.guess_type(image_filename)
            if not mime_type:
                mime_type = "application/octet-stream"

            with open(os.path.join(app.config["UPLOAD_FOLDER"], image_filename), "rb") as f:
                img_bytes = f.read()

            response = model.generate_content([
                text or "Mô tả ảnh này",
                {"mime_type": mime_type, "data": img_bytes}
            ])
            reply = response.text
        except Exception as e:
            return jsonify({"error": f"Image model error: {str(e)}"}), 500

        return jsonify({"reply": reply, "imageUrl": image_url})

    # Prompt với CSV
    if df is not None:
        try:
            csv_summary = f"CSV có {df.shape[0]} hàng và {df.shape[1]} cột. Cột: {', '.join(df.columns[:20])}."
            if model:
                if text:
                    prompt = f"Dựa trên dữ liệu trong file csv:\n{df.to_csv(index=False)}\nNgười dùng hỏi: {text}\nTrả lời rõ ràng."
                else:
                    prompt = f"Đưa ra nhận xét khái quát về dữ liệu:\n{df.to_csv(index=False)}"
                response = model.generate_content([prompt])
                reply = response.text
            else:
                reply = f"(no-model) {csv_summary}"

            return jsonify({"reply": reply, "fileName": csv_name})
        except Exception as e:
            return jsonify({"error": f"CSV processing error: {str(e)}"}), 500


@app.route("/uploads/<path:filename>")
def uploaded_file(filename):
    return send_from_directory(app.config["UPLOAD_FOLDER"], filename)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
