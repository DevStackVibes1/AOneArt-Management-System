import os
import json
import jwt
import datetime
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, g
from flask_cors import CORS
from werkzeug.utils import secure_filename
from models import (db, User, Customer, WallClockEntry, WatchEntry, AdsEntry,
                     OtherExpenseEntry, Investment, AuditLog, SECTIONS)

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "static", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__, static_folder="static")
CORS(app)
app.config["SQLALCHEMY_DATABASE_URI"] = "sqlite:///" + os.path.join(BASE_DIR, "aoneart.db")
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", "change-this-secret-in-production")
db.init_app(app)

ALLOWED_EXT = {"png", "jpg", "jpeg", "webp"}

MODEL_MAP = {
    "wall_clocks": WallClockEntry,
    "watches": WatchEntry,
    "ads": AdsEntry,
    "other": OtherExpenseEntry,
}


# ---------- auth helpers ----------

def make_token(user):
    payload = {
        "user_id": user.id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(days=30),
    }
    return jwt.encode(payload, app.config["SECRET_KEY"], algorithm="HS256")


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        if not auth.startswith("Bearer "):
            return jsonify({"error": "Login required"}), 401
        token = auth.split(" ", 1)[1]
        try:
            payload = jwt.decode(token, app.config["SECRET_KEY"], algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Session expired, login again"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid session"}), 401
        user = User.query.get(payload["user_id"])
        if not user:
            return jsonify({"error": "User not found"}), 401
        g.user = user
        return f(*args, **kwargs)
    return wrapper


def can_edit(user, section):
    return user.role == "admin" or user.section == section


def log_audit(table_name, record_id, action, old_data=None, new_data=None):
    entry = AuditLog(
        table_name=table_name, record_id=record_id, action=action,
        changed_by=g.user.id,
        old_data=json.dumps(old_data) if old_data else None,
        new_data=json.dumps(new_data) if new_data else None,
    )
    db.session.add(entry)


def save_image(file_storage):
    if not file_storage or file_storage.filename == "":
        return None
    ext = file_storage.filename.rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXT:
        return None
    fname = secure_filename(f"{datetime.datetime.utcnow().timestamp()}_{file_storage.filename}")
    file_storage.save(os.path.join(UPLOAD_DIR, fname))
    return f"/static/uploads/{fname}"


def parse_date(s):
    if not s:
        return datetime.date.today()
    return datetime.datetime.strptime(s, "%Y-%m-%d").date()


# ---------- auth routes ----------

@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(force=True)
    user = User.query.filter_by(username=data.get("username", "").strip().lower()).first()
    if not user or not user.check_password(data.get("password", "")):
        return jsonify({"error": "Ghalat username ya password"}), 401
    return jsonify({"token": make_token(user), "user": user.to_dict()})


@app.route("/api/me", methods=["GET"])
@login_required
def me():
    return jsonify(g.user.to_dict())


# ---------- customers ----------

@app.route("/api/customers", methods=["GET"])
@login_required
def list_customers():
    return jsonify([c.to_dict() for c in Customer.query.order_by(Customer.name).all()])


@app.route("/api/customers", methods=["POST"])
@login_required
def create_customer():
    data = request.get_json(force=True)
    c = Customer(name=data.get("name"), phone=data.get("phone"),
                 address=data.get("address"), notes=data.get("notes"))
    db.session.add(c)
    db.session.commit()
    return jsonify(c.to_dict()), 201


# ---------- generic section entries (wall_clocks, watches, ads, other) ----------

def build_entry_from_form(section, form):
    if section == "wall_clocks":
        return WallClockEntry(
            date=parse_date(form.get("date")),
            cutting_dealer_cost=float(form.get("cutting_dealer_cost") or 0),
            paint_dealer_cost=float(form.get("paint_dealer_cost") or 0),
            other_charges=float(form.get("other_charges") or 0),
            other_charges_desc=form.get("other_charges_desc"),
            customer_id=form.get("customer_id") or None,
            sale_price=float(form.get("sale_price") or 0),
            delivery_charge=float(form.get("delivery_charge") or 0),
            description=form.get("description"),
        )
    if section == "watches":
        return WatchEntry(
            date=parse_date(form.get("date")),
            buy_price=float(form.get("buy_price") or 0),
            sale_price=float(form.get("sale_price") or 0),
            delivery_charge=float(form.get("delivery_charge") or 0),
            customer_id=form.get("customer_id") or None,
            description=form.get("description"),
        )
    if section == "ads":
        return AdsEntry(
            date=parse_date(form.get("date")),
            daily_budget=float(form.get("daily_budget") or 0),
            ads_count=int(form.get("ads_count") or 0),
            description=form.get("description"),
        )
    if section == "other":
        return OtherExpenseEntry(
            date=parse_date(form.get("date")),
            expense_type=form.get("expense_type", "other"),
            amount=float(form.get("amount") or 0),
            description=form.get("description"),
        )
    return None


