from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash

db = SQLAlchemy()

SECTIONS = ["wall_clocks", "watches", "ads", "other"]


def now():
    return datetime.utcnow()


class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(80), nullable=False)
    username = db.Column(db.String(40), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    role = db.Column(db.String(20), default="member")  # admin | member
    section = db.Column(db.String(20), nullable=False)  # which section they can edit
    created_at = db.Column(db.DateTime, default=now)

    def set_password(self, pw):
        self.password_hash = generate_password_hash(pw)

    def check_password(self, pw):
        return check_password_hash(self.password_hash, pw)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "username": self.username,
                "role": self.role, "section": self.section}


class Customer(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    phone = db.Column(db.String(40))
    address = db.Column(db.String(255))
    notes = db.Column(db.String(255))
    created_at = db.Column(db.DateTime, default=now)

    def to_dict(self):
        return {"id": self.id, "name": self.name, "phone": self.phone,
                "address": self.address, "notes": self.notes}


class WallClockEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    cutting_dealer_cost = db.Column(db.Float, default=0)
    paint_dealer_cost = db.Column(db.Float, default=0)
    other_charges = db.Column(db.Float, default=0)
    other_charges_desc = db.Column(db.String(255))
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    sale_price = db.Column(db.Float, default=0)
    delivery_charge = db.Column(db.Float, default=0)
    description = db.Column(db.Text)
    image_path = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=now)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now)

    def to_dict(self):
        customer = Customer.query.get(self.customer_id) if self.customer_id else None
        creator = User.query.get(self.created_by)
        total_cost = (self.cutting_dealer_cost or 0) + (self.paint_dealer_cost or 0) + (self.other_charges or 0)
        profit = (self.sale_price or 0) - total_cost - (self.delivery_charge or 0)
        return {
            "id": self.id, "section": "wall_clocks",
            "date": self.date.isoformat() if self.date else None,
            "cutting_dealer_cost": self.cutting_dealer_cost,
            "paint_dealer_cost": self.paint_dealer_cost,
            "other_charges": self.other_charges,
            "other_charges_desc": self.other_charges_desc,
            "customer": customer.to_dict() if customer else None,
            "sale_price": self.sale_price,
            "delivery_charge": self.delivery_charge,
            "total_cost": total_cost,
            "profit": profit,
            "description": self.description,
            "image_path": self.image_path,
            "created_by": creator.name if creator else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class WatchEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    buy_price = db.Column(db.Float, default=0)
    sale_price = db.Column(db.Float, default=0)
    delivery_charge = db.Column(db.Float, default=0)
    customer_id = db.Column(db.Integer, db.ForeignKey("customer.id"))
    description = db.Column(db.Text)
    image_path = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=now)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now)

    def to_dict(self):
        customer = Customer.query.get(self.customer_id) if self.customer_id else None
        creator = User.query.get(self.created_by)
        profit = (self.sale_price or 0) - (self.buy_price or 0) - (self.delivery_charge or 0)
        return {
            "id": self.id, "section": "watches",
            "date": self.date.isoformat() if self.date else None,
            "buy_price": self.buy_price,
            "sale_price": self.sale_price,
            "delivery_charge": self.delivery_charge,
            "customer": customer.to_dict() if customer else None,
            "profit": profit,
            "description": self.description,
            "image_path": self.image_path,
            "created_by": creator.name if creator else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class AdsEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    daily_budget = db.Column(db.Float, default=0)
    ads_count = db.Column(db.Integer, default=0)
    description = db.Column(db.Text)
    image_path = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=now)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now)

    def to_dict(self):
        creator = User.query.get(self.created_by)
        return {
            "id": self.id, "section": "ads",
            "date": self.date.isoformat() if self.date else None,
            "daily_budget": self.daily_budget,
            "ads_count": self.ads_count,
            "description": self.description,
            "image_path": self.image_path,
            "created_by": creator.name if creator else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class OtherExpenseEntry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    expense_type = db.Column(db.String(40))  # petrol | food | other
    amount = db.Column(db.Float, default=0)
    description = db.Column(db.Text)
    image_path = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=now)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now)

    def to_dict(self):
        creator = User.query.get(self.created_by)
        return {
            "id": self.id, "section": "other",
            "date": self.date.isoformat() if self.date else None,
            "expense_type": self.expense_type,
            "amount": self.amount,
            "description": self.description,
            "image_path": self.image_path,
            "created_by": creator.name if creator else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class Investment(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    date = db.Column(db.Date, nullable=False)
    investor_name = db.Column(db.String(80))
    amount = db.Column(db.Float, default=0)
    section = db.Column(db.String(20))  # wall_clocks | watches | ads | other | general
    description = db.Column(db.Text)
    image_path = db.Column(db.String(255))
    created_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    created_at = db.Column(db.DateTime, default=now)
    updated_at = db.Column(db.DateTime, default=now, onupdate=now)

    def to_dict(self):
        creator = User.query.get(self.created_by)
        return {
            "id": self.id,
            "date": self.date.isoformat() if self.date else None,
            "investor_name": self.investor_name,
            "amount": self.amount,
            "section": self.section,
            "description": self.description,
            "image_path": self.image_path,
            "created_by": creator.name if creator else None,
            "created_at": self.created_at.isoformat(),
            "updated_at": self.updated_at.isoformat(),
        }


class AuditLog(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    table_name = db.Column(db.String(40))
    record_id = db.Column(db.Integer)
    action = db.Column(db.String(20))  # create | update | delete
    changed_by = db.Column(db.Integer, db.ForeignKey("user.id"))
    changed_at = db.Column(db.DateTime, default=now)
    old_data = db.Column(db.Text)
    new_data = db.Column(db.Text)

    def to_dict(self):
        user = User.query.get(self.changed_by)
        return {
            "id": self.id, "table_name": self.table_name, "record_id": self.record_id,
            "action": self.action, "changed_by": user.name if user else "Unknown",
            "changed_at": self.changed_at.isoformat(),
            "old_data": self.old_data, "new_data": self.new_data,
        }
