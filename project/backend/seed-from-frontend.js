// One-time script: push all hardcoded frontend state into PostgreSQL via API
require('dotenv').config();
const http = require('http');

const BASE = `http://localhost:${process.env.PORT || 3000}`;

function post(path, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(path, BASE);
    const req = http.request({ hostname: url.hostname, port: url.port, path: url.pathname, method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve(JSON.parse(d)));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

const wc_config = {
  EE3102:{ name:'แท่นตัดเหล็ก Oil+C.H.',    workers:11, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:78 },
  EE3104:{ name:'STEP-LAP',                   workers:3,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:82 },
  EE3105:{ name:'เรียงเหล็ก',                workers:25, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:82 },
  EE3106:{ name:'ประกบแคล้มป์',              workers:3,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:82 },
  EE3107:{ name:'No Load Test',               workers:2,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:82 },
  EE3201:{ name:'พันคอยล์แรงสูง',            workers:33, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:95 },
  EE3202:{ name:'พันคอยล์แรงต่ำ',            workers:7,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:95 },
  EE3203:{ name:'พันคอยล์ Foil',             workers:11, hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:95 },
  EE3301:{ name:'ลงคอยล์+เสียบเหล็ก',       workers:11, hrs:8, ot:4, sat_hrs:4, sat_ot:4, eff:90 },
  EE3302:{ name:'ต่อสายแรงสูง+แรงต่ำ',       workers:18, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:95 },
  EE3303:{ name:'ลงถัง+เติมน้ำมัน',          workers:15, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:92 },
  EE3401:{ name:'ติดอุปกรณ์ภายนอก',         workers:11, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:82 },
  EE3402:{ name:'วงจรคอนโทรล',              workers:3,  hrs:8, ot:4, sat_hrs:4, sat_ot:0, eff:90 },
  EE3403:{ name:'ประกอบ Cast Resin',         workers:4,  hrs:8, ot:4, sat_hrs:4, sat_ot:0, eff:34 },
  EE3501:{ name:'ทำสกรู/กลึง',              workers:3,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:74 },
  EE3502:{ name:'ทำชุดดุมแท็ป',             workers:2,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:30 },
  EE3503:{ name:'ติดแท๊ป',                  workers:1,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  EE3504:{ name:'ตัดกระดาษ',               workers:6,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  EE3505:{ name:'ตัดกระดาษประกอบ',          workers:1,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:92 },
  EE3601:{ name:'ตัดไม้ประกอบ',             workers:6,  hrs:8, ot:4, sat_hrs:4, sat_ot:0, eff:90 },
  EE4201:{ name:'Ratio Test',               workers:1,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  EE4202:{ name:'Routine Test',             workers:5,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:82 },
  EE4204:{ name:'ทดสอบทั่วไป',             workers:2,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  MP5101:{ name:'เชื่อมตัวถัง',             workers:15, hrs:8, ot:4, sat_hrs:4, sat_ot:4, eff:90 },
  MP5102:{ name:'เชื่อมฝา',                workers:6,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5103:{ name:'เชื่อมแคลมป์',            workers:3,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5202:{ name:'เชื่อมอุปกรณ์',           workers:4,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5304:{ name:'เตรียมอุปกรณ์',           workers:3,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  MP5401:{ name:'ยิงทราย',                 workers:9,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  MP5402:{ name:'พ่นสี/ซ่อม',              workers:11, hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5403:{ name:'ราดสี',                   workers:11, hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  MP5404:{ name:'แต่งสี',                  workers:3,  hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  MP5601:{ name:'งานครีบ',                workers:7,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5602:{ name:'ตัด-พับอัตโนมัติ',        workers:4,  hrs:8, ot:4, sat_hrs:4, sat_ot:2, eff:90 },
  MP5603:{ name:'ตัด-พับขึ้นรูป',          workers:11, hrs:8, ot:2, sat_hrs:4, sat_ot:0, eff:90 },
  PT3701:{ name:'ผลิต TR.Power',           workers:17, hrs:8, ot:8, sat_hrs:6, sat_ot:4, eff:90 },
};

const open_load = {
  EE3102:140.75, EE3201:162.65, EE3301:458.0,  EE3302:7.75,
  EE3303:141.5,  EE3401:40.0,   EE3501:57.67,  EE3502:77.0,
  EE3503:21.5,   EE3504:8.89,   EE3505:6.25,   EE3601:193.75,
  EE4201:32.75,  EE4202:121.0,  EE4204:47.25,
  MP5101:276.62, MP5102:47.98,  MP5103:34.24,  MP5202:23.0,
  MP5304:9.16,   MP5401:50.17,  MP5402:135.79, MP5403:95.18,
  MP5404:37.25,  MP5601:74.7,   MP5602:58.14,  MP5603:61.7,
  PT3701:204.5,
};

const products = {
  'tr.50kVA': {
    label:'tr.50kVA — หม้อแปลง 50kVA', std_hrs:27.1, kva:50,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:3.0},{wc:'EE3104',name:'STEP LAP',hrs:3.25},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:4.5},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:1.5},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:0.75},
      {wc:'EE3202',name:'WOUND LAYER (LV)',hrs:2.0},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.72},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.51},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:4.75},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:3.25},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:3.88},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:1.69},{wc:'EE4201',name:'Ratio Test',hrs:0.25},
      {wc:'EE4202',name:'Routine Test',hrs:0.76},
    ]
  },
  'tr.160kVA': {
    label:'tr.160kVA — หม้อแปลง 160kVA', std_hrs:29.4, kva:160,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:3.0},{wc:'EE3104',name:'STEP LAP',hrs:3.75},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:5.25},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:1.5},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:0.83},
      {wc:'EE3202',name:'WOUND LAYER (LV)',hrs:2.5},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.75},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.49},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:5.56},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:3.75},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:4.48},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:1.81},{wc:'EE4201',name:'Ratio Test',hrs:0.25},
      {wc:'EE4202',name:'Routine Test',hrs:0.84},
    ]
  },
  'tr.300KVA': {
    label:'tr.300KVA — หม้อแปลง 300KVA', std_hrs:31.6, kva:300,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:3.25},{wc:'EE3104',name:'STEP LAP',hrs:4.0},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:5.75},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:1.6},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:1.18},
      {wc:'EE3201',name:'LAYER 2 SECTION (HV)',hrs:4.5},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.59},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.41},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:6.0},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:3.93},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:4.74},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:6.86},{wc:'EE4201',name:'Ratio Test',hrs:0.23},
      {wc:'EE4202',name:'Routine Test',hrs:0.67},
    ]
  },
  'tr.630kVA': {
    label:'tr.630kVA — หม้อแปลง 630kVA', std_hrs:32.6, kva:630,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:5.1},{wc:'EE3104',name:'STEP LAP',hrs:4.0},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:6.25},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:1.63},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:1.25},
      {wc:'EE3201',name:'LAYER 2 SECTION (HV)',hrs:5.0},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.75},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.41},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:6.9},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:5.0},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:5.0},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:12.48},{wc:'EE4201',name:'Ratio Test',hrs:0.25},
      {wc:'EE4202',name:'Routine Test',hrs:0.85},
    ]
  },
  'tr.1000kVA': {
    label:'tr.1000kVA — หม้อแปลง 1000KVA', std_hrs:38.1, kva:1000,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:4.91},{wc:'EE3104',name:'STEP LAP',hrs:4.0},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:6.75},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:1.63},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:1.47},
      {wc:'EE3201',name:'LAYER 2 SECTION (HV)',hrs:5.75},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.85},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.41},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:7.28},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:5.41},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:5.25},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:13.36},{wc:'EE4201',name:'Ratio Test',hrs:0.25},
      {wc:'EE4202',name:'Routine Test',hrs:0.84},
    ]
  },
  'tr.2000kVA': {
    label:'tr.2000kVA — หม้อแปลง 2000KVA', std_hrs:89.5, kva:2000,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:5.0},{wc:'EE3104',name:'STEP LAP',hrs:4.0},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:10.0},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:2.0},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:2.0},
      {wc:'EE3201',name:'LAYER 2 SECTION (HV)',hrs:6.5},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:0.72},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.42},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:8.5},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:7.0},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:9.5},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:17.24},{wc:'EE4201',name:'Ratio Test',hrs:0.5},
      {wc:'EE4202',name:'Routine Test',hrs:0.72},
    ]
  },
  'tr.3500kVA': {
    label:'tr.3500kVA — หม้อแปลง 3500KVA', std_hrs:94.7, kva:3500,
    ops:[
      {wc:'EE3102',name:'ตัดเหล็ก',hrs:4.5},{wc:'EE3104',name:'STEP LAP',hrs:4.0},
      {wc:'EE3105',name:'เรียงเหล็ก',hrs:12.0},{wc:'EE3106',name:'ประกบแคลมป์+พันผ้า',hrs:2.0},
      {wc:'EE3107',name:'No Load Test',hrs:0.25},{wc:'EE3203',name:'พันคอยล์ FOIL',hrs:3.0},
      {wc:'EE3201',name:'LAYER 2 SECTION (HV)',hrs:7.5},{wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:1.41},
      {wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:0.69},{wc:'EE3301',name:'ลงคอยล์+เสียบเหล็ก',hrs:11.0},
      {wc:'EE3302',name:'ต่อสายแรงสูง+แรงต่ำ',hrs:13.67},{wc:'EE3303',name:'ลงถัง+เติมน้ำมัน+ใส่อุปกรณ์',hrs:32.0},
      {wc:'EE3401',name:'ติดอุปกรณ์ภายนอก',hrs:33.59},{wc:'EE4201',name:'Ratio Test',hrs:2.0},
      {wc:'EE4202',name:'Routine Test',hrs:0.76},
    ]
  },
  'tr.7000kVA': {
    label:'Tr.7000kVA+ — หม้อแปลง 7000kVA+', std_hrs:195.5, kva:7000,
    ops:[
      {wc:'EE3601',name:'ตัดไม้ฉนวน',hrs:3.5},{wc:'EE3505',name:'ตัดกระดาษประกอบ',hrs:1.93},
      {wc:'PT3701',name:'ลงคอยล์+เสียบเหล็ก+ต่อสาย',hrs:104.62},{wc:'EE3503',name:'ติดแท็ป Off Load',hrs:4.0},
      {wc:'EE3303',name:'ลงถัง+เติมน้ำมัน',hrs:0},{wc:'PT3701',name:'จัดสาย+ลงถัง+เติมน้ำมัน',hrs:40.33},
      {wc:'EE4201',name:'Ratio Test',hrs:2.5},{wc:'EE4202',name:'Routine Test',hrs:2.5},
      {wc:'MP5101',name:'ตัวถัง+เชื่อม',hrs:40.33},{wc:'MP5402',name:'พ่นสี',hrs:5.92},
    ]
  },
  'tank.1000kva': {
    label:'ตัวถัง N.S.1000KVA', std_hrs:87.19, kva:1000,
    ops:[
      {wc:'MP5601',name:'เตรียมงานครีบ',hrs:11.66},{wc:'MP5602',name:'ตัด-พับอัตโนมัติ',hrs:1.25},
      {wc:'MP5603',name:'ตัด-พับขึ้นรูป',hrs:2.67},{wc:'MP5304',name:'เตรียมอุปกรณ์',hrs:0.5},
      {wc:'MP5101',name:'เชื่อมประกอบ+ก้นถัง+ตัวถัง',hrs:62.93},{wc:'MP5401',name:'ยิงทราย',hrs:1.43},
      {wc:'MP5402',name:'ทำสีรองพื้น',hrs:2.0},{wc:'MP5403',name:'ทำสีทับหน้า',hrs:3.5},
    ]
  },
  'tank.16000kva': {
    label:'ตัวถัง CON.16000KVA', std_hrs:183.25, kva:16000,
    ops:[
      {wc:'MP5601',name:'เตรียมงานครีบ',hrs:6.0},{wc:'MP5602',name:'ตัด-พับอัตโนมัติ',hrs:5.0},
      {wc:'MP5603',name:'ตัด-พับขึ้นรูป',hrs:6.5},{wc:'MP5304',name:'เตรียมอุปกรณ์',hrs:7.5},
      {wc:'MP5101',name:'เชื่อมประกอบ+ก้นถัง+ตัวถัง',hrs:140.0},{wc:'MP5401',name:'ยิงทราย',hrs:4.0},
      {wc:'MP5402',name:'ทำสีรองพื้น',hrs:6.75},{wc:'MP5403',name:'ทำสีทับหน้า',hrs:7.5},
    ]
  },
};

