# SAP Routing — What Was Built

> Last updated: 2026-06-05
> Data table: `sap_routing` (PostgreSQL)
> Frontend: `frontend-react/src/tabs/CatalogTab/index.tsx`
> Backend: `backend/server.js`

---

## What Is SAP Routing

SAP Routing is the production routing data imported from SAP — each row is one operation on one material:

| Column | Description |
|--------|-------------|
| `order_no` | SAP production order number |
| `material_code` | SAP material code (e.g. `5143502228`) |
| `wc_id` | Work center ID (e.g. `EE3102`, `EE3201`) |
| `operation` | Operation name (e.g. `ตัดเหล็ก`, `พันคอยล์`) |
| `std_hrs` | Standard hours for this operation |
| `is_confirmed` | Whether operation is confirmed in SAP |
| `plant` | Plant code |
| `extra` | JSON with `MaterialDescription` (contains kVA e.g. "เหล็กแกน **3500KVA** ...") |

---

## Import

**Tab:** Import → SAP
- Upload SAP_Routing.csv (44-column export from SAP)
- Batch-inserts into `sap_routing` table
- All 44 columns saved (core 7 as dedicated columns, rest in `extra` JSONB)

---

## API Endpoints Built

### GET `/api/sap-routing`
**Query params:** `wc_id` (optional), `order_no` (optional)
Returns raw rows filtered by work center or order number.

---

### GET `/api/sap-routing/catalog`
Groups by `material_code` + `wc_id`, returns each material with its operations averaged:

```json
[
  {
    "mat": "5143502228",
    "desc": "เหล็กแกน 3500KVA 22000-416/240V",
    "plant": "1000",
    "total_hrs": 94.7,
    "ops": [
      { "wc": "EE3102", "op": "ตัดเหล็ก", "hrs": 4.5, "rows": 12 },
      { "wc": "EE3201", "op": "พันคอยล์แรงสูง", "hrs": 7.5, "rows": 12 }
    ]
  }
]
```

Used by: **📦 Product Catalog → ⚙️ SAP Routing** tab

---

### GET `/api/sap-routing/by-kva?kva=3500`
Extracts kVA from `extra.MaterialDescription` and groups all matching materials' operations.
Returns averaged hours per work center across all materials of that kVA size:

```json
{
  "kva": 3500,
  "total_hrs": 94.7,
  "ops": [
    { "wc": "EE3102", "op": "ตัดเหล็ก", "hrs": 4.5, "materials": 8 },
    { "wc": "EE3201", "op": "พันคอยล์แรงสูง", "hrs": 7.5, "materials": 8 }
  ]
}
```

Used by: **📦 Product Catalog → click any product** → right panel shows real SAP routing

---

### GET `/api/sap-routing/rates-by-kva?wc_id=EE3102`
Extracts kVA from `MaterialDescription`, groups by kVA, averages `std_hrs`.
Used to load cutting rates for **⏱ เวลาตัดโลหะตามขนาด (มาตรฐาน)**:

```json
[
  { "kva": 50,   "hrs": 1.5,  "count": 45 },
  { "kva": 160,  "hrs": 1.5,  "count": 38 },
  { "kva": 3500, "hrs": 4.5,  "count": 12 }
]
```

Used by: **🏭 แผนก → ⏱ เวลาตัดโลหะตามขนาด → ดูตัวอย่าง (EE3102)**

---

### GET `/api/sap-routing/summary`
Returns operation count, total hours, and confirmed count per work center:

```json
[
  { "wc_id": "EE3102", "op_count": 277, "total_std_hrs": 1244.5, "confirmed": 277 }
]
```

---

## Frontend Features Built

### 1. ⚙️ SAP Routing View (in Product Catalog)
**Location:** 📦 Product Catalog → click **⚙️ SAP Routing** button

Shows all material codes from `sap_routing` with:
- Material code + SAP description
- Total hours + operation count + plant
- Work center badges (inline preview)
- Search by material code, description, WC, or operation name
- Click any row → detail panel with all operations + WC name + avg hrs

### 2. Real SAP Routing in Product Detail
**Location:** 📦 Product Catalog → click any product card → right panel

When a product is selected (e.g. `tr.3500kVA`):
1. Fetches `/api/sap-routing/by-kva?kva=3500`
2. Shows **⚙ SAP Routing (Actual)** section in green — real averaged data from SAP
3. Falls back to **📦 Product Catalog Routing** (static) only if no SAP data found

### 3. Cutting Rates from SAP
**Location:** 🏭 แผนก → ⏱ เวลาตัดโลหะตามขนาด (มาตรฐาน)

- Select **EE3102 (277 ops)** → click **📥 ดูตัวอย่าง**
- Extracts kVA → hours mapping from SAP routing
- Loads into global cutting rates used by all 21 scheduling modes

---

## Data Flow

```
SAP_Routing.csv (44 columns)
    ↓ Import → SAP tab
sap_routing table (11,388+ rows)
    ↓
/api/sap-routing/catalog         → ⚙️ SAP Routing view
/api/sap-routing/by-kva          → Product detail real routing
/api/sap-routing/rates-by-kva    → Global cutting rates (EE3102)
/api/sap-routing/summary         → Summary per WC
```

---

## Work Centers in SAP Routing (common)

| WC | Name | Purpose |
|----|------|---------|
| EE3102 | แท่นตัดเหล็ก | Metal cutting — used for cutting rates |
| EE3104 | STEP-LAP | Step-lap stacking |
| EE3105 | เรียงเหล็ก | Iron core assembly |
| EE3106 | ประกบแคล้มป์ | Clamp assembly |
| EE3107 | No Load Test | No-load test |
| EE3201 | พันคอยล์แรงสูง | HV coil winding |
| EE3203 | พันคอยล์ Foil | Foil coil winding |
| EE3301 | ลงคอยล์+เสียบเหล็ก | Core-coil assembly |
| EE3302 | ต่อสายแรงสูง+แรงต่ำ | HV/LV lead connection |
| EE3303 | ลงถัง+เติมน้ำมัน | Tank assembly + oil fill |
| EE3401 | ติดอุปกรณ์ภายนอก | External fittings |
| EE4201 | Ratio Test | Ratio test |
| EE4202 | Routine Test | Routine test |

---

## Known Limitations

- `by-kva` endpoint matches kVA using regex on `MaterialDescription` — may miss materials with non-standard descriptions
- Hours shown are **averages** across all matching materials — individual transformers may vary
- `sap_routing` has no plan_date — it's a catalog of standard operations, not a schedule
