import os
import logging
from flask import Flask
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.orm import DeclarativeBase
from werkzeug.middleware.proxy_fix import ProxyFix

try:
    from dotenv import load_dotenv
    load_dotenv()
except Exception:
    pass

# Configure logging
logging.basicConfig(level=logging.DEBUG)

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# Create the app
app = Flask(__name__)
session_secret = os.environ.get("SESSION_SECRET", "neurobeat-secure-session-secret-key-32chars")
app.secret_key = session_secret
app.wsgi_app = ProxyFix(app.wsgi_app, x_proto=1, x_host=1)

@app.template_filter('format_duration')
def format_duration(seconds):
    """Formats active duration in seconds into 'Xm Ys' or 'Xs' without dropping seconds"""
    if seconds is None:
        return "N/A"
    try:
        seconds = int(seconds)
    except (ValueError, TypeError):
        return "N/A"
    if seconds < 0:
        return "N/A"
    m = seconds // 60
    s = seconds % 60
    if m > 0:
        return f"{m}m {s:02d}s"
    return f"{s}s"

@app.template_filter('format_timer')
def format_timer(seconds):
    """Formats duration into standard timer string 'MM:SS'"""
    if seconds is None:
        return "00:00"
    try:
        seconds = max(0, int(seconds))
    except (ValueError, TypeError):
        return "00:00"
    m = seconds // 60
    s = seconds % 60
    return f"{m:02d}:{s:02d}"

# Configure the database
os.makedirs(app.instance_path, exist_ok=True)
default_db_path = os.path.join(app.instance_path, "neurobeat.db").replace("\\", "/")
db_url = os.environ.get("DATABASE_URL")
if not db_url:
    db_url = f"sqlite:///{default_db_path}"
elif db_url.startswith("sqlite:///instance/"):
    sub = db_url[len("sqlite:///instance/"):]
    db_url = "sqlite:///" + os.path.join(app.instance_path, sub).replace("\\", "/")

app.config["SQLALCHEMY_DATABASE_URI"] = db_url
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {
    "pool_recycle": 300,
    "pool_pre_ping": True,
}

# Initialize the app with the extension
db.init_app(app)

with app.app_context():
    # Import models to ensure tables are created
    import models  # noqa: F401
    db.create_all()
    logging.info("Database tables created successfully")

# Import routes to ensure routes are registered regardless of entry point (app:app, main:app, wsgi:app)
import routes  # noqa: F401, E402