const holidays = {
  '2025-01-01':'วันขึ้นปีใหม่','2025-02-12':'วันมาฆบูชา','2025-04-06':'วันจักรี',
  '2025-04-13':'วันสงกรานต์','2025-04-14':'วันสงกรานต์','2025-04-15':'วันสงกรานต์',
  '2025-05-01':'วันแรงงานแห่งชาติ','2025-05-05':'วันฉัตรมงคล','2025-05-11':'วันวิสาขบูชา',
  '2025-06-03':'วันเฉลิมฯ พระราชินี','2025-07-10':'วันอาสาฬหบูชา','2025-07-11':'วันเข้าพรรษา',
  '2025-07-28':'วันเฉลิมฯ ร.10','2025-08-12':'วันแม่แห่งชาติ','2025-10-13':'วันคล้ายวันสวรรคต ร.9',
  '2025-10-23':'วันปิยมหาราช','2025-12-05':'วันพ่อแห่งชาติ','2025-12-10':'วันรัฐธรรมนูญ',
  '2025-12-31':'วันสิ้นปี',
  '2026-01-01':'วันขึ้นปีใหม่','2026-01-02':'ชดเชยวันขึ้นปีใหม่','2026-03-03':'วันมาฆบูชา',
  '2026-04-06':'วันจักรี','2026-04-13':'วันสงกรานต์','2026-04-14':'วันสงกรานต์',
  '2026-04-15':'วันสงกรานต์','2026-05-01':'วันแรงงานแห่งชาติ','2026-05-05':'วันฉัตรมงคล',
  '2026-05-31':'วันวิสาขบูชา','2026-06-03':'วันเฉลิมฯ พระราชินี','2026-07-28':'วันเฉลิมฯ ร.10',
  '2026-07-29':'วันอาสาฬหบูชา','2026-07-30':'วันเข้าพรรษา','2026-08-12':'วันแม่แห่งชาติ',
  '2026-10-13':'วันคล้ายวันสวรรคต ร.9','2026-10-23':'วันปิยมหาราช','2026-12-05':'วันพ่อแห่งชาติ',
  '2026-12-10':'วันรัฐธรรมนูญ','2026-12-31':'วันสิ้นปี',
};

