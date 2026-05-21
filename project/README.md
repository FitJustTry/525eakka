# Ekarat Capacity Planner

Single-file frontend plus an Express backend using `lowdb` JSON storage.

## Structure

```text
project/
├── backend/
│   ├── server.js
│   ├── package.json
│   ├── db.json
│   └── routes/
├── frontend/
│   └── index.html
└── README.md
```

## Run

```powershell
cd C:\Users\Bundit\Documents\eakkarat\project\backend
npm install
npm start
```

Open:

```text
http://localhost:3000/
```

API snapshot:

```text
http://localhost:3000/api/snapshot
```

## Main API

- `GET /api/health`
- `GET /api/snapshot`
- `PUT /api/snapshot`
- `GET /api/config/wc`
- `PUT /api/config/wc/:wcId`
- `GET /api/config/products`
- `PUT /api/config/products/:productId`
- `GET /api/config/openload`
- `PUT /api/config/openload/:wc`
- `GET /api/holidays`
- `POST /api/holidays`
- `DELETE /api/holidays/:date`
- `GET /api/factory-holidays`
- `POST /api/factory-holidays`
- `DELETE /api/factory-holidays/:date`
- `GET /api/orders`
- `POST /api/orders`
- `POST /api/orders/batch`
- `PUT /api/orders/:id`
- `DELETE /api/orders/:id`
- `POST /api/seed`

## Notes

`db.json` is a simple local database and is enough for a single user or a small internal test. For production or many concurrent users, use the PostgreSQL backend in `C:\Users\Bundit\Documents\eakkarat\backend`.
