# AOneArt Ledger

AOneArt business ke liye management system — Wall Clocks, Watches, Ads, aur
Other Expenses ka record, customer details, investments, monthly report,
aur audit log (kis ne kab kya change kiya).

Ye ek **PWA** hai (Progressive Web App): ek hi backend, koi bhi phone browser
mai URL kholo aur "Add to Home Screen" kar lo — icon phone pe ban jayega aur
app jaisa hi chalega, teenon phones pe same time pe.

---

## 1. Default logins (pehle hi change kar lena)

| Name     | Username   | Password      | Role   | Apna section (edit kar sakta hai) |
|----------|-----------|---------------|--------|------------------------------------|
| Huzaifa  | huzaifa   | huzaifa123    | member | Wall Clocks                        |
| Hamza    | hamza     | hamza123      | member | Watches                            |
| Abdullah | abdullah  | abdullah123   | admin  | Ads + Other Expenses + sab kuch    |

- **Sab log-in karke sab sections dekh sakte hain** (dashboard, report, sab).
- **Sirf apna assigned section edit/delete kar sakte hain.**
- Abdullah `admin` hai, isliye wo har section edit kar sakta hai (Ads aur
  Other dono, plus zaroorat pe kisi aur ka bhi record fix kar sakta hai),
  investments manage kar sakta hai, aur audit log dekh sakta hai.

Passwords change karne ke liye abhi `backend/app.py` ki `seed()` function mai
naye password likh kar `aoneart.db` delete kar do aur app restart kar do
(ya baad mai ek "change password" screen add karwa lena).

---

## 2. Local par test karna (apne laptop pe)

```bash
cd backend
pip install -r requirements.txt
python app.py
```

Browser mai `http://localhost:5000` kholo. Pehli baar chalane par 3 users
apne aap ban jayenge (upar wali table wale).

---

## 3. Phone pe "app" ki tarah install karna

1. Backend ko live host karo (Section 4 dekho — PythonAnywhere sabse asaan
   hai).
2. Us live URL ko phone ke Chrome (Android) ya Safari (iPhone) mai kholo.
3. **Android/Chrome:** menu (⋮) → "Add to Home screen" / "Install app".
4. **iPhone/Safari:** Share button → "Add to Home Screen".
5. Ab home screen pe AOneArt Ledger ka icon aa jayega — usko tap karo to
   pura screen app jaisa khulega (no browser bar), aur teeno phones pe
   yehi same cheez chalegi kyunki data ek hi jagah (backend) pe save hota
   hai.

---

## 4. Live hosting — PythonAnywhere (free tier kaafi hai)

1. [pythonanywhere.com](https://www.pythonanywhere.com) pe free account
   banao.
2. "Files" tab se pura `backend/` aur `frontend/` folder upload kar do
   (ya "Bash console" khol kar `git clone` / zip upload + unzip karo).
3. "Web" tab → "Add a new web app" → Manual configuration → Python 3.10+.
4. WSGI config file mai path set karo taake wo `backend/app.py` ke andar
   `app` object ko import kare, jaise:
   ```python
   import sys
   path = '/home/yourusername/aoneart-ledger/backend'
   if path not in sys.path:
       sys.path.append(path)
   from app import app as application
   ```
5. "Virtualenv" section mai virtualenv banao aur
   `pip install -r requirements.txt` chala do (PythonAnywhere console se).
6. `SECRET_KEY` environment variable set kar do (Web tab → environment
   variables) kisi bhi random lambi string se — ye login tokens ko secure
   karta hai.
7. Reload the web app. Ab `https://yourusername.pythonanywhere.com` pe live
   hai — yehi link teeno phones pe use hoga.

(Chahen to Render.com ya Railway.app bhi use kar sakte hain — dono Flask
apps free/cheap tier pe host karte hain, process similar hai.)

**Note:** Uploaded images `backend/static/uploads/` mai save hote hain.
Free PythonAnywhere par disk space limited hota hai — agar photos zyada
add hongi to future mai Cloudinary jaisi service pe switch kar sakte ho
(jaisa AOneArt store mai already use ho raha hai).

---

## 5. App kaise kaam karta hai (structure)

- **Dashboard** — is mahine ki total sales, cost, profit, investments ka
  quick overview.
- **Wall Clocks / Watches / Ads** — bottom nav pe direct tabs.
- **More** menu mai: Other Expenses, Investments, Monthly Report, Audit Log.
- Har entry mai optional photo upload ho sakti hai (manufacturing ya
  investment proof ke liye).
- Customer ka naam/phone save hota hai aur Wall Clock / Watch sale ke sath
  link ho jata hai — dobara wahi customer select bhi kar sakte ho.
- Jab bhi koi record **update ya delete** hota hai, Audit Log mai likha
  jata hai kis ne, kab, aur kya badla (purana aur naya data dono save hota
  hai database mai).

---

## 6. Aage kya add ho sakta hai (agar chahiye)

- Password reset / change-password screen.
- Per-user push notifications (naya sale, monthly report ready, etc).
- Export monthly report as PDF/Excel.
- MySQL/MongoDB pe switch (abhi SQLite hai — 3 logon ke liye kaafi hai,
  lekin scale hone par MySQL pe move karna asaan hai, model.py mai sirf
  connection string change karni hogi).