const accepted_orders = [
  {id:'MP-001',sap_so:'2100006127',customer:'SCG',           kva:3500,  qty:1,product:'tr.3500kVA', deadline:'2026-05-30',category:'หลัก', plan_date:'2026-05-18',comment:'ลงคอยล์+ต่อสาย >> EE'},
  {id:'MP-002',sap_so:'2100006128',customer:'SCG',           kva:3500,  qty:1,product:'tr.3500kVA', deadline:'2026-05-30',category:'หลัก', plan_date:'2026-05-18',comment:'อบไล่ความชื้น >> POWER'},
  {id:'MP-003',sap_so:'2110000075',customer:'MEA',           kva:300,   qty:5,product:'tr.300KVA',  deadline:'2026-06-02',category:'หลัก', plan_date:'2026-05-18',comment:'M61-M65'},
  {id:'MP-004',sap_so:'2100006924',customer:'ไพร์ม พาวเวอร์',kva:1250, qty:1,product:'tr.3500kVA', deadline:'2026-05-29',category:'หลัก', plan_date:'2026-05-18',comment:''},
  {id:'MP-005',sap_so:'2100006940',customer:'ซีเอสเค',       kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-05-28',category:'หลัก', plan_date:'2026-05-18',comment:'PEA=29/5 ส่ง1/6'},
  {id:'MP-006',sap_so:'PEA6809-04',customer:'ไฟฟ้าเชียงราย',kva:630,  qty:1,product:'tr.3500kVA', deadline:'2026-05-28',category:'หลัก', plan_date:'2026-05-18',comment:'PEA=29/5 ส่ง=9/6'},
  {id:'MP-007',sap_so:'2100006995',customer:'เจอีซีที',      kva:630,   qty:1,product:'tr.3500kVA', deadline:'2026-05-20',category:'หลัก', plan_date:'2026-05-18',comment:'⚠ DUE เกินแล้ว'},
  {id:'MP-008',sap_so:'PEA6909-01',customer:'STOCK',         kva:160,   qty:5,product:'tr.300KVA',  deadline:'2026-05-27',category:'เสริม',plan_date:'2026-05-18',comment:''},
  {id:'MP-009',sap_so:'2110000075',customer:'MEA',           kva:300,   qty:5,product:'tr.300KVA',  deadline:'2026-06-03',category:'หลัก', plan_date:'2026-05-19',comment:'M66-M70'},
  {id:'MP-010',sap_so:'2100007044',customer:'บ.แม่สาย',     kva:100,   qty:2,product:'tr.300KVA',  deadline:'2026-05-26',category:'หลัก', plan_date:'2026-05-19',comment:'ส่ง=28พ.ค. ⚠'},
  {id:'MP-011',sap_so:'2100007045',customer:'บ.แม่สาย',     kva:160,   qty:3,product:'tr.300KVA',  deadline:'2026-05-26',category:'หลัก', plan_date:'2026-05-19',comment:'ส่ง=28พ.ค. ⚠'},
  {id:'MP-012',sap_so:'2100007047',customer:'บ.แม่สาย',     kva:400,   qty:2,product:'tr.300KVA',  deadline:'2026-05-26',category:'หลัก', plan_date:'2026-05-19',comment:'ส่ง=28พ.ค. ⚠'},
  {id:'MP-013',sap_so:'PEA6911-01',customer:'STOCK',         kva:250,   qty:5,product:'tr.300KVA',  deadline:'2026-05-28',category:'เสริม',plan_date:'2026-05-19',comment:''},
  {id:'MP-014',sap_so:'2100006730',customer:'Double A',      kva:16000, qty:1,product:'tr.16000kVA',deadline:'2027-01-20',category:'หลัก', plan_date:'2026-05-19',comment:'รอแบบ TR.5 — POWER'},
  {id:'MP-015',sap_so:'2100006442',customer:'ลินเด้',       kva:7000,  qty:1,product:'tr.16000kVA',deadline:'2026-06-30',category:'หลัก', plan_date:'2026-05-19',comment:'7000kVA POWER'},
  {id:'MP-016',sap_so:'2110000075',customer:'MEA',           kva:300,   qty:5,product:'tr.300KVA',  deadline:'2026-06-05',category:'หลัก', plan_date:'2026-05-19',comment:'M71-M75'},
  {id:'MP-017',sap_so:'2100007043',customer:'บ.แม่สาย',     kva:50,    qty:5,product:'tr.300KVA',  deadline:'2026-05-26',category:'หลัก', plan_date:'2026-05-19',comment:'ส่ง=28พ.ค. ⚠'},
  {id:'MP-018',sap_so:'2100007046',customer:'บ.แม่สาย',     kva:250,   qty:4,product:'tr.300KVA',  deadline:'2026-05-26',category:'หลัก', plan_date:'2026-05-19',comment:'ส่ง=28พ.ค. ⚠'},
  {id:'MP-019',sap_so:'2110000075',customer:'MEA',           kva:300,   qty:5,product:'tr.300KVA',  deadline:'2026-06-08',category:'หลัก', plan_date:'2026-05-21',comment:'M76-M80'},
  {id:'MP-020',sap_so:'EN69010-01',customer:'ทดลอง',        kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-30',category:'หลัก', plan_date:'2026-05-21',comment:'ทำแกนเหล็กก่อน'},
  {id:'MP-021',sap_so:'PEA6905-01',customer:'STOCK',         kva:50,    qty:5,product:'tr.300KVA',  deadline:'2026-06-02',category:'เสริม',plan_date:'2026-05-21',comment:''},
  {id:'MP-022',sap_so:'LAO6907-03',customer:'STOCK',         kva:250,   qty:5,product:'tr.300KVA',  deadline:'2026-06-05',category:'เสริม',plan_date:'2026-05-21',comment:''},
  {id:'MP-023',sap_so:'EN69025-01',customer:'ทดลอง',        kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-05',category:'Fast',  plan_date:'2026-05-21',comment:'เตรียมงานประมูล PEA'},
  {id:'MP-024',sap_so:'EN69039-01',customer:'ทดลอง',        kva:50,    qty:2,product:'tr.300KVA',  deadline:'2026-06-05',category:'Fast',  plan_date:'2026-05-21',comment:''},
  {id:'MP-025',sap_so:'2200001253',customer:'Lee Jong',      kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-12',category:'หลัก', plan_date:'2026-05-22',comment:'พิเศษ'},
  {id:'MP-026',sap_so:'2200001254',customer:'Lee Jong',      kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-12',category:'หลัก', plan_date:'2026-05-22',comment:'พิเศษ'},
  {id:'MP-027',sap_so:'2200001255',customer:'Lee Jong',      kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-12',category:'หลัก', plan_date:'2026-05-22',comment:'พิเศษ'},
  {id:'MP-028',sap_so:'2200001256',customer:'Lee Jong',      kva:1000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-12',category:'หลัก', plan_date:'2026-05-22',comment:'พิเศษ'},
  {id:'MP-029',sap_so:'2100006961',customer:'เคลียร์วา',    kva:2000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-12',category:'หลัก', plan_date:'2026-05-22',comment:'PEA=5/6 ส่ง=17/6'},
  {id:'MP-030',sap_so:'STK6915-04',customer:'STOCK',         kva:250,   qty:5,product:'tr.300KVA',  deadline:'2026-06-04',category:'เสริม',plan_date:'2026-05-22',comment:''},
  {id:'MP-031',sap_so:'LAO6907-04',customer:'STOCK',         kva:250,   qty:5,product:'tr.300KVA',  deadline:'2026-06-08',category:'เสริม',plan_date:'2026-05-22',comment:''},
  {id:'MP-032',sap_so:'STK6959-01',customer:'STOCK',         kva:2000,  qty:1,product:'tr.3500kVA', deadline:'2026-06-10',category:'เสริม',plan_date:'2026-05-23',comment:''},
  {id:'MP-033',sap_so:'STS6916-01',customer:'STOCK',         kva:800,   qty:1,product:'tr.3500kVA', deadline:'2026-06-08',category:'เสริม',plan_date:'2026-05-23',comment:'33kV'},
  {id:'MP-034',sap_so:'STK6913-03',customer:'STOCK',         kva:100,   qty:5,product:'tr.300KVA',  deadline:'2026-06-04',category:'เสริม',plan_date:'2026-05-23',comment:''},
  {id:'MP-035',sap_so:'STK6912-03',customer:'STOCK',         kva:50,    qty:5,product:'tr.300KVA',  deadline:'2026-06-04',category:'เสริม',plan_date:'2026-05-23',comment:''},
  {id:'MP-036',sap_so:'2100006880',customer:'แมคทริค',      kva:2500,  qty:1,product:'tr.3500kVA', deadline:'2026-05-27',category:'หลัก', plan_date:'2026-05-23',comment:'ส่ง=10/6 ⚠'},
  {id:'MP-037',sap_so:'2100006881',customer:'แมคทริค',      kva:2500,  qty:1,product:'tr.3500kVA', deadline:'2026-05-27',category:'หลัก', plan_date:'2026-05-23',comment:'ส่ง=10/6 ⚠'},
];

async function run() {
  console.log('Pushing frontend state to PostgreSQL...');
  const result = await post('/api/snapshot', {
    wc_config,
    products,
    open_load,
    holidays,
    factory_holidays: {},
    accepted_orders,
  });
  console.log('wc_config:', Object.keys(result.wc_config).length, 'rows');
  console.log('products:', Object.keys(result.products).length, 'rows');
  console.log('open_load:', Object.keys(result.open_load).length, 'rows');
  console.log('holidays:', Object.keys(result.holidays).length, 'rows');
  console.log('accepted_orders:', result.accepted_orders.length, 'rows');
  console.log('Done.');
}

run().catch(e => { console.error(e.message); process.exit(1); });
