import type { Product } from '../types'

export const PRODUCTS: Record<string, Product> = {
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
  'tr.16000kVA': {
    label:'Tr.16000kVA — หม้อแปลง Power 16000kVA+', std_hrs:195.5, kva:16000,
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
}
