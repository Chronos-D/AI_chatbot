
# AI Chat App
Ứng dụng chat AI đơn giản hỗ trợ text, hình ảnh và CSV, chạy trên local với Gemini API.


## Hướng dẫn thiết lập môi trường và chạy app trên local

### 1. Cài môi trường
python3 -m venv venv
source venv/bin/activate     # hoặc venv\Scripts\activate trên Windows

### 2. Cài thư viện
pip install -r requirements.txt

### 3. Tạo file .env.example chứa API key
```bash
GEMINI_API_KEY = "your_api_key_here"
```

### 4. Tạo file .env từ .env.example
```bash
cp .env.example .env
```

### 5. Chạy app
```bash
python app.py
```

## Demo
Truy cập link sau để xem demo: https://drive.google.com/drive/u/1/folders/17tyIgKojNZcZaDfsfE-wJBC8NA7eoTI3


## Project Structure:
```bash
ai-chat-app/
│
├── static/
│   ├── style.css
│   └── script.js
│
├── templates/
│   └── index.html
│
├── .env.example
├── app.py
├── requirements.txt
└── README.md
```