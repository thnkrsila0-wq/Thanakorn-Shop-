require("dotenv").config();
const express = require("express");
const session = require("express-session");
const helmet = require("helmet");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const path = require("path");

const app = express();
const db = new Database("thanakornshop.db");
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users(
 id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
 password_hash TEXT NOT NULL, balance INTEGER NOT NULL DEFAULT 0,
 is_admin INTEGER NOT NULL DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products(
 id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '',
 price INTEGER NOT NULL CHECK(price > 0), active INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS stock(
 id INTEGER PRIMARY KEY AUTOINCREMENT, product_id INTEGER NOT NULL,
 delivery_text TEXT NOT NULL, sold INTEGER NOT NULL DEFAULT 0,
 FOREIGN KEY(product_id) REFERENCES products(id)
);
CREATE TABLE IF NOT EXISTS messages(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 title TEXT NOT NULL, body TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
 FOREIGN KEY(user_id) REFERENCES users(id)
);
CREATE TABLE IF NOT EXISTS orders(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 product_id INTEGER NOT NULL, price INTEGER NOT NULL,
 created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS ledger(
 id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
 amount INTEGER NOT NULL, note TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`);
const adminName = process.env.ADMIN_USERNAME || "owner";
const adminPass = process.env.ADMIN_PASSWORD;
if (!adminPass || adminPass === "change-this-to-a-long-unique-password") {
  console.warn("WARNING: Set a strong ADMIN_PASSWORD in .env before exposing this site online.");
}
if (!db.prepare("SELECT id FROM users WHERE username=?").get(adminName) && adminPass) {
  db.prepare("INSERT INTO users(username,password_hash,is_admin) VALUES(?,?,1)")
    .run(adminName, bcrypt.hashSync(adminPass, 12));
}
if (!db.prepare("SELECT id FROM products LIMIT 1").get()) {
  db.prepare("INSERT INTO products(name,description,price) VALUES(?,?,?)")
    .run("ID เผ่า V4", "สินค้าดิจิทัลตัวอย่าง — ราคา 59 บาท", 59);
}

app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({limit:"30kb"}));
app.use(session({
  name: "tkshop.sid",
  secret: process.env.SESSION_SECRET || "unsafe-dev-secret-change-me",
  resave: false, saveUninitialized: false,
  cookie: { httpOnly:true, sameSite:"lax", secure:process.env.NODE_ENV==="production", maxAge: 1000*60*60*8 }
}));
app.use(express.static(path.join(__dirname,"public")));

const auth=(req,res,next)=>req.session.user?next():res.status(401).json({error:"กรุณาเข้าสู่ระบบ"});
const admin=(req,res,next)=>req.session.user?.is_admin?next():res.status(403).json({error:"เฉพาะผู้ดูแลร้าน"});
const clean=s=>String(s||"").trim();
app.get("/api/me",(req,res)=>res.json({user:req.session.user||null}));
app.post("/api/register",async(req,res)=>{
 const username=clean(req.body.username), password=String(req.body.password||"");
 if(!/^[a-zA-Z0-9_]{3,24}$/.test(username)||password.length<10) return res.status(400).json({error:"ชื่อผู้ใช้ 3-24 ตัว (อังกฤษ/ตัวเลข/_) และรหัสผ่านอย่างน้อย 10 ตัว"});
 try{
  const hash=await bcrypt.hash(password,12);
  const result=db.prepare("INSERT INTO users(username,password_hash) VALUES(?,?)").run(username,hash);
  req.session.user={id:Number(result.lastInsertRowid),username,is_admin:false};
  res.json({ok:true,user:req.session.user});
 }catch(e){res.status(409).json({error:"ชื่อผู้ใช้นี้ถูกใช้แล้ว"});}
});
app.post("/api/login",async(req,res)=>{
 const u=db.prepare("SELECT * FROM users WHERE username=?").get(clean(req.body.username));
 if(!u||!(await bcrypt.compare(String(req.body.password||""),u.password_hash)))return res.status(401).json({error:"ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง"});
 req.session.regenerate(err=>{if(err)return res.status(500).json({error:"เข้าสู่ระบบไม่สำเร็จ"});req.session.user={id:u.id,username:u.username,is_admin:!!u.is_admin};res.json({ok:true,user:req.session.user});});
});
app.post("/api/logout",(req,res)=>req.session.destroy(()=>res.json({ok:true})));
app.get("/api/products",(req,res)=>{
 const rows=db.prepare(`SELECT p.id,p.name,p.description,p.price,
 (SELECT COUNT(*) FROM stock s WHERE s.product_id=p.id AND s.sold=0) AS stock_count
 FROM products p WHERE p.active=1 ORDER BY p.id DESC`).all();res.json(rows);
});
app.get("/api/wallet",auth,(req,res)=>{
 const u=db.prepare("SELECT balance FROM users WHERE id=?").get(req.session.user.id);
 const ledger=db.prepare("SELECT amount,note,created_at FROM ledger WHERE user_id=? ORDER BY id DESC LIMIT 30").all(req.session.user.id);
 res.json({balance:u.balance,ledger});
});
app.get("/api/inbox",auth,(req,res)=>res.json(db.prepare("SELECT title,body,created_at FROM messages WHERE user_id=? ORDER BY id DESC").all(req.session.user.id)));
app.post("/api/buy/:id",auth,(req,res)=>{
 const buy=db.transaction(()=>{
  const p=db.prepare("SELECT * FROM products WHERE id=? AND active=1").get(Number(req.params.id));
  if(!p)throw Error("ไม่พบสินค้า");
  const u=db.prepare("SELECT balance FROM users WHERE id=?").get(req.session.user.id);
  if(u.balance<p.price)throw Error("ยอดเงินไม่เพียงพอ");
  const item=db.prepare("SELECT * FROM stock WHERE product_id=? AND sold=0 ORDER BY id LIMIT 1").get(p.id);
  if(!item)throw Error("สินค้าหมด");
  db.prepare("UPDATE users SET balance=balance-? WHERE id=?").run(p.price,req.session.user.id);
  db.prepare("UPDATE stock SET sold=1 WHERE id=?").run(item.id);
  db.prepare("INSERT INTO orders(user_id,product_id,price) VALUES(?,?,?)").run(req.session.user.id,p.id,p.price);
  db.prepare("INSERT INTO ledger(user_id,amount,note) VALUES(?,?,?)").run(req.session.user.id,-p.price,"ซื้อ "+p.name);
  db.prepare("INSERT INTO messages(user_id,title,body) VALUES(?,?,?)").run(req.session.user.id,"คำสั่งซื้อสำเร็จ: "+p.name,"ข้อมูลส่งมอบของคุณ:\\n"+item.delivery_text+"\\n\\nโปรดเก็บข้อมูลนี้เป็นส่วนตัว");
 });
 try{buy();res.json({ok:true,message:"ซื้อสำเร็จ ตรวจสอบกล่องจดหมาย"});}catch(e){res.status(400).json({error:e.message});}
});
app.get("/api/admin/summary",auth,admin,(req,res)=>{
 res.json({
  users:db.prepare("SELECT id,username,balance,created_at FROM users WHERE is_admin=0 ORDER BY id DESC").all(),
  orders:db.prepare("SELECT o.id,u.username,p.name,o.price,o.created_at FROM orders o JOIN users u ON u.id=o.user_id JOIN products p ON p.id=o.product_id ORDER BY o.id DESC LIMIT 50").all(),
  products:db.prepare("SELECT p.id,p.name,p.price,(SELECT COUNT(*) FROM stock s WHERE s.product_id=p.id AND s.sold=0) stock_count FROM products p").all()
 });
});
app.post("/api/admin/credit",auth,admin,(req,res)=>{
 const userId=Number(req.body.user_id),amount=Number(req.body.amount);
 if(!Number.isInteger(userId)||!Number.isInteger(amount)||amount<1||amount>1000000)return res.status(400).json({error:"ข้อมูลไม่ถูกต้อง"});
 const tx=db.transaction(()=>{
  const u=db.prepare("SELECT id FROM users WHERE id=? AND is_admin=0").get(userId);if(!u)throw Error("ไม่พบบัญชีลูกค้า");
  db.prepare("UPDATE users SET balance=balance+? WHERE id=?").run(amount,userId);
  db.prepare("INSERT INTO ledger(user_id,amount,note) VALUES(?,?,?)").run(userId,amount,"เติมเครดิตโดยผู้ดูแล");
  db.prepare("INSERT INTO messages(user_id,title,body) VALUES(?,?,?)").run(userId,"ได้รับเครดิต","ผู้ดูแลเพิ่มเครดิตให้คุณ "+amount+" บาท");
 });try{tx();res.json({ok:true});}catch(e){res.status(400).json({error:e.message});}
});
app.post("/api/admin/product",auth,admin,(req,res)=>{
 const name=clean(req.body.name),description=clean(req.body.description),price=Number(req.body.price);
 if(!name||name.length>80||!Number.isInteger(price)||price<1||price>1000000)return res.status(400).json({error:"กรอกชื่อและราคาให้ถูกต้อง"});
 db.prepare("INSERT INTO products(name,description,price) VALUES(?,?,?)").run(name,description,price);res.json({ok:true});
});
app.post("/api/admin/stock",auth,admin,(req,res)=>{
 const productId=Number(req.body.product_id),delivery=clean(req.body.delivery_text);
 if(!Number.isInteger(productId)||!delivery||delivery.length>4000)return res.status(400).json({error:"ข้อมูลสต็อกไม่ถูกต้อง"});
 if(!db.prepare("SELECT id FROM products WHERE id=?").get(productId))return res.status(404).json({error:"ไม่พบสินค้า"});
 db.prepare("INSERT INTO stock(product_id,delivery_text) VALUES(?,?)").run(productId,delivery);res.json({ok:true});
});
app.get("/api/admin/products",auth,admin,(req,res)=>res.json(db.prepare("SELECT id,name,price FROM products ORDER BY id DESC").all()));

const port=Number(process.env.PORT)||3000;
app.listen(port,()=>console.log(`Thanakornshop running on port ${port}`));