def apply_entry_from_form(entry, section, form):
    new = build_entry_from_form(section, form)
    for col in entry.__table__.columns.keys():
        if col in ("id", "created_by", "created_at", "image_path"):
            continue
        setattr(entry, col, getattr(new, col))


@app.route("/api/entries/<section>", methods=["GET"])
@login_required
def list_entries(section):
    Model = MODEL_MAP.get(section)
    if not Model:
        return jsonify({"error": "Unknown section"}), 404
    rows = Model.query.order_by(Model.date.desc(), Model.id.desc()).all()
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/entries/<section>", methods=["POST"])
@login_required
def create_entry(section):
    Model = MODEL_MAP.get(section)
    if not Model:
        return jsonify({"error": "Unknown section"}), 404
    if not can_edit(g.user, section):
        return jsonify({"error": "Aapko is section mai add karne ki permission nahi hai"}), 403
    form = request.form
    entry = build_entry_from_form(section, form)
    entry.created_by = g.user.id
    if "image" in request.files:
        entry.image_path = save_image(request.files["image"])
    db.session.add(entry)
    db.session.commit()
    log_audit(section, entry.id, "create", new_data=entry.to_dict())
    db.session.commit()
    return jsonify(entry.to_dict()), 201


@app.route("/api/entries/<section>/<int:entry_id>", methods=["PUT"])
@login_required
def update_entry(section, entry_id):
    Model = MODEL_MAP.get(section)
    if not Model:
        return jsonify({"error": "Unknown section"}), 404
    entry = Model.query.get_or_404(entry_id)
    if not can_edit(g.user, section):
        return jsonify({"error": "Aapko is section mai edit karne ki permission nahi hai"}), 403
    old_data = entry.to_dict()
    form = request.form
    apply_entry_from_form(entry, section, form)
    if "image" in request.files and request.files["image"].filename:
        new_path = save_image(request.files["image"])
        if new_path:
            entry.image_path = new_path
    db.session.commit()
    log_audit(section, entry.id, "update", old_data=old_data, new_data=entry.to_dict())
    db.session.commit()
    return jsonify(entry.to_dict())


@app.route("/api/entries/<section>/<int:entry_id>", methods=["DELETE"])
@login_required
def delete_entry(section, entry_id):
    Model = MODEL_MAP.get(section)
    if not Model:
        return jsonify({"error": "Unknown section"}), 404
    entry = Model.query.get_or_404(entry_id)
    if not can_edit(g.user, section):
        return jsonify({"error": "Aapko is section mai delete karne ki permission nahi hai"}), 403
    old_data = entry.to_dict()
    db.session.delete(entry)
    db.session.commit()
    log_audit(section, entry_id, "delete", old_data=old_data)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ---------- investments ----------

@app.route("/api/investments", methods=["GET"])
@login_required
def list_investments():
    rows = Investment.query.order_by(Investment.date.desc(), Investment.id.desc()).all()
    return jsonify([r.to_dict() for r in rows])


@app.route("/api/investments", methods=["POST"])
@login_required
def create_investment():
    form = request.form
    inv = Investment(
        date=parse_date(form.get("date")),
        investor_name=form.get("investor_name"),
        amount=float(form.get("amount") or 0),
        section=form.get("section", "general"),
        description=form.get("description"),
        created_by=g.user.id,
    )
    if "image" in request.files:
        inv.image_path = save_image(request.files["image"])
    db.session.add(inv)
    db.session.commit()
    log_audit("investment", inv.id, "create", new_data=inv.to_dict())
    db.session.commit()
    return jsonify(inv.to_dict()), 201


@app.route("/api/investments/<int:inv_id>", methods=["PUT"])
@login_required
def update_investment(inv_id):
    inv = Investment.query.get_or_404(inv_id)
    if g.user.role != "admin" and inv.created_by != g.user.id:
        return jsonify({"error": "Sirf apna add kiya hua investment edit kar sakte hain"}), 403
    old_data = inv.to_dict()
    form = request.form
    inv.date = parse_date(form.get("date"))
    inv.investor_name = form.get("investor_name")
    inv.amount = float(form.get("amount") or 0)
    inv.section = form.get("section", "general")
    inv.description = form.get("description")
    if "image" in request.files and request.files["image"].filename:
        new_path = save_image(request.files["image"])
        if new_path:
            inv.image_path = new_path
    db.session.commit()
    log_audit("investment", inv.id, "update", old_data=old_data, new_data=inv.to_dict())
    db.session.commit()
    return jsonify(inv.to_dict())


@app.route("/api/investments/<int:inv_id>", methods=["DELETE"])
@login_required
def delete_investment(inv_id):
    inv = Investment.query.get_or_404(inv_id)
    if g.user.role != "admin" and inv.created_by != g.user.id:
        return jsonify({"error": "Sirf apna add kiya hua investment delete kar sakte hain"}), 403
    old_data = inv.to_dict()
    db.session.delete(inv)
    db.session.commit()
    log_audit("investment", inv_id, "delete", old_data=old_data)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ---------- audit log ----------

@app.route("/api/audit-log", methods=["GET"])
@login_required
def audit_log():
    rows = AuditLog.query.order_by(AuditLog.changed_at.desc()).limit(300).all()
    return jsonify([r.to_dict() for r in rows])


# ---------- monthly report ----------

@app.route("/api/report/monthly", methods=["GET"])
@login_required
def monthly_report():
    year = int(request.args.get("year", datetime.date.today().year))
    month = int(request.args.get("month", datetime.date.today().month))

    def in_month(d):
        return d.year == year and d.month == month

    wc = [e for e in WallClockEntry.query.all() if in_month(e.date)]
    wt = [e for e in WatchEntry.query.all() if in_month(e.date)]
    ad = [e for e in AdsEntry.query.all() if in_month(e.date)]
    ot = [e for e in OtherExpenseEntry.query.all() if in_month(e.date)]
    inv = [e for e in Investment.query.all() if in_month(e.date)]

    wc_sales = sum(e.sale_price or 0 for e in wc)
    wc_cost = sum((e.cutting_dealer_cost or 0) + (e.paint_dealer_cost or 0) + (e.other_charges or 0) + (e.delivery_charge or 0) for e in wc)
    wt_sales = sum(e.sale_price or 0 for e in wt)
    wt_cost = sum((e.buy_price or 0) + (e.delivery_charge or 0) for e in wt)
    ads_spend = sum(e.daily_budget or 0 for e in ad)
    other_spend = sum(e.amount or 0 for e in ot)
    total_investment = sum(e.amount or 0 for e in inv)

    total_sales = wc_sales + wt_sales
    total_costs = wc_cost + wt_cost + ads_spend + other_spend
    net_profit = total_sales - total_costs

    return jsonify({
        "year": year, "month": month,
        "wall_clocks": {"count": len(wc), "sales": wc_sales, "cost": wc_cost, "profit": wc_sales - wc_cost},
        "watches": {"count": len(wt), "sales": wt_sales, "cost": wt_cost, "profit": wt_sales - wt_cost},
        "ads": {"count": len(ad), "spend": ads_spend},
        "other": {"count": len(ot), "spend": other_spend},
        "investments": {"count": len(inv), "total": total_investment},
        "totals": {"sales": total_sales, "costs": total_costs, "net_profit": net_profit},
    })


# ---------- seed / bootstrap ----------

@app.route("/api/bootstrap-status", methods=["GET"])
def bootstrap_status():
    return jsonify({"has_users": User.query.count() > 0})


# ---------- static frontend ----------

@app.route("/")
def index():
    return send_from_directory(os.path.join(BASE_DIR, "..", "frontend"), "index.html")


@app.route("/<path:path>")
def static_files(path):
    frontend_dir = os.path.join(BASE_DIR, "..", "frontend")
    if os.path.exists(os.path.join(frontend_dir, path)):
        return send_from_directory(frontend_dir, path)
    return send_from_directory(os.path.join(BASE_DIR, "static"), path)


def seed():
    db.create_all()
    if User.query.count() == 0:
        users = [
            ("Huzaifa", "huzaifa", "huzaifa123", "member", "wall_clocks"),
            ("Hamza", "hamza", "hamza123", "member", "watches"),
            ("Abdullah", "abdullah", "abdullah123", "admin", "ads"),
        ]
        for name, uname, pw, role, section in users:
            u = User(name=name, username=uname, role=role, section=section)
            u.set_password(pw)
            db.session.add(u)
        db.session.commit()
        print("Seeded default users (CHANGE PASSWORDS): huzaifa/huzaifa123, hamza/hamza123, abdullah/abdullah123")


with app.app_context():
    seed()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
